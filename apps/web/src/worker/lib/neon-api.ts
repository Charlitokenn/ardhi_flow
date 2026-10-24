// Minimal wrapper around the Neon Management API — what provisioning and key
// rotation need. Full reference: https://api-docs.neon.tech/reference/createproject
//
// Deliberately framework-agnostic (plain fetch, no Workers-only APIs) so the
// same function runs both inside the Worker's queue consumer and in the
// standalone Node CLI script (scripts/provision-tenant.ts).

const NEON_API_BASE = 'https://console.neon.tech/api/v2'

export interface NeonProjectResult {
  projectId: string
  projectName: string
  connectionUri: string
}

// Neon's own docs flag POST as unsafe to retry — a network blip or a
// Cloudflare Queues redelivery re-running this handler must not blindly
// call createNeonProject() again, or you end up with orphaned duplicate
// projects. Check by name first (names are predictable: `tenant-{orgId}`).
export async function findProjectByName(apiKey: string, name: string): Promise<{ id: string } | null> {
  const res = await fetch(`${NEON_API_BASE}/projects?search=${encodeURIComponent(name)}&limit=10`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    throw new Error(`Neon project lookup failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { projects: Array<{ id: string; name: string }> }
  // `search` matches partial name/id — narrow to an exact name match.
  const match = data.projects.find((p) => p.name === name)
  return match ? { id: match.id } : null
}

export async function createNeonProject(
  apiKey: string,
  name: string,
  region: string,
): Promise<NeonProjectResult> {
  const res = await fetch(`${NEON_API_BASE}/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: {
        name,
        region_id: region,
        pg_version: 17,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Neon project creation failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as {
    project: { id: string; name: string }
    connection_uris: Array<{ connection_uri: string }>
  }

  const connectionUri = data.connection_uris[0]?.connection_uri
  if (!connectionUri) {
    throw new Error(`Neon project ${data.project.id} created but returned no connection URI`)
  }

  return {
    projectId: data.project.id,
    projectName: data.project.name,
    connectionUri,
  }
}

export async function deleteNeonProject(apiKey: string, projectId: string): Promise<void> {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    throw new Error(`Neon project deletion failed (${res.status}): ${await res.text()}`)
  }
}

// ── Emergency key rotation helpers ──────────────────────────────────────────
// Used by scripts/rotate-keys.ts in --emergency mode (spec 0003, AC-9, AC-11).
// They rebuild a tenant's connection string from Neon alone, so a lost or
// leaked encryption key never needs the old stored value.
//
// Unlike the helpers above, these errors never carry the response body: a
// reset-password response contains the new password. Only the step name and the
// HTTP status are kept, which is what lands in the run note.

export type NeonStep =
  | 'list_branches'
  | 'list_databases'
  | 'reset_password'
  | 'connection_uri'

export class NeonApiError extends Error {
  readonly step: NeonStep
  readonly status: number | null

  constructor(step: NeonStep, status: number | null, detail?: string) {
    super(`Neon ${step} failed${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}`)
    this.name = 'NeonApiError'
    this.step = step
    this.status = status
  }
}

function neonHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
}

// The branch Neon marks `default: true`. (`primary` is the older name for the
// same flag and is deprecated, so it is only read when `default` is absent.)
export async function getDefaultBranchId(apiKey: string, projectId: string): Promise<string> {
  const res = await fetch(`${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches?limit=100`, {
    headers: neonHeaders(apiKey),
  })
  if (!res.ok) throw new NeonApiError('list_branches', res.status)

  const data = (await res.json()) as { branches?: Array<{ id: string; default?: boolean; primary?: boolean }> }
  const branches = data.branches ?? []
  const match = branches.find((b) => b.default ?? b.primary)
  if (!match) throw new NeonApiError('list_branches', null, 'no default branch')
  return match.id
}

// Each tenant project has exactly one application database. More or fewer than
// one is a failure, not a guess: the caller records it and skips the tenant.
export async function getTenantDatabase(
  apiKey: string,
  projectId: string,
  branchId: string,
): Promise<{ name: string; ownerName: string }> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`,
    { headers: neonHeaders(apiKey) },
  )
  if (!res.ok) throw new NeonApiError('list_databases', res.status)

  const data = (await res.json()) as { databases?: Array<{ name: string; owner_name: string }> }
  const databases = data.databases ?? []
  if (databases.length !== 1) {
    throw new NeonApiError('list_databases', null, `expected 1 database, found ${databases.length}`)
  }
  return { name: databases[0].name, ownerName: databases[0].owner_name }
}

// POST .../roles/{role}/reset_password. The old password stops working once
// Neon applies the change to the compute, which is asynchronous, so callers
// should retry their first connection. Returns the new password. The caller
// must never log it.
export async function resetRolePassword(
  apiKey: string,
  projectId: string,
  branchId: string,
  roleName: string,
): Promise<string> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}` +
      `/roles/${encodeURIComponent(roleName)}/reset_password`,
    { method: 'POST', headers: neonHeaders(apiKey) },
  )
  if (!res.ok) throw new NeonApiError('reset_password', res.status)

  const data = (await res.json()) as { role?: { password?: string } }
  const password = data.role?.password
  if (!password) throw new NeonApiError('reset_password', null, 'response had no password')
  return password
}

// Direct (not pooled) connection URI, the same form createNeonProject stores
// from `connection_uris[0].connection_uri`.
export async function getConnectionUri(
  apiKey: string,
  projectId: string,
  target: { branchId: string; databaseName: string; roleName: string },
): Promise<string> {
  const query = new URLSearchParams({
    branch_id: target.branchId,
    database_name: target.databaseName,
    role_name: target.roleName,
  })
  const res = await fetch(`${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/connection_uri?${query}`, {
    headers: neonHeaders(apiKey),
  })
  if (!res.ok) throw new NeonApiError('connection_uri', res.status)

  const data = (await res.json()) as { uri?: string }
  if (!data.uri) throw new NeonApiError('connection_uri', null, 'response had no uri')
  return data.uri
}
