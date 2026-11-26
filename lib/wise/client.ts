/**
 * Wise Platform API client for MAPL's own Wise Business account (MAPL TECH
 * INC., Canada), authenticated with a personal API token.
 *
 * A personal token may create quotes, read recipients, validate and create
 * transfers and track them. Funding a transfer from the balance over the API
 * is allowed only for business accounts in the US, Canada, Australia, New
 * Zealand, Singapore and Malaysia (docs.wise.com, "Personal API tokens"); ours
 * is Canadian. Paths are the 2026Q4 calendar version, checked against the live
 * API on Nov 15 2026 (profiles and quotes answered on /2026Q4/...).
 *
 * Money safety lives in the callers (lib/payouts/run.ts). This module only
 * speaks HTTP, and it says honestly what it knows about each failure:
 *  - `ambiguous: true` means the request may have taken effect (no answer, a
 *    timeout, a 5xx, a 429). A caller must never treat it as "nothing
 *    happened".
 *  - `ambiguous: false` means Wise answered with a refusal (4xx): nothing was
 *    done.
 * The token is never logged, echoed or put in an error message.
 */

export const WISE_API_VERSION = '2026Q4'

export const WISE_HOSTS = {
  production: 'https://api.wise.com',
  sandbox: 'https://api.wise-sandbox.com',
} as const

export type WiseEnv = keyof typeof WISE_HOSTS

/** A request Wise refused, or one whose outcome is unknown. */
export class WiseApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, 0 when no answer came back. */
    readonly status: number,
    /** Wise's machine-readable code when it sent one (errors[0].code, errorCode or code). */
    readonly code: string | null,
    /** true when the request may still have taken effect. */
    readonly ambiguous: boolean,
    /**
     * The fields Wise named in a refusal (errors[].path, e.g. "abartn" or
     * "address.postCode"), so a form can point at them. Never the values.
     */
    readonly paths: string[] = [],
  ) {
    super(message)
    this.name = 'WiseApiError'
  }
}

/** The fields a refusal names, from Wise's errors[].path. Values (errors[].arguments) are never read. */
function errorPaths(body: unknown): string[] {
  if (!body || typeof body !== 'object') return []
  const errs = (body as Record<string, unknown>).errors
  if (!Array.isArray(errs)) return []
  return errs
    .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>).path : null))
    .filter((p): p is string => typeof p === 'string' && /^[A-Za-z.[\]0-9_]{1,60}$/.test(p))
}

export interface WiseRecipient {
  id: number
  currency: string
  /** Wise's recipient type: 'swift_code' for an international wire, 'aba' for a US account, and so on. */
  type: string
  active: boolean
  /** The account holder's name as Wise holds it. */
  name: string | null
}

export interface WiseQuoteOption {
  payIn: string
  payOut: string
  disabled: boolean
  disabledReason: string | null
  /** Everything Wise charges for this option, in the source currency. */
  feeTotal: number
  /** What leaves the balance: the amount sent plus the fee. */
  sourceAmount: number
  targetAmount: number
  /** When Wise says the money is in the recipient's account if funded now (an ISO instant), or null. */
  estimatedDelivery: string | null
}

export interface WiseQuote {
  id: string
  status: string
  payOut: string | null
  sourceCurrency: string
  targetCurrency: string
  targetAmount: number
  /** The payment option matching the quote's own payIn and payOut, or null if Wise listed none. */
  option: WiseQuoteOption | null
  expirationTime: string | null
}

export interface WiseTransfer {
  id: number
  status: string
  targetAccount: number
  quoteUuid: string | null
  sourceValue: number | null
  targetValue: number | null
  targetCurrency: string | null
  reference: string | null
}

export interface WiseFunding {
  status: 'CREATED' | 'COMPLETED' | 'REJECTED'
  errorCode: string | null
  errorMessage: string | null
}

/** One field of the transfer-requirements answer, flattened. */
export interface WiseRequirementField {
  key: string
  required: boolean
  minLength: number | null
  maxLength: number | null
  validationRegexp: string | null
  valuesAllowed: string[] | null
}

export interface WiseQuoteInput {
  profileId: number
  currency: string
  targetAmount: number
  targetAccount: number
  /** 'SWIFT_OUR' when MAPL pays every bank's charge so the driver receives the full amount. */
  payOut?: string | null
  balanceId?: number | null
}

export interface WiseTransferInput {
  targetAccount: number
  quoteUuid: string
  customerTransactionId: string
  reference: string
}

