#!/usr/bin/env -S npx tsx
// This is a variant of scripts/seed-tenant.ts that connects via the plain
// Postgres wire protocol (`pg` + drizzle-orm/node-postgres) instead of
// Neon's HTTP driver (`@neondatabase/serverless` + neon-http). Use this if
// seed-tenant.ts fails with "TypeError: fetch failed" even though the
// network otherwise has working TCP/TLS connectivity to Neon (verified via
// e.g. `curl -4 -sv https://<your-neon-host>`) — this bypasses Node's
// fetch/undici stack entirely, using raw sockets instead.
import 'dotenv/config'
import {Command} from 'commander'
import {Pool} from 'pg'
import {drizzle} from 'drizzle-orm/node-postgres'
import {eq, inArray} from 'drizzle-orm'
import {decryptConnectionString} from '../src/worker/lib/crypto'
import {tenantProjects} from '../drizzle/catalog/schema'
import * as schema from '../drizzle/tenant/schema'

const program = new Command()
program
    .requiredOption('--org-id <orgId>', 'Clerk organization ID identifying the tenant')
    .option('--reset', 'Delete existing data before seeding', false)
    .parse(process.argv)

const {orgId, reset} = program.opts<{ orgId: string; reset: boolean }>()

async function main() {
    const {CATALOG_DATABASE_URL, TENANT_CONN_ENCRYPTION_KEY} = process.env

    if (!CATALOG_DATABASE_URL || !TENANT_CONN_ENCRYPTION_KEY) {
        throw new Error('Missing required env vars: CATALOG_DATABASE_URL, TENANT_CONN_ENCRYPTION_KEY')
    }

    const catalogPool = new Pool({connectionString: CATALOG_DATABASE_URL})
    const catalogDb = drizzle(catalogPool)
    const [tenant] = await catalogDb.select().from(tenantProjects).where(eq(tenantProjects.orgId, orgId))

    if (!tenant) {
        console.error(`✗ Tenant not found for orgId: "${orgId}"`)
        console.error('  Double-check the --org-id value for typos (e.g. stray trailing characters from')
        console.error('  an unmatched quote in your shell command) and that the tenant was provisioned')
        console.error('  via `npm run provision:tenant`.')
        process.exit(1)
    }

    const connectionUri = await decryptConnectionString(
        tenant.encryptedConnectionString,
        TENANT_CONN_ENCRYPTION_KEY,
    )

    const tenantPool = new Pool({connectionString: connectionUri})
    const db = drizzle(tenantPool, {schema})

    console.log(`→ Seeding tenant: ${tenant.orgId} (${tenant.neonProjectName})`)

    if (reset) {
        console.log('  ⚠ Reset flag passed. Cleaning existing data...')
        // Order matters for FK constraints
        await db.delete(schema.smsDeliveryEvents)
        await db.delete(schema.smsMessages)
        await db.delete(schema.smsCampaigns)
        await db.delete(schema.expenses)
        await db.delete(schema.commissionPayouts)
        await db.delete(schema.contractPaymentAllocations)
        await db.delete(schema.contractPayments)
        await db.delete(schema.contractInstallments)
        await db.delete(schema.contractEvents)
        await db.delete(schema.contractPlots)
        // We need to clear plots.activeContractId before deleting plotSaleContracts
        await db.update(schema.plots).set({activeContractId: null})
        await db.delete(schema.plotSaleContracts)
        await db.delete(schema.vendorJobProjects)
        await db.delete(schema.vendorJobs)
        await db.delete(schema.projectAcquisitionInstallments)
        await db.delete(schema.projectAcquisitions)
        await db.delete(schema.plots)
        await db.delete(schema.projects)
        await db.delete(schema.contacts)
        await db.delete(schema.accounts)
        await db.delete(schema.commissionSettings)
        await db.delete(schema.companySettings)
        console.log('  ✓ Data cleaned.')
    }

    // --- Helpers ---
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
    const randomElement = <T>(arr: T[] | readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
    const randomPhone = () => `+255${randomInt(6, 7)}${randomInt(10000000, 99999999)}`
    const toDateStr = (d: Date) => d.toISOString().split('T')[0]
    const addMonths = (dateStr: string, months: number) => {
        const d = new Date(dateStr)
        d.setMonth(d.getMonth() + months)
        return toDateStr(d)
    }
    const addDays = (dateStr: string, days: number) => {
        const d = new Date(dateStr)
        d.setDate(d.getDate() + days)
        return toDateStr(d)
    }
    // Random date between two Dates (inclusive) — this is what spreads sales
    // contracts across various days of various months instead of every
    // contract landing on the exact same date.
    const randomDateBetween = (start: Date, end: Date) => {
        const startMs = start.getTime()
        const endMs = Math.max(end.getTime(), startMs)
        return toDateStr(new Date(startMs + Math.random() * (endMs - startMs)))
    }

    // Sales contracts are seeded to look like they were signed over the course
    // of 2026, starting 1 Jan 2026, spread across different days/months rather
    // than all on the 1st. `today` is the real "now" — installments/payments
    // are only marked paid if their due date has actually passed by then, so
    // the seeded data stays internally consistent no matter when this script
    // is run.
    const SALES_WINDOW_START = new Date('2026-01-01T00:00:00Z')
    const today = new Date()
    const SALES_WINDOW_END = today.getTime() > SALES_WINDOW_START.getTime()
        ? today
        : new Date(SALES_WINDOW_START.getTime() + 30 * 24 * 60 * 60 * 1000)
    // Start-date window for contracts that need to have already run their full
    // (short, 6-month) term and be COMPLETED by today — early in the year, and
    // never later than 6 months before today.
    const sixMonthsBeforeToday = new Date(today)
    sixMonthsBeforeToday.setMonth(sixMonthsBeforeToday.getMonth() - 6)
    const EARLY_WINDOW_END = new Date(Math.min(
        new Date('2026-03-15T00:00:00Z').getTime(),
        Math.max(sixMonthsBeforeToday.getTime(), SALES_WINDOW_START.getTime()),
    ))
    // Start-date window for ongoing (ACTIVE/DELINQUENT) contracts — capped so
    // every contract has at least ~45 days of payment history behind it by
    // today, instead of some being signed "today" with nothing due yet.
    const fortyFiveDaysBeforeToday = new Date(today)
    fortyFiveDaysBeforeToday.setDate(fortyFiveDaysBeforeToday.getDate() - 45)
    const ONGOING_WINDOW_END = new Date(Math.min(
        SALES_WINDOW_END.getTime(),
        Math.max(fortyFiveDaysBeforeToday.getTime(), SALES_WINDOW_START.getTime()),
    ))

    // --- Accounts ---
    console.log('  → Seeding accounts...')
    const accountRows = await db.insert(schema.accounts).values([
        {
            accountName: 'Main Business Account',
            accountNumber: `CRDB-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`,
            bankName: 'CRDB Bank',
            accountType: 'Bank Account',
        },
        {
            accountName: 'NMB Collection',
            accountNumber: `NMB-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`,
            bankName: 'NMB Bank',
            accountType: 'Bank Account',
        },
        {
            accountName: 'M-Pesa Till',
            accountNumber: `${randomInt(500000, 599999)}`,
            bankName: 'Vodacom',
            accountType: 'Mobile Wallet',
            telcoName: 'Vodacom',
            telcoNumber: '0754123456',
        },
    ]).returning()

    // --- Contacts ---
    console.log('  → Seeding contacts...')
    const firstNames = ['John', 'Jane', 'Hamisi', 'Asha', 'Peter', 'Mary', 'Said', 'Fatuma', 'Joseph', 'Grace']
    const lastNames = ['Mdoe', 'Komba', 'Shayo', 'Lema', 'Mushi', 'Massawe', 'Juma', 'Bakari', 'Kamau', 'Nyerere']

    const contactData: schema.NewContact[] = []

    // Clients
    for (let i = 0; i < 15; i++) {
        contactData.push({
            fullName: `${randomElement(firstNames)} ${randomElement(lastNames)}`,
            mobileNumber: randomPhone(),
            email: `client${i}@example.com`,
            contactType: 'CLIENT',
            gender: randomElement(['MALE', 'FEMALE']),
            idType: randomElement(['NATIONAL_ID', 'VOTER_ID']),
            idNumber: `${randomInt(100000, 999999)}`,
        })
    }

    // Staff/Agents
    const agentNames = ['Agent Alex', 'Agent Sarah', 'Agent Mike']
    for (const name of agentNames) {
        contactData.push({
            fullName: name,
            mobileNumber: randomPhone(),
            contactType: 'SALES_AGENT',
        })
    }

    // Others
    contactData.push({fullName: 'Landowner Leonard', contactType: 'LAND_SELLER', mobileNumber: randomPhone()})
    contactData.push({fullName: 'Surveyor Sam', contactType: 'SURVEYOR', mobileNumber: randomPhone()})
    contactData.push({fullName: 'Auditor Anna', contactType: 'AUDITOR', mobileNumber: randomPhone()})

    const contactRows = await db.insert(schema.contacts).values(contactData).returning()
    const clients = contactRows.filter(c => c.contactType === 'CLIENT')
    const agents = contactRows.filter(c => c.contactType === 'SALES_AGENT')
    const landSellers = contactRows.filter(c => c.contactType === 'LAND_SELLER')
    const surveyors = contactRows.filter(c => c.contactType === 'SURVEYOR')
    const auditors = contactRows.filter(c => c.contactType === 'AUDITOR')

    // --- Projects ---
    console.log('  → Seeding projects...')
    const projectRows = await db.insert(schema.projects).values([
        {
            projectName: 'Kigamboni Greens',
            projectDetails: 'Prime residential plots near the beach',
            acquisitionDate: '2025-01-15',
            sqmBought: '50000',
            acquisitionValue: '500000000',
            region: 'Dar es Salaam',
            district: 'Kigamboni',
            numberOfPlots: 50,
        },
        {
            projectName: 'Mbweni Heights',
            projectDetails: 'Uphill plots with ocean view',
            acquisitionDate: '2025-03-20',
            sqmBought: '30000',
            acquisitionValue: '450000000',
            region: 'Dar es Salaam',
            district: 'Kinondoni',
            numberOfPlots: 30,
        }
    ]).returning()

    // --- Plots ---
    console.log('  → Seeding plots...')
    const plotData: schema.NewPlot[] = []
    for (const project of projectRows) {
        for (let i = 1; i <= 15; i++) {
            plotData.push({
                plotNumber: i.toString(),
                projectId: project.id,
                unsurveyedSize: randomInt(400, 800).toString(),
                availability: 'AVAILABLE',
            })
        }
    }
    const plotRows = await db.insert(schema.plots).values(plotData).returning()

    // --- Commission Settings ---
    const [commSettings] = await db.insert(schema.commissionSettings).values({
        defaultCommissionPercent: '5',
        defaultPayoutMonths: 3,
    }).returning()

    // --- Company Settings ---
    // Singleton row (fixed id) — branding details used on generated client
    // statements/confirmation letters.
    console.log('  → Seeding company settings...')
    await db.insert(schema.companySettings).values({
        id: schema.COMPANY_SETTINGS_ID,
        slogan: 'Your Trusted Land Partner',
        primaryColor: '#0F6B3D',
        email: 'info@ardhiflow.co.tz',
        mobileNumber: '+255754000000',
        address: 'Kigamboni, Dar es Salaam',
        website: 'https://ardhiflow.co.tz',
        signerTitle: 'Managing Director',
    })

    // --- Contracts ---
    console.log('  → Seeding sales contracts...')
    // Explicit plot → client assignments (rather than a flat positional slice)
    // so ownership patterns are intentional and easy to read. Each entry is
    // one contract "bucket" — the plot(s) it covers (a contract may only ever
    // hold plots from a single project, per contractPlots), the client, and a
    // target end-state:
    //  - clients[0] buys two Kigamboni plots on ONE contract (a real
    //    multi-plot bucket, split evenly across the two plots)
    //  - clients[1] buys one plot in each project — a bucket can't span
    //    projects, so this is necessarily two separate contracts
    //  - clients[2] buys two more Kigamboni plots as another bucket, plus a
    //    third plot in Mbweni on its own contract
    //  - the rest each buy a single plot, split across both projects, to keep
    //    the common single-plot case well represented too
    // Target statuses are realistic proportions: mostly ACTIVE, a couple
    // DELINQUENT (missed their most recent installment), a few COMPLETED
    // (short terms that started early enough in the year to have already run
    // out by today).
    const [kigamboni, mbweni] = projectRows
    const kigamboniPlots = plotRows.filter((p) => p.projectId === kigamboni.id)
    const mbweniPlots = plotRows.filter((p) => p.projectId === mbweni.id)

    const contractPlans: {
        plots: (typeof plotRows)[number][]
        client: (typeof clients)[number]
        targetStatus: 'ACTIVE' | 'DELINQUENT' | 'COMPLETED'
    }[] = [
        {plots: [kigamboniPlots[0], kigamboniPlots[1]], client: clients[0], targetStatus: 'COMPLETED'},
        {plots: [kigamboniPlots[2]], client: clients[1], targetStatus: 'ACTIVE'},
        {plots: [mbweniPlots[0]], client: clients[1], targetStatus: 'COMPLETED'},
        {plots: [kigamboniPlots[3], kigamboniPlots[4]], client: clients[2], targetStatus: 'ACTIVE'},
        {plots: [mbweniPlots[1]], client: clients[2], targetStatus: 'ACTIVE'},
        {plots: [kigamboniPlots[5]], client: clients[3], targetStatus: 'DELINQUENT'},
        {plots: [kigamboniPlots[6]], client: clients[4], targetStatus: 'ACTIVE'},
        {plots: [mbweniPlots[2]], client: clients[5], targetStatus: 'ACTIVE'},
        {plots: [mbweniPlots[3]], client: clients[6], targetStatus: 'DELINQUENT'},
        {plots: [mbweniPlots[4]], client: clients[7], targetStatus: 'COMPLETED'},
    ]

    // Round, realistic monthly installment amounts (TZS). The schedule is
    // built top-down from one of these instead of picking a random total and
    // dividing it — that's what guarantees every contract tallies exactly:
    //   downpaymentAmount + (monthlyAmt * termMonths) === totalContractValue
    // for every single contract, with no floor()/rounding remainder.
    const MONTHLY_AMOUNT_OPTIONS = [500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000] as const

    const contracts: schema.PlotSaleContract[] = []
    const contractPlotsByContract = new Map<string, (typeof plotRows)[number][]>()

    for (let i = 0; i < contractPlans.length; i++) {
        const {plots: dealPlots, client, targetStatus} = contractPlans[i]
        const agent = agents[i % agents.length]
        const project = dealPlots[0].projectId === kigamboni.id ? kigamboni : mbweni

        // --- Term, start date & purchase plan ---
        const termMonths = targetStatus === 'COMPLETED' ? 6 : randomElement([12, 18, 24])
        const startDate = targetStatus === 'COMPLETED'
            ? randomDateBetween(SALES_WINDOW_START, EARLY_WINDOW_END)
            : randomDateBetween(SALES_WINDOW_START, ONGOING_WINDOW_END)
        // Alternate purchase plans so both enum values get realistic coverage.
        const purchasePlan: 'FLAT_RATE' | 'DOWNPAYMENT' = i % 2 === 0 ? 'DOWNPAYMENT' : 'FLAT_RATE'

        // --- Build the schedule top-down so it always tallies exactly ---
        const monthlyAmt = randomElement(MONTHLY_AMOUNT_OPTIONS)
        const financedAmount = monthlyAmt * termMonths
        const downpaymentMonths = purchasePlan === 'DOWNPAYMENT' ? randomInt(2, 6) : 0
        const downpaymentAmount = monthlyAmt * downpaymentMonths
        const totalContractValue = downpaymentAmount + financedAmount
        const downpaymentPercent = purchasePlan === 'DOWNPAYMENT'
            ? ((downpaymentAmount / totalContractValue) * 100).toFixed(2)
            : null
        const commissionAmount = totalContractValue * parseFloat(commSettings.defaultCommissionPercent) / 100

        const [contract] = await db.insert(schema.plotSaleContracts).values({
            projectId: project.id,
            clientContactId: client.id,
            salesAgentContactId: agent.id,
            status: targetStatus,
            startDate,
            termMonths,
            totalContractValue: totalContractValue.toString(),
            purchasePlan,
            downpaymentPercent,
            downpaymentAmount: downpaymentAmount.toString(),
            financedAmount: financedAmount.toString(),
            cancellationFeePercent: '10',
            commissionPercent: commSettings.defaultCommissionPercent,
            commissionAmount: commissionAmount.toString(),
            commissionPayoutMonths: commSettings.defaultPayoutMonths,
        }).returning()

        contracts.push(contract)
        contractPlotsByContract.set(contract.id, dealPlots)

        // --- contractPlots (bucket membership) ---
        // Split the contract's totals evenly across the plots in the bucket.
        // MONTHLY_AMOUNT_OPTIONS are all even, so a 2-plot bucket always
        // divides cleanly — no remainder to lose.
        const perPlotMonthlyAmt = monthlyAmt / dealPlots.length
        const perPlotDownpayment = downpaymentAmount / dealPlots.length
        const perPlotTotalValue = totalContractValue / dealPlots.length

        const contractPlotRows = await db.insert(schema.contractPlots).values(
            dealPlots.map((plot) => ({
                contractId: contract.id,
                plotId: plot.id,
                allocatedValue: perPlotTotalValue.toString(),
            })),
        ).returning()

        await db.update(schema.plots)
            .set({
                availability: 'SOLD',
                contactId: client.id,
                activeContractId: targetStatus === 'COMPLETED' ? null : contract.id,
            })
            .where(inArray(schema.plots.id, dealPlots.map((p) => p.id)))

        // --- Installments (one full schedule per plot in the bucket) ---
        // Only the most recent past-due month is ever left unpaid/partial
        // (the "missed" installment for a DELINQUENT contract) — everything
        // before it is paid, everything after it isn't due yet.
        const installmentMonths = Array.from({length: termMonths}, (_, idx) => idx + 1).map((m) => {
            const dueDate = addMonths(startDate, m)
            return {m, dueDate, isPastDue: new Date(dueDate) <= today}
        })
        const pastDueMonths = installmentMonths.filter((x) => x.isPastDue).map((x) => x.m)
        const missedMonth = targetStatus === 'DELINQUENT' && pastDueMonths.length > 0
            ? pastDueMonths[pastDueMonths.length - 1]
            : null
        const missedIsPartial = missedMonth !== null && Math.random() < 0.5

        let firstPaymentId: string | null = null
        let lastPaidAt: Date | null = null
        let missedInstallmentId: string | null = null
        let missedDueDate: string | null = null

        for (const contractPlot of contractPlotRows) {
            const installmentsForPlot: schema.NewContractInstallment[] = []

            // Downpayment installment (No 0) — only for DOWNPAYMENT-plan
            // contracts. Paid on signing regardless of the contract's later
            // status, same as in real life.
            if (purchasePlan === 'DOWNPAYMENT') {
                installmentsForPlot.push({
                    contractId: contract.id,
                    contractPlotId: contractPlot.id,
                    plotId: contractPlot.plotId,
                    installmentNo: 0,
                    originalDueDate: startDate,
                    dueDate: startDate,
                    amountDue: perPlotDownpayment.toString(),
                    amountPaid: perPlotDownpayment.toString(),
                    status: 'PAID',
                    paidAt: new Date(`${startDate}T10:00:00Z`),
                })
            }

            for (const {m, dueDate, isPastDue} of installmentMonths) {
                let status: 'PAID' | 'PARTIAL' | 'DUE' = 'DUE'
                let amountPaid = 0
                let paidAt: Date | null = null

                if (m === missedMonth) {
                    status = missedIsPartial ? 'PARTIAL' : 'DUE'
                    amountPaid = missedIsPartial ? Math.floor(perPlotMonthlyAmt / 2) : 0
                } else if (isPastDue) {
                    status = 'PAID'
                    amountPaid = perPlotMonthlyAmt
                    // Paid a few days after the due date, not always exactly on it.
                    paidAt = new Date(`${addDays(dueDate, randomInt(0, 4))}T10:00:00Z`)
                }

                installmentsForPlot.push({
                    contractId: contract.id,
                    contractPlotId: contractPlot.id,
                    plotId: contractPlot.plotId,
                    installmentNo: m,
                    originalDueDate: dueDate,
                    dueDate,
                    amountDue: perPlotMonthlyAmt.toString(),
                    amountPaid: amountPaid.toString(),
                    status,
                    paidAt,
                })
            }

            const insertedInsts = await db.insert(schema.contractInstallments).values(installmentsForPlot).returning()

            // --- Payments (only for what was actually paid) ---
            for (const inst of insertedInsts) {
                if (inst.installmentNo === missedMonth && missedInstallmentId === null) {
                    missedInstallmentId = inst.id
                    missedDueDate = inst.dueDate
                }

                if (parseFloat(inst.amountPaid) > 0) {
                    const [payment] = await db.insert(schema.contractPayments).values({
                        contractId: contract.id,
                        clientContactId: client.id,
                        accountId: randomElement(accountRows).id,
                        direction: 'IN',
                        amount: inst.amountPaid,
                        receivedAt: inst.paidAt || new Date(`${inst.dueDate}T10:00:00Z`),
                        method: randomElement(['Bank Transfer', 'Mobile Money', 'Cash']),
                    }).returning()

                    await db.insert(schema.contractPaymentAllocations).values({
                        paymentId: payment.id,
                        installmentId: inst.id,
                        amount: inst.amountPaid,
                    })

                    firstPaymentId = firstPaymentId ?? payment.id
                    if (inst.paidAt && (!lastPaidAt || inst.paidAt > lastPaidAt)) {
                        lastPaidAt = inst.paidAt
                    }
                }
            }
        }

        if (targetStatus === 'COMPLETED' && lastPaidAt) {
            await db.update(schema.plotSaleContracts)
                .set({completedAt: lastPaidAt})
                .where(eq(schema.plotSaleContracts.id, contract.id))
        }
        if (targetStatus === 'DELINQUENT' && missedDueDate) {
            await db.update(schema.plotSaleContracts)
                .set({delinquentSince: new Date(`${missedDueDate}T00:00:00Z`)})
                .where(eq(schema.plotSaleContracts.id, contract.id))
        }

        // --- Commission Payouts ---
        // Split the contract's commission into commissionPayoutMonths
        // tranches, each released once its target month has actually arrived
        // (rather than hard-coding "tranche 1 is always paid" regardless of
        // the contract's real dates).
        const trancheAmt = (parseFloat(contract.commissionAmount) / contract.commissionPayoutMonths).toString()
        for (let t = 1; t <= contract.commissionPayoutMonths; t++) {
            const targetMonth = addMonths(startDate, t - 1)
            const isPaid = firstPaymentId !== null && new Date(targetMonth) <= today

            const [payout] = await db.insert(schema.commissionPayouts).values({
                contractId: contract.id,
                salesAgentContactId: agent.id,
                trancheNumber: t,
                amount: trancheAmt,
                targetMonth,
                status: isPaid ? 'PAID' : 'PENDING',
                triggeringPaymentId: isPaid ? firstPaymentId : null,
                paidAt: isPaid ? new Date(`${targetMonth}T10:00:00Z`) : null,
                paidMonth: isPaid ? targetMonth : null,
            }).returning()

            if (isPaid) {
                await db.insert(schema.expenses).values({
                    category: 'SALES_COMMISSION',
                    amount: trancheAmt,
                    accountId: randomElement(accountRows).id,
                    payeeContactId: agent.id,
                    commissionPayoutId: payout.id,
                    description: `Commission for ${client.fullName} - ${project.projectName} (Tranche ${t})`,
                    paidAt: new Date(`${targetMonth}T10:00:00Z`),
                })
            }
        }

        // --- Contract Events (comments plumbing) ---
        // A routine follow-up note on every contract, plus a system-generated
        // delinquency marker for contracts in that state.
        await db.insert(schema.contractEvents).values({
            contractId: contract.id,
            eventType: 'FOLLOWUP_COMMENT',
            message: `Called ${client.fullName} to confirm the payment schedule.`,
            createdBy: agent.fullName,
        })

        if (targetStatus === 'DELINQUENT' && missedInstallmentId) {
            await db.insert(schema.contractEvents).values({
                contractId: contract.id,
                installmentId: missedInstallmentId,
                eventType: 'DELINQUENT_MARKED',
                message: `Contract marked delinquent after the installment due ${missedDueDate} was missed.`,
                isInternal: true,
            })
        }
    }

    // --- General Expenses ---
    console.log('  → Seeding general expenses...')
    await db.insert(schema.expenses).values([
        {
            category: 'LAND_ACQUISITION',
            amount: '50000000',
            accountId: accountRows[0].id,
            payeeContactId: landSellers[0].id,
            projectId: projectRows[0].id,
            description: 'Initial deposit for Kigamboni project',
            paidAt: new Date('2025-01-20'),
        },
        {
            category: 'RENT',
            amount: '1200000',
            accountId: accountRows[0].id,
            description: 'Office rent',
            paidAt: new Date(`${addDays(toDateStr(today), -5)}T00:00:00Z`),
        },
        {
            category: 'MARKETING',
            amount: '500000',
            accountId: accountRows[2].id,
            description: 'Facebook ads for Kigamboni & Mbweni plots',
            paidAt: new Date(`${randomDateBetween(SALES_WINDOW_START, SALES_WINDOW_END)}T00:00:00Z`),
        },
    ])

    // --- Vendor Jobs ---
    console.log('  → Seeding vendor jobs...')
    const [surveyorJob] = await db.insert(schema.vendorJobs).values({
        vendorContactId: surveyors[0].id,
        title: 'Kigamboni Boundary Survey',
        description: 'Full boundary survey and beacon placement for Kigamboni Greens',
        agreedAmount: '3500000',
        status: 'COMPLETED',
        startDate: '2025-01-20',
        dueDate: '2025-02-15',
        completedAt: new Date('2025-02-10T10:00:00Z'),
    }).returning()

    const [auditorJob] = await db.insert(schema.vendorJobs).values({
        vendorContactId: auditors[0].id,
        title: 'Mbweni Due Diligence Audit',
        description: 'Legal and title audit for Mbweni Heights acquisition',
        agreedAmount: '2500000',
        status: 'IN_PROGRESS',
        startDate: '2025-03-25',
        dueDate: '2025-04-30',
    }).returning()

    await db.insert(schema.vendorJobProjects).values([
        {jobId: surveyorJob.id, projectId: projectRows[0].id, allocatedAmount: '3500000'},
        {jobId: auditorJob.id, projectId: projectRows[1].id, allocatedAmount: '2500000'},
    ])

    // --- Project Acquisitions ---
    console.log('  → Seeding project acquisitions...')
    const [kigamboniAcquisition] = await db.insert(schema.projectAcquisitions).values({
        projectId: projectRows[0].id,
        sellerContactId: landSellers[0].id,
        dealDate: '2025-01-15',
        totalPurchaseValue: '500000000',
        paymentPlan: 'INSTALLMENT',
        description: 'Primary acquisition for Kigamboni Greens',
    }).returning()

    const [mbweniAcquisition] = await db.insert(schema.projectAcquisitions).values({
        projectId: projectRows[1].id,
        sellerContactId: landSellers[0].id,
        dealDate: '2025-03-20',
        totalPurchaseValue: '450000000',
        paymentPlan: 'CASH',
        description: 'Primary acquisition for Mbweni Heights',
    }).returning()

    // --- Project Acquisition Installments ---
    console.log('  → Seeding project acquisition installments...')
    const acquisitionInstallmentRows = await db.insert(schema.projectAcquisitionInstallments).values([
        // Kigamboni - installment deal
        {
            acquisitionId: kigamboniAcquisition.id,
            installmentNo: 1,
            dueDate: '2025-01-15',
            amountDue: '250000000',
            amountPaid: '250000000',
            status: 'PAID',
            paidAt: new Date('2025-01-15T10:00:00Z'),
        },
        {
            acquisitionId: kigamboniAcquisition.id,
            installmentNo: 2,
            dueDate: '2025-04-15',
            amountDue: '150000000',
            amountPaid: '150000000',
            status: 'PAID',
            paidAt: new Date('2025-04-15T10:00:00Z'),
        },
        {
            acquisitionId: kigamboniAcquisition.id,
            installmentNo: 3,
            dueDate: '2025-07-15',
            amountDue: '100000000',
            status: 'DUE',
        },
        // Mbweni - cash deal
        {
            acquisitionId: mbweniAcquisition.id,
            installmentNo: 1,
            dueDate: '2025-03-20',
            amountDue: '450000000',
            amountPaid: '450000000',
            status: 'PAID',
            paidAt: new Date('2025-03-20T10:00:00Z'),
        },
    ]).returning()

    // --- Vendor Job & Acquisition Expenses ---
    console.log('  → Seeding vendor job and acquisition expenses...')
    await db.insert(schema.expenses).values([
        {
            category: 'VENDOR_JOB_PAYMENT',
            amount: '3500000',
            accountId: accountRows[0].id,
            payeeContactId: surveyors[0].id,
            vendorJobId: surveyorJob.id,
            projectId: projectRows[0].id,
            description: 'Final payment for Kigamboni boundary survey',
            paidAt: new Date('2025-02-15'),
        },
        {
            category: 'VENDOR_JOB_PAYMENT',
            amount: '1000000',
            accountId: accountRows[0].id,
            payeeContactId: auditors[0].id,
            vendorJobId: auditorJob.id,
            projectId: projectRows[1].id,
            description: 'Initial payment for Mbweni audit',
            paidAt: new Date('2025-03-30'),
        },
        {
            category: 'PROFESSIONAL_FEES',
            amount: '800000',
            accountId: accountRows[0].id,
            description: 'Legal consultation fees',
            paidAt: new Date('2025-04-05'),
        },
        {
            category: 'LAND_ACQUISITION',
            amount: '250000000',
            accountId: accountRows[0].id,
            payeeContactId: landSellers[0].id,
            projectId: projectRows[0].id,
            acquisitionInstallmentId: acquisitionInstallmentRows[0].id,
            description: 'First installment for Kigamboni acquisition',
            paidAt: new Date('2025-01-15'),
        },
        {
            category: 'LAND_ACQUISITION',
            amount: '150000000',
            accountId: accountRows[0].id,
            payeeContactId: landSellers[0].id,
            projectId: projectRows[0].id,
            acquisitionInstallmentId: acquisitionInstallmentRows[1].id,
            description: 'Second installment for Kigamboni acquisition',
            paidAt: new Date('2025-04-15'),
        },
    ])

    // --- SMS Campaigns & Messages ---
    console.log('  → Seeding SMS campaigns...')
    const smsSentAt = new Date(`${addDays(toDateStr(today), -3)}T09:00:00Z`)
    const smsDeliveredAt = new Date(smsSentAt.getTime() + 5000)

    const [reminderCampaign] = await db.insert(schema.smsCampaigns).values({
        name: 'Installment Payment Reminder',
        type: 'PAYMENT_REMINDER',
        templateBody: 'Hello {clientName}, your installment of TZS {amountDue} for plot {plotNumber} is due on {dueDate}. Please pay promptly. - Ardhi Flow',
        senderId: 'ARDHIFLOW',
        status: 'SENT',
        recipientCount: 3,
        createdBy: 'System',
        scheduledAt: smsSentAt,
    }).returning()

    console.log('  → Seeding SMS messages...')
    const activeContracts = contracts.filter(c => c.status === 'ACTIVE' || c.status === 'DELINQUENT')
    const messageData: schema.NewSmsMessage[] = []

    for (let i = 0; i < Math.min(3, activeContracts.length); i++) {
        const contract = activeContracts[i]
        const client = clients.find(c => c.id === contract.clientContactId)
        const plot = contractPlotsByContract.get(contract.id)?.[0]
        if (!client || !plot) continue

        messageData.push({
            campaignId: reminderCampaign.id,
            contactId: client.id,
            contractId: contract.id,
            phoneNumber: client.mobileNumber || randomPhone(),
            body: `Hello ${client.fullName}, your installment for plot ${plot.plotNumber} is due soon. Please pay promptly. - Ardhi Flow`,
            status: 'DELIVERED',
            providerMessageId: `NEXTSMS-${randomInt(100000, 999999)}`,
            sentAt: smsSentAt,
            deliveredAt: smsDeliveredAt,
        })
    }

    const messageRows = await db.insert(schema.smsMessages).values(messageData).returning()

    console.log('  → Seeding SMS delivery events...')
    for (const msg of messageRows) {
        await db.insert(schema.smsDeliveryEvents).values({
            messageId: msg.id,
            status: 'Delivered',
            rawPayload: {status: 'Delivered', messageId: msg.providerMessageId},
            receivedAt: msg.deliveredAt || new Date(),
        })
    }

    console.log('\n✓ Seeding complete!')

    await tenantPool.end()
    await catalogPool.end()
}

main().catch((err) => {
    console.error('❌ Seeding failed:', err)
    process.exit(1)
})
