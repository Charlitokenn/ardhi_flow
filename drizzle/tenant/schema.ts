import { pgTable, text, timestamp, uuid, numeric, date, pgEnum } from 'drizzle-orm/pg-core'

// This schema is applied identically to every tenant's own Neon project
// (never to the catalog project). Keep it free of anything cross-tenant —
// that belongs in drizzle/catalog/schema.ts instead.
//
// This is a minimal starter for ArdhiFlow's land-plot/receivables domain —
// swap in your real tables. What matters for the scaffold is the pipeline:
// drizzle-kit generate → 0000_init.sql → applied to every new tenant project
// by the provisioning queue consumer / CLI script.

export const installmentStatus = pgEnum('installment_status', ['pending', 'paid', 'overdue'])

export const buyers = pgTable('buyers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const plots = pgTable('plots', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  location: text('location'),
  priceTotal: numeric('price_total', { precision: 14, scale: 2 }).notNull(),
  buyerId: uuid('buyer_id').references(() => buyers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const installments = pgTable('installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  plotId: uuid('plot_id')
    .notNull()
    .references(() => plots.id),
  amountDue: numeric('amount_due', { precision: 14, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  status: installmentStatus('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
})
