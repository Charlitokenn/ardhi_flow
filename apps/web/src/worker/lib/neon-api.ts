// Minimal wrapper around the Neon Management API — just what provisioning
// needs. Full reference: https://api-docs.neon.tech/reference/createproject
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