export interface WiseApi {
  getRecipient(accountId: number): Promise<WiseRecipient>
  createQuote(input: WiseQuoteInput): Promise<WiseQuote>
  transferRequirements(input: WiseTransferInput): Promise<WiseRequirementField[]>
  createTransfer(input: WiseTransferInput): Promise<WiseTransfer>
  fundFromBalance(profileId: number, transferId: number, balanceId?: number | null): Promise<WiseFunding>
  getTransfer(transferId: number): Promise<WiseTransfer>
  cancelTransfer(transferId: number): Promise<WiseTransfer>
}

/**
 * Recipients a referrer adds from /referrals (lib/referrals/payout-server):
 * create one from the details they typed, and switch off the one it
 * replaces. Kept apart from WiseApi so the payout run's own fakes and calls
 * are untouched.
 */
export interface WiseRecipientApi {
  /**
   * POST /v1/accounts, the call MAPL's own recipients were created with (Nov
   * 2026). Answers only the id, currency, type, state and holder name
   * (parseRecipient): Wise echoes the full account number back, and it is
   * never kept. A refusal carries the fields Wise named (WiseApiError.paths).
   */
  createRecipient(body: Record<string, unknown>): Promise<WiseRecipient>
  /** DELETE /2026Q4/accounts/{id}: the recipient becomes inactive (Wise cannot reactivate one). */
  deactivateRecipient(accountId: number): Promise<void>
}

export interface WiseClientOptions {
  token: string
  env: WiseEnv
  fetch?: typeof fetch
  /** Per request. A payout run has a few seconds in all, so this stays short. */
  timeoutMs?: number
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? NaN))
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Wise's error code from whichever of its error shapes came back. */
function errorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const first = Array.isArray(b.errors) ? (b.errors[0] as Record<string, unknown> | undefined) : undefined
  return str(first?.code) ?? str(b.errorCode) ?? str(b.code) ?? str(b.error) ?? null
}

function errorText(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  const first = Array.isArray(b.errors) ? (b.errors[0] as Record<string, unknown> | undefined) : undefined
  return (str(first?.message) ?? str(b.errorMessage) ?? str(b.message) ?? '').slice(0, 200)
}

export function parseRecipient(j: Record<string, unknown>): WiseRecipient {
  const name = j.name && typeof j.name === 'object' ? str((j.name as Record<string, unknown>).fullName) : null
  return {
    id: num(j.id),
    currency: String(j.currency ?? ''),
    type: String(j.type ?? ''),
    active: j.active !== false,
    name: name ?? str(j.accountHolderName),
  }
}

export function parseQuote(j: Record<string, unknown>): WiseQuote {
  const payOut = str(j.payOut)
  const payIn = str(j.preferredPayIn)
  const options = Array.isArray(j.paymentOptions) ? (j.paymentOptions as Record<string, unknown>[]) : []
  const match = options.find((o) => o.payOut === payOut && o.payIn === payIn) ?? null
  const fee = (match?.fee ?? {}) as Record<string, unknown>
  const reason = match?.disabledReason as Record<string, unknown> | undefined
  return {
    id: String(j.id ?? ''),
    status: String(j.status ?? ''),
    payOut,
    sourceCurrency: String(j.sourceCurrency ?? ''),
    targetCurrency: String(j.targetCurrency ?? ''),
    targetAmount: num(j.targetAmount),
    option: match
      ? {
          payIn: String(match.payIn),
          payOut: String(match.payOut),
          disabled: match.disabled === true,
          disabledReason: reason ? str(reason.code) ?? str(reason.message) : null,
          feeTotal: num(fee.total),
          sourceAmount: num(match.sourceAmount),
          targetAmount: num(match.targetAmount),
          estimatedDelivery: (() => {
            const at = str(match.estimatedDelivery)
            return at && Number.isFinite(Date.parse(at)) ? at : null
          })(),
        }
      : null,
    expirationTime: str(j.expirationTime),
  }
}

export function parseTransfer(j: Record<string, unknown>): WiseTransfer {
  const details = (j.details ?? {}) as Record<string, unknown>
  return {
    id: num(j.id),
    status: String(j.status ?? ''),
    targetAccount: num(j.targetAccount),
    quoteUuid: str(j.quoteUuid),
    sourceValue: j.sourceValue == null ? null : num(j.sourceValue),
    targetValue: j.targetValue == null ? null : num(j.targetValue),
    targetCurrency: str(j.targetCurrency),
    reference: str(details.reference) ?? str(j.reference),
  }
}

