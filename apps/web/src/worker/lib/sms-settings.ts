import type {Env} from '../types'
import type {TenantDb} from './tenant-db'
import {decryptSecret, type Keyring} from './crypto'
import {createNextSmsClient, type NextSmsBalance, type NextSmsClient, type NextSmsResult} from './nextsms'

export interface LoadedSmsSettings {
    senderId: string
    webhookKey: string
    apiToken: string
    // Decrypted only when asked for: most callers never need it.
    decryptVerifyToken: () => Promise<string>
    client: NextSmsClient
    // The balance through the throttle fallback below. Use this, not
    // client.getBalance(), everywhere except the settings save token check.
    getBalance: () => Promise<NextSmsResult<NextSmsBalance>>
}

// NextSMS's nginx answers /v2/balance with 429 after about two calls in a few
// seconds and recovers within about 20 (no Retry-After header). Preview, test
// send and send each read the balance, so normal editing trips it. Every good
// reading is kept for a short while, and a throttled call falls back to it.
const BALANCE_FALLBACK_TTL_SECONDS = 120

async function readBalance(
    env: Pick<Env, 'TENANT_CACHE'>,
    orgId: string,
    client: NextSmsClient,
): Promise<NextSmsResult<NextSmsBalance>> {
    const cacheKey = `smsbalance:${orgId}`
    const live = await client.getBalance()
    if (live.ok) {
        await env.TENANT_CACHE.put(cacheKey, JSON.stringify(live.data), {expirationTtl: BALANCE_FALLBACK_TTL_SECONDS})
        return live
    }
    if (live.kind === 'unknown' && live.status === 429) {
        const last = await env.TENANT_CACHE.get<NextSmsBalance>(cacheKey, 'json')
        if (last) return {ok: true, data: last}
    }
    return live
}

// The tenant's NextSMS settings with the API token decrypted, or null when
// SMS is not set up (callers answer 409 `sms_not_configured`). Throws
// SecretDecryptError when a stored value can't be read.
export async function loadSmsSettings(
    env: Pick<Env, 'NEXTSMS_BASE_URL' | 'TENANT_CACHE'>,
    db: TenantDb,
    keyring: Keyring,
    orgId: string,
): Promise<LoadedSmsSettings | null> {
    const row = await db.query.smsSettings.findFirst()
    if (!row) return null

    const {plaintext: apiToken} = await decryptSecret(row.apiTokenEncrypted, keyring, orgId, 'sms_api_token')
    const client = createNextSmsClient({baseUrl: env.NEXTSMS_BASE_URL, token: apiToken})
    return {
        senderId: row.senderId,
        webhookKey: row.webhookKey,
        apiToken,
        decryptVerifyToken: async () =>
            (await decryptSecret(row.webhookVerifyTokenEncrypted, keyring, orgId, 'sms_verify_token')).plaintext,
        client,
        getBalance: () => readBalance(env, orgId, client),
    }
}

export const SMS_NOT_CONFIGURED = {error: 'sms_not_configured', message: 'SMS is not set up for this organization'} as const
