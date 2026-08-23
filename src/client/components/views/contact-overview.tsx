export interface Contact {
    id: string
    fullName: string
    mobileNumber?: string | null
    altMobileNumber?: string | null
    email?: string | null
    gender?: string | null
    contactType: 'CLIENT' | 'SALES_AGENT' | 'LAND_SELLER' | 'VENDOR' | string
    idType?: string | null
    idNumber?: string | null
    region?: string | null
    district?: string | null
    ward?: string | null
    street?: string | null
    firstNOKName?: string | null
    firstNOKMobile?: string | null
    firstNOKRelationship?: string | null
    secondNOKName?: string | null
    secondNOKMobile?: string | null
    secondNOKRelationship?: string | null
    clientPhoto?: string | null
    addedBy?: string | null
    smsOptOut?: boolean
    clerkUserId?: string | null
    isDeleted?: boolean
    createdAt?: string
    updatedAt?: string
    plots?: unknown[]
}

type DetailItemProps = {
    label: string
    value?: string | null
    href?: string
    icon?: React.ReactNode
}

export function DetailItem({label, value, href, icon}: DetailItemProps) {
    const displayValue = value?.trim() || '—'
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {icon}
                {label}
            </dt>
            <dd className="min-w-0 text-sm font-medium text-foreground">
                {href && value ? (
                    <a className="wrap-break-word text-primary underline-offset-4 hover:underline" href={href}>
                        {displayValue}
                    </a>
                ) : (
                    displayValue
                )}
            </dd>
        </div>
    )
}

export function ContactSection({title, children, className = ''}: {
    title: string;
    children: React.ReactNode;
    className?: string
}) {
    return (
        <div className={`border p-4 rounded-md ${className}`}>
            <div className="gap-0 pb-4">
                <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            </div>
            <div>{children}</div>
        </div>
    )
}

