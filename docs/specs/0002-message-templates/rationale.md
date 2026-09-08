## Context

The messaging feature (`sms_campaigns`, `sms_messages`, `sms_delivery_events` tables) is fully modeled in the database
but has no working send flow yet (`../../scope/scope.md`, feature 10), and the compose screen (`broadcast-flow.tsx`) is
an unwired prototype with placeholder data. Today, a campaign's message body (`sms_campaigns.templateBody`) is a single
free text field typed fresh each time. Its own code comment already sketches a stand in value idea (`{clientName}`,
`{plotNumber}`, `{amountDue}`, `{dueDate}`), but nothing ever implemented it, and it assumes exactly one payment
installment per message.

Real client accounts do not fit that one installment assumption. `contractInstallments` generates one full schedule per
plot in a contract (a multi plot contract shares one due date and installment number across its plots, but a different
amount per plot), so "installment 3 for this client" can already mean several database rows. A client can also hold more
than one active `plotSaleContracts` row across different projects at once. A correct payment reminder needs to name the
exact plot numbers, amount, and project actually owed, and the engineer confirmed staff want one clear message per
client per timing (past due / due today / upcoming), not one message per plot or per contract.

Without a template library, every reminder is retyped by hand, wording drifts between staff members, and there is no
starting point for the three reminder types the business already sends informally. Building this now, ahead of the full
send flow, lets the templates and their rendering be written and proven against real client data before the larger
NextSMS integration (audience selection, scheduling, delivery tracking) is designed as its own decision.

## Options considered

### Option 1: Flat single value tokens, one message per due installment

Keep the shape the existing `templateBody` comment already sketches: `{clientName}`, `{plotNumber}`, `{amountDue}`,
`{dueDate}`, one message sent per installment row.

**Pros**:

- Simplest possible token set and render function; no grouping logic needed.
- Matches the code comment already sitting in the schema.

**Cons**:

- Fails the engineer's stated requirement directly: a client with two due plots on one contract, or two active
  contracts, would get two or three separate messages instead of one combined one.

### Option 2: A due items block token, grouped and combined into one message (chosen)

Keep the greeting and closing as free, admin authored text, but represent "what is owed" as a single `{dueItems}` token
that expands into one system formatted line per contract and installment number, all combined into one message.

**Pros**:

- Matches the requirement exactly: one message per client per timing group, however many plots or contracts are
  involved.
- The per line wording stays consistent and correct (right amount, right plot list, right project) since staff never
  hand type it.

**Cons**:

- A client with several simultaneous due contracts gets a longer message, which costs more SMS segments; there is no
  length cap in this spec (see Consequences in index.md).
- Slightly more building than Option 1: a grouping query and a small per timing line formatter, not just string
  substitution.

### Option 3: Fully custom, author written repeating line

Let the admin write the repeating due item line themselves, with its own tokens, instead of a fixed system format.

**Pros**:

- Maximum wording flexibility per template.

**Cons**:

- Meaningfully more building (a small nested template syntax, and a second render pass) for a flexibility the engineer
  explicitly said is not needed; every extra knob is one more way the message can render oddly, and one more thing
  `/develop` and `/test` have to cover.

## Rationale

Option 2 is the direct implementation of two constraints the engineer set explicitly: combine a client's due items into
one message rather than one per contract, and keep the per item wording system generated rather than author editable.
Grouping by `(contractId, installmentNo, dueDate)` rather than by `contractId` or `clientContactId` is what makes both
the existing multi plot contract shape (`contractInstallments`, one row per plot) and the multi contract requirement
resolve to the same mechanism: a group is just "the set of installment rows that share a due date and installment
number," which already covers a multi plot contract on its own and folds in a second contract for free when one exists.

Token syntax (`{firstName}`, `{dueItems}`, `{totalAmount}`) follows the single curly brace style already sitting,
unused, in `sms_campaigns.templateBody`'s code comment (`{clientName}`, `{plotNumber}`, `{amountDue}`, `{dueDate}`)
(basis: `../../../apps/web/drizzle/tenant/schema.ts`, the `templateBody` comment), rather than inventing a different
bracket convention. The token names diverge from that comment's exact set because the comment assumed one installment
per message: `{plotNumber}`/`{amountDue}`/`{dueDate}` (singular) cannot represent a combined message, so `{dueItems}`
(plural, a rendered block) replaces them; `{clientName}` becomes `{firstName}` because every sample the engineer gave
greets by first name only ("Habari James," not "Habari James Mwangi,").

Option 1 was rejected outright, not just weighed, because it cannot satisfy the combine requirement at all, not just
less elegantly. Option 3 was rejected because the engineer was asked directly whether the repeating line should be
author customizable and chose the fixed system format, trading a small amount of wording flexibility for guaranteed
correctness (the amount, plot list, and project always come from the database, never retyped).

## Follow-up context

No community skills are installed for this project (no `## Agent skills` section in `../../../AGENTS.md`), so Step 0
(apply community skill knowledge) found nothing to apply.
