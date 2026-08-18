# 0005. Contacts CSV bulk import

## Summary

The CSV uploader UI for bulk-adding contacts is fully built but its submit handler is a stub. This adds the bulk-create endpoint it needs: each row is saved independently, a duplicate mobile number (against existing contacts or another row in the same file) is skipped rather than overwritten, and the import ends with a per-row summary.

## Context

`contacts/index.tsx` already wires `ReusableCSVUploader` with the full `contactFields` column configuration (matching the contacts schema's insertable fields and enums), but its `onSubmit` is `//TODO: ADD Bulk create api call` with a second TODO to validate enum values before import. There is no bulk-create endpoint; today's `POST /api/contacts` only accepts one contact per call. `ReusableCSVUploader`'s `onSubmit` prop is currently typed `(rows: TInsert[]) => Promise<void> | void` and the component itself always shows a generic "{entityName} imported" toast right after `onSubmit` resolves; it has no way to receive or display a per-row created/skipped/failed breakdown today, so this spec's per-row summary (AC-2 to AC-4) requires a small change to the shared uploader component, not just to `contacts/index.tsx`. Separately, `contactFields` declares `firstNOKRelationship`/`secondNOKRelationship` as `type: "string"`, but the database's `RELATIONSHIP_ENUM` only allows `PARENT | SIBLING | SPOUSE | FRIEND | OTHER`; a CSV value outside that list will fail server side validation with no clear error today.

## Requirements

**User stories**:
- As a staff member, I want to import many contacts at once from a CSV file, so I don't have to add them one by one.
- As a staff member, I want to know exactly which rows were imported, skipped, or failed, so I can fix and re-import only the problem rows.

**Acceptance criteria**:
- **AC-1**: Submitting a valid CSV file creates one contact per valid row and reports how many were created.
- **AC-2**: A row whose mobile number matches an existing, non deleted contact's mobile number (compared by digits only, ignoring formatting) is skipped (not created, not updated), and reported as skipped with the reason "Mobile number already exists".
- **AC-3**: A row whose mobile number (by the same digits-only comparison) matches an earlier row in the same file is also skipped, keeping only the first occurrence, reported as skipped with the reason "Duplicate mobile number in file".
- **AC-4**: A row missing a required field (`fullName`, `mobileNumber`, `contactType`) or with an invalid enum value (`contactType`, `gender`, `idType`, `firstNOKRelationship`, `secondNOKRelationship`) is not created; it is reported as failed with the validation library's per-field reason, and does not stop the rest of the file from importing.
- **AC-5**: The contacts list (`GET /api/contacts`, and the grid's cached query) reflects the newly created contacts immediately after a successful import.
- **AC-6**: After an import finishes, the uploader shows the created/skipped/failed counts and, for each non created row, its reason, instead of the current generic "X imported" toast.

## Decision

**Chosen option**: a new `POST /api/contacts/bulk` endpoint accepting an array of row objects (already parsed and validated client side against `contactFields`'s enum lists by the existing uploader component), validating and inserting each row independently server side too, and returning a per-row result array.

An all-or-nothing transactional import (reject the whole file if any row is invalid or duplicate) was considered and rejected per the engineer's explicit choice: a large CSV commonly has a few bad rows, and forcing a full re-upload to fix one typo is worse than importing the good rows and reporting the rest.

## Feature design

**Data model sketch**: no schema change; inserts into the existing `contacts` table, one row per valid CSV row.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/contacts/bulk | POST (registered before `/:id` so `"bulk"` is never read as an id) | `{ rows: BulkContactRow[] }`, `BulkContactRow` = `insertContactSchema` with `fullName`, `mobileNumber`, `contactType` required and `id`, `createdAt`, `updatedAt`, `isDeleted` omitted (server controlled, never accepted from the client) | `{ created: number, results: [{ row: number, status: "created" \| "skipped" \| "failed", reason?: string, id?: string }] }` | any authed org member | 400 if `rows` is missing, not an array, or empty; otherwise always 200 (per-row problems are reported in `results`, they never fail the whole request) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Bulk import | which rows are duplicates against the DB | existing `contacts` rows where `isDeleted = false`, mobile numbers compared with non digit characters stripped from both sides |
| Bulk import | which rows duplicate an earlier row in the file | the same digits-only comparison against every prior row already processed in this request, first occurrence wins |
| Bulk import | which rows fail validation | the same `insertContactSchema` (drizzle-zod, already used by `POST /api/contacts`) applied per row, so bulk validation never drifts from single-create validation; its returned field errors become each failed row's `reason` |
| Import summary UI | created/skipped/failed counts and reasons | the endpoint's `results` array; `ReusableCSVUploader` is extended so `onSubmit` may return this summary (a new optional return type alongside its current `Promise<void> \| void`), and the component renders it instead of its generic toast when a summary is returned |

**Key invariants**: a bulk import never partially creates a row (each row either fully succeeds or is skipped/failed); one bad row never rejects the rest of the file.

**Security model**: standard `clerkAuth()` → `tenantResolver()`, any authed org member (matches the existing single-contact `POST /api/contacts`, which has no extra restriction today).

**Critical test scenarios**:
- Happy path: a 20 row CSV with all valid, unique rows imports all 20, reports `created: 20`, and the uploader shows that count instead of a generic toast, verifies **AC-1**, **AC-6**
- Failure case: a CSV with one row missing `fullName`, one duplicating an existing contact's mobile number, and one duplicating another row's mobile number still imports every other valid row, and the uploader lists each problem row's reason, verifies **AC-2**, **AC-3**, **AC-4**, **AC-6**
- Auth/permission: not applicable beyond the standard authed write already covering `POST /api/contacts`

## Build plan

1. Add `POST /api/contacts/bulk` to `src/worker/routes/contacts.ts`, registered ahead of the `/:id` routes, validating each row with the existing `insertContactSchema`, checking mobile number duplicates (digits-only, non deleted only) against the DB and within the request, and inserting valid, non duplicate rows, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
2. Fix `contactFields`'s `firstNOKRelationship`/`secondNOKRelationship` entries in `contacts/index.tsx` from `type: "string"` to `type: "enum"` with `RELATIONSHIP_ENUM`'s values, satisfies **AC-4**
3. Extend `ReusableCSVUploader` to accept an `onSubmit` that may return `{ created: number, results: [...] } | void`, and render a results view (counts + per-row reasons) when a summary is returned, instead of always showing the generic toast, satisfies **AC-6**
4. Wire `contacts/index.tsx`'s `ReusableCSVUploader.onSubmit` to call the bulk endpoint, return its summary, and invalidate the `["contacts"]` query when `created > 0`, satisfies **AC-1**, **AC-5**, **AC-6**

## Consequences

**Positive**: the already built CSV uploader becomes fully functional; partial success means one bad row never blocks an otherwise good import.

**Negative / tradeoffs**: a very large file means a large `results` array in the response; acceptable at this project's expected contact-list scale (no pagination-scale CSV imports anticipated).

**Neutral**: enum validation is enforced by the same schema `POST /api/contacts` already uses, so the "validate against correct enums" TODO in `contacts/index.tsx` is resolved by reuse, not a second validation layer.

## Follow-up

None.
