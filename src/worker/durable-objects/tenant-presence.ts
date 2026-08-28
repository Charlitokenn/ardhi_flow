import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { verifyToken } from "@clerk/backend";
import type { Env } from "../types";

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
  status?: "active" | "away";
};

export class TenantPresence extends Server<Env> {
  // Sleep when no one's connected — zero duration billing for idle tenants.
  static options = { hibernate: true };

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
    };

    connection.setState(presence);

    connection.send(JSON.stringify({ type: "presence", users: this.getRoster() }));
    this.broadcastRoster();
  }

  onClose(connection: Connection<PresenceUser>, _code: number, _reason: string, _wasClean: boolean) {
    this.broadcastRoster();
  }

  onError(connection: Connection<PresenceUser>, error: unknown) {
    console.error(`Presence connection error in room ${this.name}:`, error);
    this.broadcastRoster();
  }

  onMessage(connection: Connection<PresenceUser>, message: WSMessage) {
    if (typeof message !== "string") return; // presence protocol is JSON-over-text only

    try {
      const parsed = JSON.parse(message) as { type?: string; status?: string };
      if (parsed.type === "status" && connection.state) {
        connection.setState({ ...connection.state, status: parsed.status as "active" | "away" });
        this.broadcastRoster();
      }
    } catch {
      // ignore malformed messages
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
    this.broadcast(JSON.stringify({ type: "presence", users: this.getRoster() }));
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
  if (!token) return new Response("Missing token", { status: 401 });

  try {
    const claims = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
    });

    const orgId = claims.org_id as string | undefined;
    if (!orgId || orgId !== roomId) {
      return new Response("Forbidden: org mismatch", { status: 403 });
    }

    request.headers.set("X-User-Id", claims.sub);
    return request;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
