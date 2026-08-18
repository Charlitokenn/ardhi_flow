# 0001. Rationale: finishing the contacts feature

## Context

Contacts (scope feature 4) already has a working list, create, and edit flow. Two pieces were left unbuilt: a real view screen, and client statement generation. While picking this up, in progress, uncommitted code was found that already scaffolds most of both: `view-contact-form.tsx` has a working tabs layout (Overview, Client Statement) and `client-statement.tsx` is a full `@react-pdf/renderer` document, wired into a `<PDFViewer>`. But the wiring has real gaps, not just polish:

- The grid's view sheet passes the row being *edited* into the view form, not the row being *viewed*.
- The view form expects a `ClientContact` type (contact plus nested plots, each plot's project, contracts, payments, installments) that no endpoint returns; `ClientContact` itself is not defined anywhere in the codebase.
- The statement needs company branding (name, logo, slogan, colors, contact details) that has zero data source: the code has a literal placeholder, `const res = [] //await getCurrentTenantFromCatalog()`.
- Sales agent and account rep fields are hardcoded or blank.
- A second document, "Confirmation Letter", has a button with no document behind it.
- The CSV bulk contact importer UI is fully built but its submit handler is a `//TODO: ADD Bulk create api call`.

Beyond wiring, this raises one architectural question: contacts is the first feature in this project that needs organization level branding data, and the first that needs a second PDF document. Both should be designed once, not per document.

## Scope note

This topic spans five separately buildable pieces (branding settings, contact detail data, statement, confirmation letter, CSV import). Rather than five separate `/architect` runs, they are captured here as one umbrella because four of them share the same two building blocks (branding data, contact detail data) and the fifth (CSV import) is small enough to ride along in the same pass at the engineer's request.

## Options considered

### Option 1: One umbrella spec, five child specs (chosen)

Capture the shared building blocks once (branding, contact detail data) and let each of the five pieces be its own short, buildable child spec.

**Pros**:
- The shared contract (branding shape, contact detail endpoint, latest-contract rule) is written once and referenced everywhere, instead of drifting across four separate specs.
- Each child is still small enough that `/develop` can build and `/check verify` can check it independently.

**Cons**:
- More files to navigate than a single flat spec; `/develop` has to read the umbrella's `## Structure` before picking a child to build.

### Option 2: One flat spec covering everything

Write a single, long spec with every decision inline.

**Pros**:
- One file to open.

**Cons**:
- Five genuinely independent build efforts (different files, different endpoints, no shared code path between, say, the CSV importer and the confirmation letter) forced into one document becomes unscannable, and violates the one-decision-per-spec rule this workflow follows.

### Option 3: Five independent specs, no umbrella

Treat each piece as its own top level spec, with no shared parent.

**Pros**:
- Slightly simpler mental model, no directory nesting.

**Cons**:
- The shared branding shape and the contact detail endpoint would need to be decided in whichever spec is written first, then copied (and likely drift) into the other four; there would be no single place recording that all four documents must read branding the same way.

## Rationale

Option 1 wins because branding data and contact detail data are genuinely shared dependencies, not coincidental overlap: both the statement and the confirmation letter render the same company header and pull from the same contract, and both would silently diverge if specified twice. The umbrella records that sharing once; the children stay small and independently buildable, matching this project's Tracer Bullet approach of proving one thin thread at a time rather than building one layer across everything at once.
