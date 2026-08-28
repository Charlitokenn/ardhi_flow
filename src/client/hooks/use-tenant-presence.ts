import {useCallback, useState} from "react";
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
        query: async () => ({
            token: (await getToken()) ?? "",
            name: user?.fullName ?? user?.username ?? "Unknown user",
            imageUrl: user?.imageUrl ?? "",
            email: user?.primaryEmailAddress?.emailAddress ?? "",
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