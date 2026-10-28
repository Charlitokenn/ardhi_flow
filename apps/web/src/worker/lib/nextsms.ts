// NextSMS v2 client and status mapping. See docs/specs/0004-sms-send-flow,
// "NextSMS facts this design relies on", and context/library-docs.md.
//
// Every call returns a typed result instead of throwing, and separates two
// kinds of failure, because the send pipeline treats them differently:
//   - refused: NextSMS answered and said no (401, 422, other 4xx). Nothing
//     was sent, so it is safe to mark the messages FAILED and stop.
//   - unknown: no usable answer (network error, timeout, 429, 5xx). The
//     request may or may not have landed, so it must never be blindly resent.
//
// The token is only ever put in the Authorization header. It is never logged
// and never part of an error message.

const REQUEST_TIMEOUT_MS = 15_000

export type NextSmsResult<T> =
    | {ok: true; data: T}
    | {ok: false; kind: 'refused'; status: number; message: string}
    | {ok: false; kind: 'unknown'; status: number | null; message: string}

export interface NextSmsStatus {
    groupId?: number
    groupName: string
    id?: number
    name: string
    description?: string
}

export interface NextSmsSentMessage {
    to: string
    status: NextSmsStatus
    // A 64 bit number in NextSMS's JSON, kept as a string so it never loses precision.
    messageId?: string
    smsCount?: number
    price?: number
}

export interface NextSmsSendReply {
    messages: NextSmsSentMessage[]
}

export interface NextSmsBalance {
    sms_balance: number
    display?: string
}

export interface NextSmsReport {
    messageId: string
    to?: string
    status: NextSmsStatus
    doneAt?: string
}

export interface NextSmsLogEntry {
    messageId?: string
    to: string
    status?: NextSmsStatus
    reference?: string
}

// JSON.parse would round a 64 bit messageId to the nearest double, so bare
// numeric ids are quoted before parsing.
export function parseJsonKeepingIds(text: string): unknown {
    return JSON.parse(text.replace(/("messageId"\s*:\s*)(\d+)/g, '$1"$2"'))
}

function errorMessage(body: unknown, status: number): string {
    if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>
        if (typeof record.message === 'string') return record.message.slice(0, 200)
        if (typeof record.error === 'string') return record.error.slice(0, 200)
    }
    return `NextSMS returned HTTP ${status}`
}

export function createNextSmsClient(options: {baseUrl: string; token: string}) {
    const baseUrl = options.baseUrl.replace(/\/+$/, '')

    async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<NextSmsResult<T>> {
        let response: Response
        try {
            response = await fetch(`${baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${options.token}`,
                    // Without it, NextSMS answers validation errors with a redirect.
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                redirect: 'manual',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        } catch (err) {
            const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
            return {ok: false, kind: 'unknown', status: null, message: timedOut ? 'NextSMS timed out' : 'NextSMS unreachable'}
        }

        const text = await response.text().catch(() => '')
        let parsed: unknown
        try {
            parsed = text ? parseJsonKeepingIds(text) : null
        } catch {
            parsed = null
        }

        if (response.ok) {
            if (parsed === null) return {ok: false, kind: 'unknown', status: response.status, message: 'NextSMS sent an unreadable reply'}
            return {ok: true, data: parsed as T}
        }
        if (response.status === 429 || response.status >= 500) {
            return {ok: false, kind: 'unknown', status: response.status, message: errorMessage(parsed, response.status)}
        }
        // 3xx (a redirect despite the Accept header) and every other 4xx: refused.
        return {ok: false, kind: 'refused', status: response.status, message: errorMessage(parsed, response.status)}
    }

    return {
        getBalance: () => call<NextSmsBalance>('GET', '/api/v2/balance'),

        // One text to one or more numbers. `test: true` uses the validation
        // endpoint: nothing is sent or charged, and its messageIds are not real.
        sendSingle: (input: {from: string; to: string | string[]; text: string; reference?: string; test?: boolean}) =>
            call<NextSmsSendReply>('POST', input.test ? '/api/sms/v2/test/text/single' : '/api/sms/v2/text/single', {
                from: input.from,
                to: input.to,
                text: input.text,
                ...(input.reference ? {reference: input.reference} : {}),
            }),

        // Up to 500 different texts in one request.
        sendMulti: (input: {messages: {from: string; to: string; text: string}[]; reference: string}) =>
            call<NextSmsSendReply>('POST', '/api/sms/v2/text/multi', input),

        getReports: (messageIds: string[]) => {
            const query = messageIds.map((id) => `messageId=${encodeURIComponent(id)}`).join('&')
            return call<{results: NextSmsReport[]}>('GET', `/api/v2/reports?${query}`)
        },

        getLogs: (input: {reference: string; sentSince: string; offset?: number}) => {
            const query = new URLSearchParams({
                reference: input.reference,
                sentSince: input.sentSince,
                limit: '200',
                offset: String(input.offset ?? 0),
            })
            return call<{results: NextSmsLogEntry[]}>('GET', `/api/v2/logs?${query.toString()}`)
        },
    }
}

export type NextSmsClient = ReturnType<typeof createNextSmsClient>

// ── status mapping ──────────────────────────────────────────────────────────

// Used only on the /text/single and /text/multi reply. PENDING means NextSMS
// accepted the message; anything else means it was rejected at submit.
export function mapSendReplyStatus(status: Pick<NextSmsStatus, 'groupName' | 'name'> | undefined): {
    status: 'SENT' | 'FAILED'
    errorReason: string | null
} {
    if (status?.groupName === 'PENDING') return {status: 'SENT', errorReason: null}
    return {status: 'FAILED', errorReason: status?.name ?? 'missing status'}
}

type ReportOutcome = 'DELIVERED' | 'EXPIRED' | 'UNDELIVERED' | 'FAILED'

const REPORT_NAME_MAP: Record<string, ReportOutcome | null> = {
    DELIVERED: 'DELIVERED',
    EXPIRED: 'EXPIRED',
    UNDELIVERABLE: 'UNDELIVERED',
    DELETED: 'UNDELIVERED',
    SKIPPED: 'UNDELIVERED',
    UNKNOWN: 'UNDELIVERED',
    DISCARDED: 'UNDELIVERED',
    // In a delivery report a plain REJECTED (id 79) is the carrier saying "not
    // delivered" after acceptance, so a message can never go QUEUED -> UNDELIVERED.
    REJECTED: 'UNDELIVERED',
    MISSING_TO: 'FAILED',
    PENDING_WAITING_DELIVERY: null,
    'ENROUTE (SENT)': null,
    ACCEPTED: null,
    DISPATCHED: null,
    PENDING: null,
}

// Used by the webhook (one status string, passed as `name`) and the sweep
// (status.name, falling back to status.groupName). The exact name is matched
// first, then the group. null means "no change, the message stays SENT".
export function mapReportStatus(name: string | null | undefined, groupName?: string | null): ReportOutcome | null {
    const exact = name?.trim().toUpperCase()
    if (exact) {
        if (exact in REPORT_NAME_MAP) return REPORT_NAME_MAP[exact]
        if (exact.startsWith('REJECTED_') || exact.startsWith('FAILED_')) return 'FAILED'
    }
    // The webhook sends a single string that may be a group name.
    const group = (groupName ?? name)?.trim().toUpperCase()
    if (group === 'REJECTED' || group === 'FAILED') return 'FAILED'
    return null
}

export const FINAL_MESSAGE_STATUSES = ['DELIVERED', 'UNDELIVERED', 'FAILED', 'EXPIRED'] as const
