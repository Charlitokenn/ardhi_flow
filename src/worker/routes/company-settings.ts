import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Env, Variables } from '../types'
import { companySettings, COMPANY_SETTINGS_ID } from '../../../drizzle/tenant/schema'

// Hex color, e.g. "#1e3a5f" — rejected (422) rather than stored, since a bad
// value would only surface later as a broken PDF render.
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

// All fields optional: an omitted key leaves the stored value unchanged
// (see the handler below, which only updates keys actually present in the
// parsed body), while `null`/`""` explicitly clears it.
const companySettingsBodySchema = z.object({
  slogan: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  mobileNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  signerTitle: z.string().nullable().optional(),
})

const EMPTY_SETTINGS = {
  slogan: null,
  primaryColor: null,
  email: null,
  mobileNumber: null,
  address: null,
  website: null,
  signerTitle: null,
}

const companySettingsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const row = await c.get('tenantDb')
      .query.companySettings.findFirst({
        where: eq(companySettings.id, COMPANY_SETTINGS_ID),
      })
    // No row saved yet — return the all-null shape, not a 404, so callers
    // can render blanks rather than handle a missing-resource error.
    if (!row) return c.json(EMPTY_SETTINGS)
    return c.json({
      slogan: row.slogan,
      primaryColor: row.primaryColor,
      email: row.email,
      mobileNumber: row.mobileNumber,
      address: row.address,
      website: row.website,
      signerTitle: row.signerTitle,
    })
  })
  .put('/', zValidator('json', companySettingsBodySchema), async (c) => {
    if (c.get('orgRole') !== 'org:admin') {
      return c.json({ error: 'Only an org admin can update company settings' }, 403)
    }

    const body = c.req.valid('json')

    if (body.primaryColor != null && body.primaryColor !== '' && !HEX_COLOR_REGEX.test(body.primaryColor)) {
      return c.json({ error: 'primaryColor must be a 6 digit hex color, e.g. #1e3a5f' }, 422)
    }

    // Only the keys actually present in the parsed body are written — an
    // omitted field is left untouched on both insert (falls back to the
    // column's null default) and update (never included in `set`).
    const providedKeys = Object.keys(body) as (keyof typeof body)[]
    const normalize = (value: string | null | undefined) => (value === '' ? null : (value ?? null))

    const values: Record<string, string | null> = {}
    for (const key of providedKeys) {
      values[key] = normalize(body[key])
    }

    const [saved] = await c.get('tenantDb')
      .insert(companySettings)
      .values({ id: COMPANY_SETTINGS_ID, ...values })
      .onConflictDoUpdate({
        target: companySettings.id,
        set: { ...values, updatedAt: new Date() },
      })
      .returning()

    return c.json({
      slogan: saved.slogan,
      primaryColor: saved.primaryColor,
      email: saved.email,
      mobileNumber: saved.mobileNumber,
      address: saved.address,
      website: saved.website,
      signerTitle: saved.signerTitle,
    })
  })

export default companySettingsRoute