/** The requirements answer is a list of { type, fields: [{ group: [...] }] }; this flattens it to fields. */
export function parseRequirements(j: unknown): WiseRequirementField[] {
  const types = Array.isArray(j) ? j : j && typeof j === 'object' ? [j] : []
  const out: WiseRequirementField[] = []
  for (const t of types as Record<string, unknown>[]) {
    for (const f of (Array.isArray(t.fields) ? t.fields : []) as Record<string, unknown>[]) {
      for (const g of (Array.isArray(f.group) ? f.group : []) as Record<string, unknown>[]) {
        const allowed = Array.isArray(g.valuesAllowed)
          ? (g.valuesAllowed as Record<string, unknown>[]).map((v) => String(v.key ?? ''))
          : null
        out.push({
          key: String(g.key ?? ''),
          required: g.required === true,
          minLength: g.minLength == null ? null : num(g.minLength),
          maxLength: g.maxLength == null ? null : num(g.maxLength),
          validationRegexp: str(g.validationRegexp),
          valuesAllowed: allowed,
        })
      }
    }
  }
  return out
}

export function wiseClient(opts: WiseClientOptions): WiseApi & WiseRecipientApi {
  const host = WISE_HOSTS[opts.env]
  const doFetch = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 8000
  const v = WISE_API_VERSION

  async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    let res: Response
    try {
      res = await doFetch(`${host}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
          'X-External-Correlation-Id': crypto.randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      // No answer at all: the request may or may not have reached Wise.
      const what = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'no answer'
      throw new WiseApiError(`${method} ${path.replace(/\d{5,}/g, ':id')}: ${what}`, 0, null, true)
    }
    const text = await res.text().catch(() => '')
    let parsed: unknown = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
    if (!res.ok) {
      const ambiguous = res.status >= 500 || res.status === 429 || res.status === 408
      const code = errorCode(parsed)
      throw new WiseApiError(
        `${method} ${path.replace(/\d{5,}/g, ':id')}: ${res.status}${code ? ` ${code}` : ''}${errorText(parsed) ? ` (${errorText(parsed)})` : ''}`,
        res.status,
        code,
        ambiguous,
        errorPaths(parsed),
      )
    }
    return parsed
  }

  return {
    async getRecipient(accountId) {
      return parseRecipient((await call('GET', `/${v}/accounts/${accountId}`)) as Record<string, unknown>)
    },
    async createQuote(input) {
      const body: Record<string, unknown> = {
        sourceCurrency: input.currency,
        targetCurrency: input.currency,
        targetAmount: input.targetAmount,
        targetAccount: input.targetAccount,
        preferredPayIn: 'BALANCE',
        payInMethod: 'BALANCE',
      }
      if (input.payOut) body.payOut = input.payOut
      if (input.balanceId) {
        body.preferredPayInId = input.balanceId
        body.payInId = input.balanceId
      }
      return parseQuote((await call('POST', `/${v}/profiles/${input.profileId}/quotes`, body)) as Record<string, unknown>)
    },
    async transferRequirements(input) {
      return parseRequirements(await call('POST', `/${v}/transfer-requirements`, {
        targetAccount: input.targetAccount,
        quoteUuid: input.quoteUuid,
        customerTransactionId: input.customerTransactionId,
        details: { reference: input.reference },
      }))
    },
    async createTransfer(input) {
      return parseTransfer((await call('POST', `/${v}/transfers`, {
        targetAccount: input.targetAccount,
        quoteUuid: input.quoteUuid,
        customerTransactionId: input.customerTransactionId,
        details: { reference: input.reference },
      })) as Record<string, unknown>)
    },
    async fundFromBalance(profileId, transferId, balanceId) {
      const j = (await call('POST', `/${v}/profiles/${profileId}/transfers/${transferId}/payments`, {
        type: 'BALANCE',
        ...(balanceId ? { balanceId } : {}),
      })) as Record<string, unknown>
      const status = String(j?.status ?? '')
      return {
        status: (status === 'COMPLETED' || status === 'CREATED' || status === 'REJECTED' ? status : 'REJECTED') as WiseFunding['status'],
        errorCode: str(j?.errorCode),
        errorMessage: str(j?.errorMessage),
      }
    },
    async getTransfer(transferId) {
      return parseTransfer((await call('GET', `/${v}/transfers/${transferId}`)) as Record<string, unknown>)
    },
    async cancelTransfer(transferId) {
      return parseTransfer((await call('PUT', `/${v}/transfers/${transferId}/cancel`)) as Record<string, unknown>)
    },
    async createRecipient(body) {
      return parseRecipient((await call('POST', '/v1/accounts', body)) as Record<string, unknown>)
    },
    async deactivateRecipient(accountId) {
      await call('DELETE', `/${v}/accounts/${accountId}`)
    },
  }
}
