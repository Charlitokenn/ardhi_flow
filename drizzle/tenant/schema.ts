/**
 * Tenant Database Schema
 * Each tenant gets their own Neon project with this schema
 */

import {
    varchar,
    uuid,
    pgTable,
    pgEnum,
    date,
    timestamp,
    text,
    numeric,
    boolean,
    index,
    uniqueIndex,
    integer,
    jsonb,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const APPROVAL_STATUS_ENUM = pgEnum('approval_status', ['APPROVED', 'REJECTED', 'PENDING']);
export const GENDER_ENUM = pgEnum('gender', ['MALE', 'FEMALE']);
export const ID_TYPE_ENUM = pgEnum('id_type', ['NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'VOTER_ID']);
export const RELATIONSHIP_ENUM = pgEnum('relationship', ['PARENT', 'SIBLING', 'SPOUSE', 'FRIEND', 'OTHER']);

// Added SALES_AGENT so commissioned reps are tracked the same way as
// auditors/surveyors/etc. — no separate "staff" table needed.
export const CONTACT_TYPE = pgEnum('contact_type', [
    'CLIENT',
    'LAND_SELLER',
    'AUDITOR',
    'ICT_SUPPORT',
    'SURVEYOR',
    'SALES_AGENT',
]);

export const ACCOUNT_TYPE = pgEnum('account_type', ['Bank Account', 'Mobile Wallet']);

// NOTE: per requirements, plots are either AVAILABLE or SOLD.
// "Held" plots are represented by plots.activeContractId.
export const PLOT_AVAILABILITY_ENUM = pgEnum('plot_availability', ['AVAILABLE', 'SOLD']);

export const CONTRACT_STATUS_ENUM = pgEnum('contract_status', ['ACTIVE', 'DELINQUENT', 'COMPLETED', 'CANCELLED']);
export const INSTALLMENT_STATUS_ENUM = pgEnum('installment_status', ['DUE', 'PARTIAL', 'PAID']);
export const PAYMENT_DIRECTION_ENUM = pgEnum('payment_direction', ['IN', 'OUT']);
export const PURCHASE_PLAN_ENUM = pgEnum('purchase_plan', ['FLAT_RATE', 'DOWNPAYMENT']);

// General cash-outflow categories. Kept as a flat enum (matching the rest of this
// schema) rather than a full chart-of-accounts — this is a cash ledger for
// operational visibility, not double-entry bookkeeping. 'OTHER' + the free-text
// `description` field is the escape hatch for anything uncategorized.
export const EXPENSE_CATEGORY = pgEnum('expense_category', [
    'LAND_ACQUISITION',
    'SALES_COMMISSION',
    'SALARY',
    'RENT',
    'UTILITIES',
    'MARKETING',
    'PROFESSIONAL_FEES',
    'TRANSPORT',
    'OFFICE_SUPPLIES',
    'OTHER',
]);

// Commission payout tranche state.
export const COMMISSION_PAYOUT_STATUS = pgEnum('commission_payout_status', ['PENDING', 'PAID', 'CANCELLED']);

// SMS campaign/message tracking (NextSMS integration).
export const SMS_CAMPAIGN_TYPE = pgEnum('sms_campaign_type', [
    'PAYMENT_REMINDER',
    'OVERDUE_NOTICE',
    'FULLY_PAID_THANKYOU',
    'MARKETING',
    'GENERAL',
    'CUSTOM',
]);
export const SMS_CAMPAIGN_STATUS = pgEnum('sms_campaign_status', [
    'DRAFT',
    'SCHEDULED',
    'SENDING',
    'SENT',
    'FAILED',
]);
export const SMS_MESSAGE_STATUS = pgEnum('sms_message_status', [
    'QUEUED',
    'SENT',
    'DELIVERED',
    'FAILED',
    'UNDELIVERED',
    'EXPIRED',
]);

export const contacts = pgTable('contacts', {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    mobileNumber: text('mobile_number'),
    altMobileNumber: text('alt_mobile_number'),
    email: text('email'),
    gender: GENDER_ENUM('gender'),
    contactType: CONTACT_TYPE('contact_type').default('CLIENT'),
    idType: ID_TYPE_ENUM('id_type'),
    idNumber: text('id_number'),
    region: varchar('regions'),
    district: varchar('district'),
    ward: text('ward'),
    street: text('street'),
    firstNOKName: text('first_NOK_Name'),
    firstNOKMobile: text('first_NOK_Mobile'),
    firstNOKRelationship: RELATIONSHIP_ENUM('first_NOK_Relationship'),
    secondNOKName: text('second_NOK_Name'),
    secondNOKMobile: text('second_NOK_Mobile'),
    secondNOKRelationship: RELATIONSHIP_ENUM('second_NOK_Relationship'),
    clientPhoto: text('clientPhoto').unique(),
    addedBy: text('added_by'),
    // Marketing consent — checked before including a contact in a MARKETING/GENERAL sms campaign.
    smsOptOut: boolean('sms_opt_out').default(false).notNull(),
    // Links this contact to a Clerk user for self-service portal access
    // (sales reps: commission/portfolio dashboard; clients: plot/payment portal).
    // Nullable — most contacts (auditors, surveyors, non-portal clients, etc.)
    // will never have one. Unique — one Clerk account maps to at most one
    // contact row. If a person ever needs to hold two roles (e.g. staff member
    // who is also a client), that's two contact rows and this constraint means
    // only one of them can carry the login — decide which role owns the login
    // rather than dropping the constraint.
    clerkUserId: text('clerk_user_id').unique(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projects = pgTable('projects', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectName: text('project_name').notNull(),
    projectDetails: text('project_details'),
    acquisitionDate: date('acquisition_date').notNull(),
    sqmBought: numeric('sqm_bought'),
    acquisitionValue: numeric('acquisition_value').notNull(),
    region: text('region'),
    district: text('district'),
    ward: text('ward').default(''),
    projectOwner: text('project_owner'),
    committmentAmount: numeric('committment_amount'),
    lgaFee: numeric('lga_fee'),
    street: text('street'),
    tpNumber: text('tp_number'),
    tpStatus: text('tp_status'),
    surveyStatus: text('survey_status'),
    surveyNumber: text('survey_number'),
    originalContractPdf: text('original_contract_pdf'),
    supplierName: uuid('supplier_name'),
    mwenyekitiName: text('mwenyekiti_name'),
    mwenyekitiMobile: text('mwenyekiti_mobile'),
    mtendajiName: text('mtendaji_name'),
    mtendajiMobile: text('mtendaji_mobile'),
    numberOfPlots: integer('number_of_plots').notNull(),
    tpUrl: text('tp_url'),
    surveyUrl: text('survey_url'),
    addedBy: text('added_by'),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const accounts = pgTable('accounts', {
    id: uuid('id').primaryKey().defaultRandom(),
    accountName: varchar('account_name', { length: 255 }).notNull(),
    accountNumber: varchar('account_number', { length: 20 }).notNull().unique(),
    bankName: varchar('bank_name', { length: 255 }).notNull(),
    accountType: ACCOUNT_TYPE('account_type').notNull(),
    telcoName: varchar('telco_name', { length: 100 }),
    telcoNumber: varchar('telco_number', { length: 20 }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const plots = pgTable(
    'plots',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        plotNumber: numeric('plot_number').notNull(),
        surveyedPlotNumber: varchar('surveyed_plot_number', { length: 50 }),
        availability: PLOT_AVAILABILITY_ENUM('availability').default('AVAILABLE').notNull(),

        // Holds the currently active/delinquent contract (plot is not sellable while set)
        // NOTE: Do not declare a Drizzle-level FK here to avoid circular table init typing.
        // The actual FK is created in migrations.
        activeContractId: uuid('active_contract_id'),

        unsurveyedSize: numeric('unsurveyed_size').notNull(),
        surveyedSize: numeric('surveyed_size'),

        // 🔗 Project → Plot (many plots belong to one project)
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'restrict' }),

        // 🔗 Contact → Plot (current payer/owner; cleared on cancellation)
        contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

        isDeleted: boolean('is_deleted').default(false).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('plots_project_idx').on(table.projectId),
        index('plots_contact_idx').on(table.contactId),
        index('plots_active_contract_idx').on(table.activeContractId),
        // "Browse available plots" is now a direct portal query (reps + clients),
        // not just an internal admin filter, so it's worth indexing on its own.
        index('plots_availability_idx').on(table.availability),
    ],
);

export const plotSaleContracts = pgTable(
    'plot_sale_contracts',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        // FIX: plots is defined above this table, so referencing it here is a
        // backward reference and does NOT create the circular-typing problem
        // that activeContractId has. Safe to declare at the Drizzle level.
        plotId: uuid('plot_id')
            .notNull()
            .references(() => plots.id, { onDelete: 'restrict' }),

        clientContactId: uuid('client_contact_id')
            .notNull()
            .references(() => contacts.id, { onDelete: 'restrict' }),

        // Who closed the sale (Clerk user id) — matches addedBy pattern used elsewhere.
        createdBy: text('created_by'),

        status: CONTRACT_STATUS_ENUM('status').default('ACTIVE').notNull(),

        startDate: date('start_date').notNull(),

        // Number of *monthly* installments (excluding any upfront downpayment installment)
        termMonths: integer('term_months').notNull(),

        totalContractValue: numeric('total_contract_value').notNull(),

        purchasePlan: PURCHASE_PLAN_ENUM('purchase_plan').default('FLAT_RATE').notNull(),
        downpaymentPercent: numeric('downpayment_percent'),
        downpaymentAmount: numeric('downpayment_amount').default('0').notNull(),
        financedAmount: numeric('financed_amount').notNull(),

        cancellationFeePercent: numeric('cancellation_fee_percent').notNull(),

        graceDays: integer('grace_days').default(0).notNull(),
        delinquentDaysThreshold: integer('delinquent_days_threshold').default(1).notNull(),
        delinquentSince: timestamp('delinquent_since', { withTimezone: true }),

        // --- Sales agent / commission ---
        // Nullable: not every contract necessarily has a commissioned agent attached.
        salesAgentContactId: uuid('sales_agent_contact_id').references(() => contacts.id, {
            onDelete: 'set null',
        }),
        // Snapshotted at contract creation (seeded from commissionSettings) so a later
        // change to company policy never retroactively changes an already-signed contract.
        commissionPercent: numeric('commission_percent').default('0').notNull(),
        // = totalContractValue * commissionPercent / 100, computed and stored at creation time.
        commissionAmount: numeric('commission_amount').default('0').notNull(),
        // How many monthly tranches the commission is split into.
        // 1 = paid out in full in the purchase month (cash / full-payment sales).
        // >1 = split evenly, each tranche released the first month (on/after its
        // target month) that the client makes any payment — see commissionPayouts.
        commissionPayoutMonths: integer('commission_payout_months').default(1).notNull(),

        completedAt: timestamp('completed_at', { withTimezone: true }),
        cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
        cancelledBy: text('cancelled_by'),
        cancellationFeeAmount: numeric('cancellation_fee_amount'),
        refundedAmount: numeric('refunded_amount'),
        cancellationReason: text('cancellation_reason'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('plot_sale_contracts_plot_idx').on(table.plotId),
        index('plot_sale_contracts_client_idx').on(table.clientContactId),
        index('plot_sale_contracts_status_idx').on(table.status),
        index('plot_sale_contracts_agent_idx').on(table.salesAgentContactId),
        // Enforces at the DB level what activeContractId enforces at the app level:
        // a plot can't have two ACTIVE/DELINQUENT contracts simultaneously.
        // Requires drizzle-orm >= 0.31 for uniqueIndex().where().
        uniqueIndex('plot_sale_contracts_one_active_per_plot')
            .on(table.plotId)
            .where(sql`status IN ('ACTIVE', 'DELINQUENT')`),
    ],
);

export const contractInstallments = pgTable(
    'contract_installments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        contractId: uuid('contract_id')
            .notNull()
            .references(() => plotSaleContracts.id, { onDelete: 'cascade' }),

        // installment_no = 0 is reserved for an optional downpayment installment
        installmentNo: integer('installment_no').notNull(),

        // Set once at schedule generation, never mutated afterwards.
        originalDueDate: date('original_due_date').notNull(),
        // Current/effective due date — moves if the installment is rescheduled.
        dueDate: date('due_date').notNull(),
        // How many times this installment's dueDate has been pushed. Full detail of
        // each reschedule (old date, new date, reason) belongs in contractEvents.meta.
        rescheduledCount: integer('rescheduled_count').default(0).notNull(),

        amountDue: numeric('amount_due').notNull(),
        amountPaid: numeric('amount_paid').default('0').notNull(),
        // Late fee charged for going overdue.
        penaltyAmount: numeric('penalty_amount').default('0').notNull(),
        // Amount forgiven/written off (goodwill waiver, negotiated settlement, etc.)
        waivedAmount: numeric('waived_amount').default('0').notNull(),

        status: INSTALLMENT_STATUS_ENUM('status').default('DUE').notNull(),
        paidAt: timestamp('paid_at', { withTimezone: true }),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('contract_installments_contract_idx').on(table.contractId),
        index('contract_installments_due_idx').on(table.dueDate),
        index('contract_installments_contract_due_idx').on(table.contractId, table.dueDate),
        // Speeds up "all overdue installments across all contracts" aging reports.
        index('contract_installments_status_due_idx').on(table.status, table.dueDate),
    ],
);

export const contractPayments = pgTable(
    'contract_payments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        contractId: uuid('contract_id')
            .notNull()
            .references(() => plotSaleContracts.id, { onDelete: 'cascade' }),
        clientContactId: uuid('client_contact_id')
            .notNull()
            .references(() => contacts.id, { onDelete: 'restrict' }),

        // Which bank account/mobile wallet received this payment. Nullable to avoid
        // breaking any existing rows on migration; make it notNull going forward once
        // backfilled. Added now so income-side cash flow can be reconciled against
        // accounts the same way the new expenses table does for outflows.
        accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'restrict' }),

        direction: PAYMENT_DIRECTION_ENUM('direction').notNull(),
        amount: numeric('amount').notNull(),
        receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
        method: text('method'),
        reference: text('reference'),
        createdBy: text('created_by'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('contract_payments_contract_idx').on(table.contractId),
        index('contract_payments_client_idx').on(table.clientContactId),
        index('contract_payments_received_idx').on(table.receivedAt),
        index('contract_payments_account_idx').on(table.accountId),
    ],
);

export const contractPaymentAllocations = pgTable(
    'contract_payment_allocations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        paymentId: uuid('payment_id')
            .notNull()
            .references(() => contractPayments.id, { onDelete: 'cascade' }),
        installmentId: uuid('installment_id')
            .notNull()
            .references(() => contractInstallments.id, { onDelete: 'restrict' }),
        amount: numeric('amount').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('contract_payment_allocations_payment_idx').on(table.paymentId),
        index('contract_payment_allocations_installment_idx').on(table.installmentId),
    ],
);

export const contractEvents = pgTable(
    'contract_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        contractId: uuid('contract_id')
            .notNull()
            .references(() => plotSaleContracts.id, { onDelete: 'cascade' }),
        // Optional: scopes this row to one specific installment/invoice — this is what
        // lets a follow-up comment show up on a specific invoice rather than only the
        // contract as a whole. Left null for contract-level events (cancellation, etc).
        installmentId: uuid('installment_id').references(() => contractInstallments.id, {
            onDelete: 'cascade',
        }),
        // Free text by convention (not a pgEnum) — use 'FOLLOWUP_COMMENT' for staff
        // notes logging client feedback during a payment follow-up; other values
        // (e.g. 'CANCELLED', 'DELINQUENT_MARKED') for system-generated entries.
        eventType: text('event_type').notNull(),
        message: text('message'),
        meta: jsonb('meta'),
        // Collections notes ("client says broke until next paycheck") should never
        // leak into the client portal by accident. Defaults to internal-only; only
        // flip this if you deliberately want a client-visible comment thread.
        isInternal: boolean('is_internal').default(true).notNull(),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('contract_events_contract_idx').on(table.contractId),
        index('contract_events_installment_idx').on(table.installmentId),
        index('contract_events_type_idx').on(table.eventType),
    ],
);

// --- Commission ---

// Tenant-level defaults, seeded onto each contract at creation time
// (commissionPercent / commissionPayoutMonths above). Treat as a single-row
// settings table unless you later need per-project or per-agent overrides.
export const commissionSettings = pgTable('commission_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    defaultCommissionPercent: numeric('default_commission_percent').notNull().default('5'),
    defaultPayoutMonths: integer('default_payout_months').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const commissionPayouts = pgTable(
    'commission_payouts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        contractId: uuid('contract_id')
            .notNull()
            .references(() => plotSaleContracts.id, { onDelete: 'cascade' }),
        // Denormalized from the contract for fast "all payouts owed to Agent X"
        // queries without joining through plotSaleContracts every time.
        salesAgentContactId: uuid('sales_agent_contact_id')
            .notNull()
            .references(() => contacts.id, { onDelete: 'restrict' }),

        trancheNumber: integer('tranche_number').notNull(), // 1..commissionPayoutMonths
        amount: numeric('amount').notNull(),

        // First day of the calendar month this tranche originally targets:
        // tranche 1 = contract start month, tranche 2 = start month + 1, etc.
        targetMonth: date('target_month').notNull(),

        status: COMMISSION_PAYOUT_STATUS('status').default('PENDING').notNull(),

        // The client payment that satisfied "a payment landed in the release month"
        // and triggered this tranche. Null until paid.
        triggeringPaymentId: uuid('triggering_payment_id').references(() => contractPayments.id, {
            onDelete: 'set null',
        }),

        paidAt: timestamp('paid_at', { withTimezone: true }),
        // Actual calendar month released in — may be later than targetMonth if the
        // client skipped a month (e.g. targetMonth = Month 2, client pays in Month 3
        // instead, so this tranche is released with paidMonth = Month 3).
        paidMonth: date('paid_month'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('commission_payouts_contract_idx').on(table.contractId),
        index('commission_payouts_agent_idx').on(table.salesAgentContactId),
        index('commission_payouts_status_idx').on(table.status),
        uniqueIndex('commission_payouts_contract_tranche_unique').on(table.contractId, table.trancheNumber),
    ],
);

// --- Expenses (cash outflows) ---
// Covers two things that had nowhere to live before:
//   1. Payments made to acquire a project's land (category = LAND_ACQUISITION).
//      `projects.acquisitionValue` is the expected/agreed total — same target-vs-actual
//      relationship as totalContractValue vs contractPayments on the sales side. Sum
//      expenses WHERE category = 'LAND_ACQUISITION' AND projectId = X to get amount
//      actually paid, and diff against acquisitionValue for what's still owed to the seller.
//   2. General operating expenses not tied to any project (salaries, rent, utilities, etc).
// Also gives commission payouts an actual cash record: when a commissionPayouts row
// is marked PAID, write a matching expenses row (category = SALES_COMMISSION,
// commissionPayoutId set) so it's reflected in account balances and expense reports.
export const expenses = pgTable(
    'expenses',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        category: EXPENSE_CATEGORY('category').notNull(),
        description: text('description'),
        amount: numeric('amount').notNull(),

        // Which account the money actually left from.
        accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'restrict' }),

        // Who was paid. Typically the LAND_SELLER contact for LAND_ACQUISITION, the
        // landlord for RENT, the agent for SALES_COMMISSION, etc. Nullable — salaries
        // or misc spend may not warrant a contacts row.
        payeeContactId: uuid('payee_contact_id').references(() => contacts.id, { onDelete: 'set null' }),

        // Attributes this expense to a project. Effectively required (in practice) for
        // LAND_ACQUISITION, left null for company-wide overhead.
        projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

        // Links a SALES_COMMISSION expense back to the payout tranche it settles.
        commissionPayoutId: uuid('commission_payout_id').references(() => commissionPayouts.id, {
            onDelete: 'set null',
        }),

        paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
        method: text('method'),
        reference: text('reference'),
        createdBy: text('created_by'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('expenses_category_idx').on(table.category),
        index('expenses_project_idx').on(table.projectId),
        index('expenses_payee_idx').on(table.payeeContactId),
        index('expenses_account_idx').on(table.accountId),
        index('expenses_paid_idx').on(table.paidAt),
        index('expenses_commission_payout_idx').on(table.commissionPayoutId),
    ],
);

// --- SMS (NextSMS) ---

export const smsCampaigns = pgTable('sms_campaigns', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: SMS_CAMPAIGN_TYPE('type').notNull(),
    // Supports placeholders: {clientName}, {plotNumber}, {amountDue}, {dueDate}, etc.
    templateBody: text('template_body').notNull(),
    senderId: text('sender_id'), // NextSMS sender ID used for this campaign
    status: SMS_CAMPAIGN_STATUS('status').default('DRAFT').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    createdBy: text('created_by'),
    recipientCount: integer('recipient_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const smsMessages = pgTable(
    'sms_messages',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // Nullable — one-off/ad-hoc sends don't need a campaign wrapper.
        campaignId: uuid('campaign_id').references(() => smsCampaigns.id, { onDelete: 'set null' }),
        contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
        // Optional links back to what this message concerns — used to dedupe reminders
        // and to measure "did this reminder lead to a payment".
        contractId: uuid('contract_id').references(() => plotSaleContracts.id, { onDelete: 'set null' }),
        installmentId: uuid('installment_id').references(() => contractInstallments.id, {
            onDelete: 'set null',
        }),

        phoneNumber: text('phone_number').notNull(), // snapshot at send time
        body: text('body').notNull(), // rendered message actually sent

        providerMessageId: text('provider_message_id'), // NextSMS's message/request id
        status: SMS_MESSAGE_STATUS('status').default('QUEUED').notNull(),
        cost: numeric('cost'),
        segmentsCount: integer('segments_count').default(1).notNull(),
        errorReason: text('error_reason'),

        sentAt: timestamp('sent_at', { withTimezone: true }),
        deliveredAt: timestamp('delivered_at', { withTimezone: true }),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index('sms_messages_campaign_idx').on(table.campaignId),
        index('sms_messages_contact_idx').on(table.contactId),
        index('sms_messages_contract_idx').on(table.contractId),
        index('sms_messages_status_idx').on(table.status),
        index('sms_messages_provider_id_idx').on(table.providerMessageId),
    ],
);

// Append-only raw delivery-report log. Kept separate from smsMessages because
// NextSMS's webhook can fire more than once per message — this preserves full
// history while smsMessages.status/deliveredAt always reflects the latest state.
export const smsDeliveryEvents = pgTable(
    'sms_delivery_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => smsMessages.id, { onDelete: 'cascade' }),
        status: text('status').notNull(), // raw status/code exactly as received from NextSMS
        rawPayload: jsonb('raw_payload'), // full webhook body, for debugging/audit
        receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
    },
    (table) => [index('sms_delivery_events_message_idx').on(table.messageId)],
);

