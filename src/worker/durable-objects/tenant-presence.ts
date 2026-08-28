import {type Connection, type ConnectionContext, Server, type WSMessage} from "partyserver";
import {verifyToken} from "@clerk/backend";
import type {Env} from "../types";

/**
 * Tenant presence, as a Durable Object inside the ArdhiFlow Worker.
 *
 * Room = Clerk org id (the DO instance name, `this.name`) — the client
 * connects with `room: organization.id`, so tenant A and tenant B are
 * physically different DO instances. Nothing shared to leak between them.
 *
 * Mounted under /api/party/* in src/worker/index.ts — NOT /party/* — because
 * wrangler.jsonc's `assets.run_worker_first` is scoped to `["/api/*"]`.
 * Anything outside that prefix gets intercepted by the Assets binding and
 * `not_found_handling: "single-page-application"` before it ever reaches
 * this Worker's fetch handler, which would silently return the SPA shell
 * instead of upgrading the websocket. Keep this under /api/*.
 */

type PresenceUser = {
    connectionId: string;
    userId: string;
    name: string;
    imageUrl?: string;
    email?: string;
    connectedAt: number;
    lastSeen: number;
    status?: "active" | "away";
};

// Client pings every HEARTBEAT_INTERVAL_MS (see use-tenant-presence.ts —
// keep both in sync). A connection that's gone quiet for longer than
// STALE_TIMEOUT_MS gets closed by the next sweep, even if the platform
// hasn't (yet, or ever) noticed the underlying socket is actually dead —
// this is what catches an unclean disconnect (killed tab, dropped wifi,
// laptop sleep) that never sends a close frame.
const STALE_TIMEOUT_MS = 50_000; // ~2.5x the client's heartbeat interval
const SWEEP_INTERVAL_MS = 25_000;

export class TenantPresence extends Server<Env> {
    // Sleep when no one's connected — zero duration billing for idle tenants.
    static options = {hibernate: true};

    onConnect(connection: Connection<PresenceUser>, ctx: ConnectionContext) {
        const userId = ctx.request.headers.get("X-User-Id");
        if (!userId) {
            connection.close(1008, "Missing user identity");
            return;
        }

        const url = new URL(ctx.request.url);
        const presence: PresenceUser = {
            connectionId: connection.id,
            userId,
            name: url.searchParams.get("name") ?? "Unknown user",
            imageUrl: url.searchParams.get("imageUrl") ?? undefined,
            email: url.searchParams.get("email") ?? undefined,
            connectedAt: Date.now(),
            lastSeen: Date.now(),
        };

        connection.setState(presence);

        connection.send(JSON.stringify({type: "presence", users: this.getRoster()}));
        this.broadcastRoster();

        // Make sure a sweep is running now that there's at least one
        // connection to watch. setAlarm() replaces any pending alarm rather
        // than stacking, so this is safe to call on every connect.
        void this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    }

    onClose() {
        this.broadcastRoster();
    }

    onError(_connection: Connection<PresenceUser>, error: unknown) {
        console.error(`Presence connection error in room ${this.name}:`, error);
        this.broadcastRoster();
    }

    onMessage(connection: Connection<PresenceUser>, message: WSMessage) {
        if (typeof message !== "string") return; // presence protocol is JSON-over-text only
        if (!connection.state) return;

        try {
            const parsed = JSON.parse(message) as { type?: string; status?: string };

            if (parsed.type === "ping") {
                connection.setState({...connection.state, lastSeen: Date.now()});
                return;
            }

            if (parsed.type === "status") {
                connection.setState({
                    ...connection.state,
                    lastSeen: Date.now(),
                    status: parsed.status as "active" | "away",
                });
                this.broadcastRoster();
            }
        } catch {
            // ignore malformed messages
        }
    }

    // Runs on the schedule set by onConnect's setAlarm(). Closes any
    // connection that's missed too many heartbeats, then reschedules itself
    // only if connections remain — an empty room just goes back to sleep
    // (hibernation) instead of ticking forever for no one.
    async onAlarm() {
        const now = Date.now();
        let closedAny = false;

        for (const conn of this.getConnections<PresenceUser>()) {
            if (conn.state && now - conn.state.lastSeen > STALE_TIMEOUT_MS) {
                conn.close(1000, "Stale connection (missed heartbeat)");
                closedAny = true;
            }
        }

        if (closedAny) this.broadcastRoster();

        const stillConnected = [...this.getConnections()].length > 0;
        if (stillConnected) {
            await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
        }
    }

    private getRoster(): PresenceUser[] {
        const seen = new Map<string, PresenceUser>();
        for (const conn of this.getConnections<PresenceUser>()) {
            if (conn.state) seen.set(conn.state.userId, conn.state);
        }
        return Array.from(seen.values()).sort((a, b) => a.connectedAt - b.connectedAt);
    }

    private broadcastRoster() {
        this.broadcast(JSON.stringify({type: "presence", users: this.getRoster()}));
    }
}

/**
 * Edge auth guard for the presence websocket. Mirrors clerkAuth() in
 * src/worker/middleware/clerk-auth.ts (same verifyToken({ secretKey, jwtKey })
 * call, same reliance on the `org_id` custom session claim), but reads the
 * token from a query param instead of an Authorization header — the browser
 * WebSocket API can't set custom headers on the upgrade request, so the
 * client attaches `?token=<sessionToken>` instead (see use-tenant-presence.ts).
 */
export async function verifyPresenceConnection(
    request: Request,
    roomId: string,
    env: Pick<Env, "CLERK_SECRET_KEY" | "CLERK_JWT_KEY">
): Promise<Request | Response> {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token) return new Response("Missing token", {status: 401});

    try {
        const claims = await verifyToken(token, {
            secretKey: env.CLERK_SECRET_KEY,
            jwtKey: env.CLERK_JWT_KEY,
        });

        const orgId = claims.org_id as string | undefined;
        if (!orgId || orgId !== roomId) {
            return new Response("Forbidden: org mismatch", {status: 403});
        }

        request.headers.set("X-User-Id", claims.sub);
        return request;
    } catch {
        return new Response("Unauthorized", {status: 401});
    }
}