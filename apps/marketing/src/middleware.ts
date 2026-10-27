import { defineMiddleware } from "astro:middleware";

// Visitor country for country-aware pricing (Tanzania gets local pricing).
// Cloudflare geolocates every request; prerendered pages have no request, so
// they fall back to the components' own "US" default.
export const onRequest = defineMiddleware((context, next) => {
    if (!context.isPrerendered) {
        const cf = (context.request as Request & { cf?: { country?: string } }).cf;
        context.locals.countryCode = cf?.country ?? context.request.headers.get("cf-ipcountry") ?? undefined;
    }
    return next();
});