// Type exports
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Plot = typeof plots.$inferSelect;
export type NewPlot = typeof plots.$inferInsert;
export type PlotSaleContract = typeof plotSaleContracts.$inferSelect;
export type NewPlotSaleContract = typeof plotSaleContracts.$inferInsert;
export type ContractInstallment = typeof contractInstallments.$inferSelect;
export type NewContractInstallment = typeof contractInstallments.$inferInsert;
export type ContractPayment = typeof contractPayments.$inferSelect;
export type NewContractPayment = typeof contractPayments.$inferInsert;
export type ContractPaymentAllocation = typeof contractPaymentAllocations.$inferSelect;
export type NewContractPaymentAllocation = typeof contractPaymentAllocations.$inferInsert;
export type ContractEvent = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;
export type CommissionSetting = typeof commissionSettings.$inferSelect;
export type NewCommissionSetting = typeof commissionSettings.$inferInsert;
export type CommissionPayout = typeof commissionPayouts.$inferSelect;
export type NewCommissionPayout = typeof commissionPayouts.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type SmsCampaign = typeof smsCampaigns.$inferSelect;
export type NewSmsCampaign = typeof smsCampaigns.$inferInsert;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type NewSmsMessage = typeof smsMessages.$inferInsert;
export type SmsDeliveryEvent = typeof smsDeliveryEvents.$inferSelect;
export type NewSmsDeliveryEvent = typeof smsDeliveryEvents.$inferInsert;
export type ProjectWithPlots = Project & {
    plots: Plot[];
};

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
    plots: many(plots),
    expenses: many(expenses),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
    plots: many(plots),
    // NOTE: renamed from `plotSaleContracts` — a contact can now be linked to a
    // contract either as the buying client OR as the commissioned sales agent,
    // so the two relations need distinct names. Update any existing queries that
    // did `with: { plotSaleContracts: true }` on a contact to use
    // `plotSaleContractsAsClient` instead.
    plotSaleContractsAsClient: many(plotSaleContracts, { relationName: 'clientContact' }),
    plotSaleContractsAsAgent: many(plotSaleContracts, { relationName: 'salesAgentContact' }),
    smsMessages: many(smsMessages),
    commissionPayouts: many(commissionPayouts),
    expensesAsPayee: many(expenses),
}));

