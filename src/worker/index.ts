import {Hono} from "hono";
import {logger} from "hono/logger";
import {partyserverMiddleware} from "hono-party";
import type {Env, Variables} from "./types.ts";
import {clerkAuth} from "./middleware/clerk-auth";
import {tenantResolver} from "./middleware/tenant-resolver";
import webhooksRoute from "./routes/webhooks/clerk";
import healthRoute from "./routes/health";
import plotsRoute from "./routes/plots";
import contactsRoute from "./routes/contacts";
import projectsRoute from "./routes/projects";
import accountsRoute from "./routes/accounts";
import contractsRoute from "./routes/contracts";
import paymentsRoute from "./routes/payments";
import expensesRoute from "./routes/expenses";
import dashboardRoute from "./routes/dashboard";
import companySettingsRoute from "./routes/company-settings";
import installmentsRoute from "./routes/installments";
import {handleTenantProvisionQueue, type ProvisionTenantMessage,} from "./queue/provision-tenant";
import {TenantPresence, verifyPresenceConnection} from "./durable-objects/tenant-presence";

// Re-exported so wrangler can find the Durable Object class named in
// wrangler.jsonc's durable_objects binding (class_name: "TenantPresence").
export {TenantPresence};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", logger());

// Presence websocket — mounted under /api/party/* (NOT /party/*) so it
// falls under wrangler.jsonc's `assets.run_worker_first: ["/api/*"]` and
// actually reaches this Worker instead of being intercepted by the SPA
// fallback. onBeforeConnect verifies the Clerk JWT and checks it matches
// the tenant room being joined before the Durable Object ever runs.
app.use(
    "*",
    partyserverMiddleware<{ Bindings: Env; Variables: Variables }>({
        options: {
            prefix: "api/party",
            onBeforeConnect: async (req, lobby, c) => {
                return verifyPresenceConnection(req, lobby.name, c.env);
            },
        },
    })
);

// Public — webhooks verify their own signature; health needs no auth.
app.route("/api/webhooks", webhooksRoute);
app.route("/api/health", healthRoute);

// Everything else under /api requires a verified Clerk session with an
// active org, then gets a tenant-scoped Drizzle client attached to context.
const authed = new Hono<{ Bindings: Env; Variables: Variables }>()
    .use("*", clerkAuth())
    .use("*", tenantResolver())
    .route("/plots", plotsRoute)
    .route("/contacts", contactsRoute)
    .route("/projects", projectsRoute)
    .route("/accounts", accountsRoute)
    .route("/contracts", contractsRoute)
    .route("/payments", paymentsRoute)
    .route("/expenses", expensesRoute)
    .route("/dashboard", dashboardRoute)
    .route("/company-settings", companySettingsRoute)
    .route("/installments", installmentsRoute);

const routes = app.route("/api", authed);

// Exported for the frontend's Hono RPC client: `hc<AppType>(baseUrl)` gives
// fully typed requests/responses with zero codegen. See src/client's API
// client setup.
export type AppType = typeof routes;

export default {
    fetch: routes.fetch,
    queue: handleTenantProvisionQueue,
} satisfies ExportedHandler<Env, ProvisionTenantMessage>;
