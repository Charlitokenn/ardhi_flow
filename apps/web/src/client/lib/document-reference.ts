// Shared by the client statement and the confirmation letter so the two
// documents' reference numbers can never collide even when generated the
// same day for the same client. See docs/specs/0001-contacts-completion's
// "Cross child contract" for the exact rule this implements.

function initialsUpToThree(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

function cleanedProjectName(projectName: string): string {
  const cleaned = projectName.replace(/\s+/g, "").replace(/[^A-Za-z0-9_-]/g, "")
  return cleaned || "NA"
}

// Local date, not UTC — new Date().toISOString() would show the wrong day
// in the evening in East Africa time.
function localDateStamp(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

export type DocumentReferenceType = "STMT" | "CONF"

export function buildDocumentReferenceNumber(
  companyName: string,
  projectName: string,
  clientName: string,
  docType: DocumentReferenceType,
  date: Date = new Date()
): string {
  return `${initialsUpToThree(companyName)}/${cleanedProjectName(projectName)}/${initialsUpToThree(clientName)}/${localDateStamp(date)}-${docType}`
}

// e.g. "John Doe" -> "john-doe" — used for both documents' download
// filenames (statement-{slug}-{ref}.pdf / confirmation-{slug}-{ref}.pdf).
export function slugifyClientName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}