export const plotsRelations = relations(plots, ({ one, many }) => ({
    project: one(projects, {
        fields: [plots.projectId],
        references: [projects.id],
    }),
    contact: one(contacts, {
        fields: [plots.contactId],
        references: [contacts.id],
    }),
    activeContract: one(plotSaleContracts, {
        fields: [plots.activeContractId],
        references: [plotSaleContracts.id],
    }),
    contracts: many(plotSaleContracts),
}));

export const plotSaleContractsRelations = relations(plotSaleContracts, ({ one, many }) => ({
    plot: one(plots, {
        fields: [plotSaleContracts.plotId],
        references: [plots.id],
    }),
    client: one(contacts, {
        fields: [plotSaleContracts.clientContactId],
        references: [contacts.id],
        relationName: 'clientContact',
    }),
    salesAgent: one(contacts, {
        fields: [plotSaleContracts.salesAgentContactId],
        references: [contacts.id],
        relationName: 'salesAgentContact',
    }),
    installments: many(contractInstallments),
    payments: many(contractPayments),
    events: many(contractEvents),
    commissionPayouts: many(commissionPayouts),
    smsMessages: many(smsMessages),
}));

export const contractInstallmentsRelations = relations(contractInstallments, ({ one, many }) => ({
    contract: one(plotSaleContracts, {
        fields: [contractInstallments.contractId],
        references: [plotSaleContracts.id],
    }),
    allocations: many(contractPaymentAllocations),
    smsMessages: many(smsMessages),
    comments: many(contractEvents),
}));

