// The one combined branding shape every generated document (client statement,
// confirmation letter) and the view sheet consume — built once by
// contacts-datagrid.tsx (Clerk's useOrganization() + GET /api/company-settings)
// and passed down, never re-fetched or re-shaped per document. See
// docs/specs/0001-contacts-completion/index.md's "Cross child contract".
export interface DocumentBrandingExtra {
  logoUrl: string | null
  companyName: string
  branding: {
    slogan: string | null
    primaryColor: string | null
    email: string | null
    mobileNumber: string | null
    address: string | null
    website: string | null
    signerTitle: string | null
  }
}

export const EMPTY_BRANDING_EXTRA: DocumentBrandingExtra = {
  logoUrl: null,
  companyName: "",
  branding: {
    slogan: null,
    primaryColor: null,
    email: null,
    mobileNumber: null,
    address: null,
    website: null,
    signerTitle: null,
  },
}
