import { Hono } from 'hono'
import { Webhook } from 'svix'
import type { Env } from '../../types'
import type { ProvisionTenantMessage } from '../../queue/provision-tenant'

const webhooks = new Hono<{ Bindings: Env }>()

// Configure this URL as an endpoint in the Clerk dashboard (Webhooks),
// subscribed at minimum to organization.created. Grab the signing secret
// from there for CLERK_WEBHOOK_SECRET.
webhooks.post('/clerk', async (c) => {
  const payload = await c.req.text()
  const svixId = c.req.header('svix-id')
  const svixTimestamp = c.req.header('svix-timestamp')
  const svixSignature = c.req.header('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json({ error: 'Missing svix headers' }, 400)
  }

  const wh = new Webhook(c.env.CLERK_WEBHOOK_SECRET)
  let event: { type: string; data: Record<string, unknown> }

  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event
  } catch {
    return c.json({ error: 'Invalid webhook signature' }, 400)
  }

  if (event.type === 'organization.created') {
    const message: ProvisionTenantMessage = {
      clerkOrgId: event.data.id as string,
      orgName: event.data.name as string,
    }
    // Ack Clerk immediately — provisioning happens off the request path.
    await c.env.TENANT_PROVISION_QUEUE.send(message)
  }

  return c.json({ received: true })
})

export default webhooks