export const contractPaymentsRelations = relations(contractPayments, ({ one, many }) => ({
    contract: one(plotSaleContracts, {
        fields: [contractPayments.contractId],
        references: [plotSaleContracts.id],
    }),
    client: one(contacts, {
        fields: [contractPayments.clientContactId],
        references: [contacts.id],
    }),
    account: one(accounts, {
        fields: [contractPayments.accountId],
        references: [accounts.id],
    }),
    allocations: many(contractPaymentAllocations),
    triggeredCommissionPayouts: many(commissionPayouts),
}));

export const contractPaymentAllocationsRelations = relations(contractPaymentAllocations, ({ one }) => ({
    payment: one(contractPayments, {
        fields: [contractPaymentAllocations.paymentId],
        references: [contractPayments.id],
    }),
    installment: one(contractInstallments, {
        fields: [contractPaymentAllocations.installmentId],
        references: [contractInstallments.id],
    }),
}));

export const contractEventsRelations = relations(contractEvents, ({ one }) => ({
    contract: one(plotSaleContracts, {
        fields: [contractEvents.contractId],
        references: [plotSaleContracts.id],
    }),
    installment: one(contractInstallments, {
        fields: [contractEvents.installmentId],
        references: [contractInstallments.id],
    }),
}));

export const commissionPayoutsRelations = relations(commissionPayouts, ({ one, many }) => ({
    contract: one(plotSaleContracts, {
        fields: [commissionPayouts.contractId],
        references: [plotSaleContracts.id],
    }),
    salesAgent: one(contacts, {
        fields: [commissionPayouts.salesAgentContactId],
        references: [contacts.id],
    }),
    triggeringPayment: one(contractPayments, {
        fields: [commissionPayouts.triggeringPaymentId],
        references: [contractPayments.id],
    }),
    settlementExpenses: many(expenses),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
    contractPayments: many(contractPayments),
    expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    account: one(accounts, {
        fields: [expenses.accountId],
        references: [accounts.id],
    }),
    payee: one(contacts, {
        fields: [expenses.payeeContactId],
        references: [contacts.id],
    }),
    project: one(projects, {
        fields: [expenses.projectId],
        references: [projects.id],
    }),
    commissionPayout: one(commissionPayouts, {
        fields: [expenses.commissionPayoutId],
        references: [commissionPayouts.id],
    }),
}));

export const smsCampaignsRelations = relations(smsCampaigns, ({ many }) => ({
    messages: many(smsMessages),
}));

export const smsMessagesRelations = relations(smsMessages, ({ one, many }) => ({
    campaign: one(smsCampaigns, {
        fields: [smsMessages.campaignId],
        references: [smsCampaigns.id],
    }),
    contact: one(contacts, {
        fields: [smsMessages.contactId],
        references: [contacts.id],
    }),
    contract: one(plotSaleContracts, {
        fields: [smsMessages.contractId],
        references: [plotSaleContracts.id],
    }),
    installment: one(contractInstallments, {
        fields: [smsMessages.installmentId],
        references: [contractInstallments.id],
    }),
    deliveryEvents: many(smsDeliveryEvents),
}));

export const smsDeliveryEventsRelations = relations(smsDeliveryEvents, ({ one }) => ({
    message: one(smsMessages, {
        fields: [smsDeliveryEvents.messageId],
        references: [smsMessages.id],
    }),
}));