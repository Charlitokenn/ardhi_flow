# ArdhiFlow — Project Overview

## What Is This?

ArdhiFlow is a multi-tenant SaaS platform for land-plot sales and receivables management, built for land-sale and property companies operating in the Tanzanian (East African) market. Each customer organization (a Clerk "org") gets its own isolated Neon Postgres tenant database, provisioned automatically the moment they sign up, so their contacts, plots, contracts, and financial data never mix with any other tenant's.

## Problem Being Solved

Land-plot sellers in Tanzania typically sell plots on long installment contracts (downpayment + monthly payments over months or years), track buyer/seller/agent contacts, pay commissions to sales agents in tranches tied to actual client payments, and chase overdue payments largely by phone and SMS. Today this is usually run out of spreadsheets and paper files, which makes it hard to know at a glance which contracts are delinquent, how much commission is owed to which agent, or what a project's real acquisition cost vs. recovered sales value looks like. ArdhiFlow centralizes plot inventory, installment contracts, payments, commission payouts, operating expenses, and SMS-based client communication (via NextSMS) into one system per company.

## Target Users

Small-to-mid-size land sale and property companies in Tanzania/East Africa — office staff who manage plot inventory and buyer contracts, finance staff who reconcile payments and track expenses, and sales agents/managers who need visibility into commissions and delinquent accounts. Organizations sign up and operate as isolated tenants via Clerk Organizations; end users are not expected to manage any infrastructure themselves.

## Core Features (MVP)

- **Multi-tenant provisioning** — a new Clerk organization automatically gets its own dedicated Neon Postgres project, applied schema, and encrypted connection string, with zero manual setup
- **Contacts** — a unified directory of clients, land sellers, auditors, ICT support, surveyors, and sales agents, including next-of-kin details and optional client-portal login linkage
- **Projects & Plots** — land acquisitions tracked as "projects" (with survey/TP status, acquisition cost) broken into individual sellable "plots"
- **Sales / Plot Sale Contracts** — installment contracts against a plot (flat-rate or downpayment plans), with auto-generated installment schedules, rescheduling, delinquency tracking, and cancellation handling
- **Payments & Reconciliation** — incoming client payments allocated against specific installments, outgoing payments (expenses) tracked against a bank/mobile-wallet account, and account-level reconciliation
- **Commission tracking** — per-contract commission snapshotting at sale time, split into payout tranches released as the client actually pays
- **Expenses** — cash outflows categorized (land acquisition, salaries, rent, commissions, etc.) and attributable to a project or company-wide overhead
- **SMS messaging (NextSMS)** — templated payment-reminder, overdue-notice, and marketing campaigns, with per-message delivery tracking
- **Dashboard & Reports** — company-wide overview and reporting surfaces across sales, finance, and delinquency

## Success Criteria for v1

A land-sale company can sign up, have their tenant auto-provision, and immediately start recording projects, plots, contacts, and contracts — then run their day-to-day operations (recording payments, tracking delinquent installments, paying out agent commissions, logging expenses, sending SMS reminders) entirely inside ArdhiFlow, without touching a spreadsheet.

## Out of Scope for v1

Client-facing self-service portal (contacts already carry an optional `clerkUserId` for this, but no portal UI exists yet), mobile apps, multi-currency support, full double-entry accounting (expenses are a cash ledger, not a chart of accounts), automated tests / CI pipeline, and migration fan-out for schema changes to already-provisioned tenants.
