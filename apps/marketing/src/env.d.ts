declare namespace App {
    interface Locals {
        /** ISO 3166-1 alpha-2 visitor country, set by src/middleware.ts on on-demand pages. */
        countryCode?: string;
    }
}
