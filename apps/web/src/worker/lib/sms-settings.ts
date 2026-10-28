import type {Env} from '../types'
import type {TenantDb} from './tenant-db'
import {decryptSecret, type Keyring} from './crypto'
import {createNextSmsClient, type NextSmsClient} from './nextsms'

export interface LoadedSmsSettings {
    senderId: string
    webhookKey: string
    apiToken: string
    // Decrypted only when asked for: most callers never need it.
    decryptVerifyToken: () => Promise<string>
    client: NextSmsClient
}

// The tenant's NextSMS settings with the API token decrypted, or null when
// SMS is not set up (callers answer 409 `sms_not_configured`). Throws
// SecretDecryptError when a stored value can't be read.
export async function loadSmsSettings(
    env: Pick<Env, 'NEXTSMS_BASE_URL'>,
    db: TenantDb,
    keyring: Keyring,
    orgId: string,
): Promise<LoadedSmsSettings | null> {
    const row = await db.query.smsSettings.findFirst()
    if (!row) return null

    const {plaintext: apiToken} = await decryptSecret(row.apiTokenEncrypted, keyring, orgId, 'sms_api_token')
    return {
        senderId: row.senderId,
        webhookKey: row.webhookKey,
        apiToken,
        decryptVerifyToken: async () =>
            (await decryptSecret(row.webhookVerifyTokenEncrypted, keyring, orgId, 'sms_verify_token')).plaintext,
        client: createNextSmsClient({baseUrl: env.NEXTSMS_BASE_URL, token: apiToken}),
    }
}

export const SMS_NOT_CONFIGURED = {error: 'sms_not_configured', message: 'SMS is not set up for this organization'} as const
