import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import type {Env, Variables} from '../types'
import {smsSettings} from '../../../drizzle/tenant/schema'
import {decryptSecret, encryptSecret, randomUrlToken} from '../lib/crypto'
import {createNextSmsClient} from '../lib/nextsms'
import {loadSmsSettings, SMS_NOT_CONFIGURED} from '../lib/sms-settings'
import {setSmsWebhookKey} from '../lib/sms-webhook-keys'

// The tenant's own NextSMS account (docs/specs/0004-sms-send-flow, AC-1,
// AC-2, AC-18). Any member can see whether SMS is set up, the sender ID, and
// the balance. Only an org admin can see or change the token, the verify
// token, and the webhook URL, and the API token itself never leaves the
// Worker: admins only ever get its last 4 characters.

// Free validation send used to check a sender ID: nothing is sent or charged.
const SENDER_CHECK_NUMBER = '255700000000'

const putBodySchema = z.object({
    senderId: z.string().trim().min(1).max(50),
    // Required on the first save; omitted afterwards keeps the stored token.
    apiToken: z.string().trim().min(1).optional(),
})

function webhookUrl(requestUrl: string, key: string): string {
    return `${new URL(requestUrl).origin}/api/webhooks/nextsms/${key}`
}

const smsSettingsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const row = await c.get('tenantDb').query.smsSettings.findFirst()
        if (!row) {
            return c.json({configured: false as const, senderId: null, tokenLast4: null, webhookUrl: null, verifyToken: null})
        }
        if (c.get('orgRole') !== 'org:admin') {
            return c.json({configured: true as const, senderId: row.senderId, tokenLast4: null, webhookUrl: null, verifyToken: null})
        }

        const keyring = c.get('keyring')
        const orgId = c.get('orgId')
        const [apiToken, verifyToken] = await Promise.all([
            decryptSecret(row.apiTokenEncrypted, keyring, orgId, 'sms_api_token'),
            decryptSecret(row.webhookVerifyTokenEncrypted, keyring, orgId, 'sms_verify_token'),
        ])
        return c.json({
            configured: true as const,
            senderId: row.senderId,
            tokenLast4: apiToken.plaintext.slice(-4),
            webhookUrl: webhookUrl(c.req.url, row.webhookKey),
            verifyToken: verifyToken.plaintext,
        })
    })
    .put('/', zValidator('json', putBodySchema), async (c) => {
        if (c.get('orgRole') !== 'org:admin') {
            return c.json({error: 'forbidden', message: 'Only an org admin can change SMS settings'}, 403)
        }

        const {senderId, apiToken: submittedToken} = c.req.valid('json')
        const db = c.get('tenantDb')
        const keyring = c.get('keyring')
        const orgId = c.get('orgId')

        const existing = await db.query.smsSettings.findFirst()
        if (!existing && !submittedToken) {
            return c.json({error: 'invalid', message: 'An API token is required the first time SMS is set up'}, 422)
        }
        const apiToken = submittedToken
            ?? (await decryptSecret(existing!.apiTokenEncrypted, keyring, orgId, 'sms_api_token')).plaintext

        const client = createNextSmsClient({baseUrl: c.env.NEXTSMS_BASE_URL, token: apiToken})

        // Token check: NextSMS refusing the balance call means the token is bad.
        const balance = await client.getBalance()
        if (!balance.ok) {
            if (balance.kind === 'refused') {
                return c.json({error: 'token_rejected', message: 'NextSMS rejected this API token'}, 422)
            }
            return c.json({error: 'nextsms_unavailable', message: 'Could not reach NextSMS, try again'}, 502)
        }

        // Sender ID check through the free validation endpoint.
        const senderCheck = await client.sendSingle({from: senderId, to: SENDER_CHECK_NUMBER, text: 'test', test: true})
        if (!senderCheck.ok) {
            if (senderCheck.kind === 'refused') {
                return c.json({error: 'sender_rejected', message: `NextSMS rejected the sender ID "${senderId}"`}, 422)
            }
            return c.json({error: 'nextsms_unavailable', message: 'Could not reach NextSMS, try again'}, 502)
        }
        if (senderCheck.data.messages?.[0]?.status?.groupName === 'REJECTED') {
            return c.json({
                error: 'sender_rejected',
                message: `NextSMS rejected the sender ID "${senderId}" (${senderCheck.data.messages[0].status.name})`,
            }, 422)
        }

        // The catalog write only sets a key when none exists, then reads the
        // stored one back, so a retry after a half failed save reuses it.
        const webhookKey = existing?.webhookKey ?? await setSmsWebhookKey(c.env, orgId, randomUrlToken(32))

        const apiTokenEncrypted = submittedToken
            ? await encryptSecret(submittedToken, keyring, orgId, 'sms_api_token')
            : existing!.apiTokenEncrypted
        const verifyToken = existing
            ? (await decryptSecret(existing.webhookVerifyTokenEncrypted, keyring, orgId, 'sms_verify_token')).plaintext
            : randomUrlToken(24)
        const webhookVerifyTokenEncrypted = existing?.webhookVerifyTokenEncrypted
            ?? await encryptSecret(verifyToken, keyring, orgId, 'sms_verify_token')

        const values = {
            senderId,
            apiTokenEncrypted,
            webhookKey,
            webhookVerifyTokenEncrypted,
            updatedBy: c.get('userId'),
        }
        await db
            .insert(smsSettings)
            .values({singleton: true, ...values})
            .onConflictDoUpdate({target: smsSettings.singleton, set: {...values, updatedAt: new Date()}})

        // Org id, sender id and whether the account changed only. Never a token.
        console.log(`[sms-settings] org ${orgId} saved sender ${senderId}, accountChanged=${Boolean(existing && submittedToken)}`)

        return c.json({
            configured: true as const,
            senderId,
            tokenLast4: apiToken.slice(-4),
            webhookUrl: webhookUrl(c.req.url, webhookKey),
            verifyToken,
            // The admin must paste the webhook URL and verify token into the new
            // NextSMS account too, or delivery reports stop arriving.
            accountChanged: Boolean(existing && submittedToken),
        })
    })
    .get('/balance', async (c) => {
        const settings = await loadSmsSettings(c.env, c.get('tenantDb'), c.get('keyring'), c.get('orgId'))
        if (!settings) return c.json(SMS_NOT_CONFIGURED, 409)

        const balance = await settings.client.getBalance()
        if (!balance.ok) {
            return c.json({error: 'nextsms_unavailable', message: 'Could not read the NextSMS balance'}, 502)
        }
        return c.json({
            smsBalance: Number(balance.data.sms_balance),
            display: balance.data.display ?? `TZS ${Number(balance.data.sms_balance).toLocaleString('en-US')}`,
        })
    })

export default smsSettingsRoute
