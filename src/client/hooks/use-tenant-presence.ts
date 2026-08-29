import {useCallback, useEffect, useState} from "react";
import {useAuth, useOrganization, useUser} from "@clerk/react";
import usePartySocket from "partysocket/react";

export type PresenceUser = {
    connectionId: string;
    userId: string;
    name: string;
    imageUrl?: string;
    email?: string;
    connectedAt: number;
    status?: "active" | "away";
};

type PresenceMessage = { type: "presence"; users: PresenceUser[] };

// Must stay well under the server's STALE_TIMEOUT_MS in
// src/worker/durable-objects/tenant-presence.ts (currently 50s) — a
// missed ping or two shouldn't drop someone, only real silence should.
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Tracks who's online in the current tenant (Clerk organization).
 *
 * Connects same-origin to the presence Durable Object mounted at
 * /api/party/tenant-presence/:orgId (see src/worker/index.ts) — no host to
 * configure, host defaults to window.location.host.
 *
 * `room` and `enabled` are both watched by usePartySocket itself: it
 * automatically creates a fresh connection when `room` changes (e.g. the
 * user switches orgs via TeamSwitcher) and connects/disconnects cleanly
 * when `enabled` flips — no manual reconnect() call needed here.
 */
export function useTenantPresence() {
    const {getToken, isSignedIn} = useAuth();
    const {organization, isLoaded: orgLoaded} = useOrganization();
    const {user} = useUser();
    const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

    const enabled = Boolean(isSignedIn && orgLoaded && organization?.id && user);

    const socket = usePartySocket({
        party: "tenant-presence", // kebab-case of the TENANT_PRESENCE binding name
        prefix: "api/party", // matches partyserverMiddleware({ options: { prefix: "api/party" } })
        room: organization?.id ?? "no-org",
        enabled,
        // Only the session token goes over the wire — name/imageUrl/email
        // are deliberately NOT sent here. The server derives them itself
        // from a verified Clerk lookup on the token's subject (see
        // verifyPresenceConnection in tenant-presence.ts) rather than
        // trusting whatever this client claims, so a connection can't put
        // an arbitrary name/photo into another org member's roster.
        query: async () => ({
            token: (await getToken()) ?? "",
        }),
        onMessage(event) {
            try {
                const data = JSON.parse(event.data) as PresenceMessage;
                if (data.type === "presence") {
                    setOnlineUsers(data.users);
                }
            } catch {
                // ignore malformed frames
            }
        },
        onClose() {
            setOnlineUsers([]);
        },
    });

    // Tells the server this connection is still alive — see the module
    // comment above and STALE_TIMEOUT_MS/onAlarm in the presence Durable
    // Object. This is what makes an unclean disconnect (killed tab, dropped
    // wifi, laptop sleep with no close frame) get noticed within a bounded
    // time instead of leaving someone showing as online indefinitely.
    useEffect(() => {
        if (!enabled) return;
        const interval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({type: "ping"}));
            }
        }, HEARTBEAT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [socket, enabled]);

    const setStatus = useCallback(
        (status: "active" | "away") => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({type: "status", status}));
            }
        },
        [socket]
    );

    return {
        // Excludes the current user — their own avatar already shows via
        // Clerk's <UserButton/> right next to this, so the roster the server
        // sends (which does include everyone) is filtered down to "others"
        // here rather than on the server, in case some other consumer of this
        // hook later wants the full roster including self.
        onlineUsers: onlineUsers.filter((u) => u.userId !== user?.id),
        isConnected: enabled && socket.readyState === WebSocket.OPEN,
        setStatus,
    };
}
