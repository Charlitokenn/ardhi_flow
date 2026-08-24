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
import {eq} from 'drizzle-orm'
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
        // We need to clear plots.activeContractId before deleting plotSaleContracts
        await db.update(schema.plots).set({activeContractId: null})
        await db.delete(schema.plotSaleContracts)
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
    const addMonths = (dateStr: string, months: number) => {
        const d = new Date(dateStr)
        d.setMonth(d.getMonth() + months)
        return d.toISOString().split('T')[0]
    }

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

    const contactRows = await db.insert(schema.contacts).values(contactData).returning()
    const clients = contactRows.filter(c => c.contactType === 'CLIENT')
    const agents = contactRows.filter(c => c.contactType === 'SALES_AGENT')
    const landSellers = contactRows.filter(c => c.contactType === 'LAND_SELLER')

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
    console.log('  → Seeding contracts...')
    // Explicit plot → client assignments (rather than a flat positional slice)
    // so ownership patterns are intentional and easy to read:
    //  - clients[0] buys two plots within the same project (Kigamboni Greens)
    //  - clients[1] buys one plot in each project (cross-project ownership)
    //  - clients[2] buys three plots split across both projects
    //  - the rest each buy a single plot, split across both projects, to keep
    //    the common case represented too
    const [kigamboni, mbweni] = projectRows
    const kigamboniPlots = plotRows.filter((p) => p.projectId === kigamboni.id)
    const mbweniPlots = plotRows.filter((p) => p.projectId === mbweni.id)

    const saleAssignments: { plot: (typeof plotRows)[number]; client: (typeof clients)[number] }[] = [
        // Same-project multi-plot buyer
        {plot: kigamboniPlots[0], client: clients[0]},
        {plot: kigamboniPlots[1], client: clients[0]},
        // Cross-project, two-plot buyer
        {plot: kigamboniPlots[2], client: clients[1]},
        {plot: mbweniPlots[0], client: clients[1]},
        // Cross-project, three-plot buyer
        {plot: kigamboniPlots[3], client: clients[2]},
        {plot: kigamboniPlots[4], client: clients[2]},
        {plot: mbweniPlots[1], client: clients[2]},
        // Single-plot buyers, spread across both projects
        {plot: kigamboniPlots[5], client: clients[3]},
        {plot: kigamboniPlots[6], client: clients[4]},
        {plot: mbweniPlots[2], client: clients[5]},
        {plot: mbweniPlots[3], client: clients[6]},
        {plot: mbweniPlots[4], client: clients[7]},
    ]
    const contracts: schema.PlotSaleContract[] = []

    for (let i = 0; i < saleAssignments.length; i++) {
        const {plot, client} = saleAssignments[i]
        const agent = agents[i % agents.length]
        const totalVal = randomInt(15000000, 30000000)
        const downpayment = Math.floor(totalVal * 0.2)
        const financed = totalVal - downpayment
        const status = i < 5 ? 'ACTIVE' : (i === 5 ? 'DELINQUENT' : 'COMPLETED')

        const [contract] = await db.insert(schema.plotSaleContracts).values({
            plotId: plot.id,
            clientContactId: client.id,
            salesAgentContactId: agent.id,
            status: status,
            startDate: '2025-05-01',
            termMonths: 12,
            totalContractValue: totalVal.toString(),
            purchasePlan: 'DOWNPAYMENT',
            downpaymentPercent: '20',
            downpaymentAmount: downpayment.toString(),
            financedAmount: financed.toString(),
            cancellationFeePercent: '10',
            commissionPercent: commSettings.defaultCommissionPercent,
            commissionAmount: (totalVal * parseFloat(commSettings.defaultCommissionPercent) / 100).toString(),
            commissionPayoutMonths: commSettings.defaultPayoutMonths,
        }).returning()

        contracts.push(contract)

        // Update plot status and contact
        await db.update(schema.plots)
            .set({
                availability: 'SOLD',
                contactId: client.id,
                activeContractId: status === 'COMPLETED' ? null : contract.id
            })
            .where(eq(schema.plots.id, plot.id))

        // --- Installments ---
        const installments: schema.NewContractInstallment[] = []

        // Downpayment installment (No 0)
        installments.push({
            contractId: contract.id,
            installmentNo: 0,
            originalDueDate: '2025-05-01',
            dueDate: '2025-05-01',
            amountDue: downpayment.toString(),
            status: 'PAID',
            paidAt: new Date('2025-05-01T10:00:00Z'),
            amountPaid: downpayment.toString(),
        })

        const monthlyAmt = Math.floor(financed / 12)
        for (let m = 1; m <= 12; m++) {
            const dueDate = addMonths('2025-05-01', m)
            let instStatus: 'PAID' | 'PARTIAL' | 'DUE' = 'DUE'
            let amtPaid = '0'
            let paidAt = null

            if (status === 'COMPLETED') {
                instStatus = 'PAID'
                amtPaid = monthlyAmt.toString()
                paidAt = new Date(`${dueDate}T10:00:00Z`)
            } else if (m <= 2) {
                instStatus = 'PAID'
                amtPaid = monthlyAmt.toString()
                paidAt = new Date(`${dueDate}T10:00:00Z`)
            } else if (m === 3 && status === 'ACTIVE') {
                instStatus = 'PARTIAL'
                amtPaid = Math.floor(monthlyAmt / 2).toString()
            }

            installments.push({
                contractId: contract.id,
                installmentNo: m,
                originalDueDate: dueDate,
                dueDate: dueDate,
                amountDue: monthlyAmt.toString(),
                status: instStatus,
                amountPaid: amtPaid,
                paidAt: paidAt,
            })
        }

        const insertedInsts = await db.insert(schema.contractInstallments).values(installments).returning()

        // --- Payments ---
        // Only seed payments for what was actually paid
        for (const inst of insertedInsts) {
            if (parseFloat(inst.amountPaid) > 0) {
                const [payment] = await db.insert(schema.contractPayments).values({
                    contractId: contract.id,
                    clientContactId: client.id,
                    accountId: randomElement(accountRows).id,
                    direction: 'IN',
                    amount: inst.amountPaid,
                    receivedAt: inst.paidAt || new Date(inst.dueDate),
                    method: 'Bank Transfer',
                }).returning()

                await db.insert(schema.contractPaymentAllocations).values({
                    paymentId: payment.id,
                    installmentId: inst.id,
                    amount: inst.amountPaid,
                })

                // --- Commission Payouts (simplified: release tranche if payment is made)
                // Just seed the 3 tranches for the contract
                if (inst.installmentNo === 1) { // Just do it once per contract
                    const trancheAmt = (parseFloat(contract.commissionAmount) / contract.commissionPayoutMonths).toString();
                    for (let t = 1; t <= contract.commissionPayoutMonths; t++) {
                        const targetMonth = addMonths(contract.startDate, t - 1);
                        const isPaid = (status === 'COMPLETED' || t === 1);

                        const [payout] = await db.insert(schema.commissionPayouts).values({
                            contractId: contract.id,
                            salesAgentContactId: agent.id,
                            trancheNumber: t,
                            amount: trancheAmt,
                            targetMonth: targetMonth,
                            status: isPaid ? 'PAID' : 'PENDING',
                            triggeringPaymentId: isPaid ? payment.id : null,
                            paidAt: isPaid ? new Date() : null,
                            paidMonth: isPaid ? new Date().toISOString().split('T')[0] : null,
                        }).returning();

                        if (isPaid) {
                            await db.insert(schema.expenses).values({
                                category: 'SALES_COMMISSION',
                                amount: trancheAmt,
                                accountId: randomElement(accountRows).id,
                                payeeContactId: agent.id,
                                commissionPayoutId: payout.id,
                                description: `Commission for ${client.fullName} - Plot ${plot.plotNumber} (Tranche ${t})`,
                                paidAt: new Date(),
                            });
                        }
                    }
                }
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

        if (status === 'DELINQUENT') {
            const overdueInst = insertedInsts.find((inst) => inst.status === 'PARTIAL')
            await db.insert(schema.contractEvents).values({
                contractId: contract.id,
                installmentId: overdueInst?.id,
                eventType: 'DELINQUENT_MARKED',
                message: 'Contract marked delinquent after a missed installment.',
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
            description: 'Office rent - May 2025',
            paidAt: new Date('2025-05-05'),
        },
        {
            category: 'MARKETING',
            amount: '500000',
            accountId: accountRows[2].id,
            description: 'Facebook ads for Kigamboni plots',
            paidAt: new Date('2025-05-10'),
        }
    ])

    console.log('\n✓ Seeding complete!')

    await tenantPool.end()
    await catalogPool.end()
}

main().catch((err) => {
    console.error('❌ Seeding failed:', err)
    process.exit(1)
})