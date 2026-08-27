import {FileTextIcon, HouseIcon, LandPlot, MapPlusIcon, WalletIcon} from "lucide-react"
import {formatDate, thousandSeparator, toProperCase} from "@/lib/utils"
import CustomTabsVertical, {type VerticalTabItem} from "@/components/custom-tabs-vertical.tsx"
import {CustomTabsHorizontal, type HorizontalTabItem} from "@/components/custom-tabs-horizontal.tsx"
import {Badge} from "@/components/ui/badge.tsx"
import {ContactSection, DetailItem} from "@/components/views/contact-overview.tsx"
import {ProjectPaymentsDataGrid} from "@/components/data-grids/project-payments-datagrid.tsx"
import {ProjectPlotsDataGrid} from "@/components/data-grids/project-plots-datagrid.tsx"
import {computeProjectAcquisitionTarget} from "@/lib/project-balance.ts"
import type {ClientProject} from "@/types/projects.ts"

function formatTzs(value: string | number | null): string | null {
    if (value === null) return null
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return null
    return `Tshs. ${thousandSeparator(numeric)}`
}

// Mirrors ContactHeader in view-contact-form.tsx — the project's identity
// row above the Overview tab's horizontal tabs.
function ProjectHeader({project}: { project: ClientProject }) {
    const locationLabel = [project.region, project.district, project.ward, project.street]
        .filter(Boolean)
        .map(toProperCase)
        .join(", ")

    return (
        <div className="mb-8 min-w-0">
            <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                    {project.projectName}
                </h1>
                <Badge variant="secondary" className="text-xs">
                    {project.numberOfPlots} plots
                </Badge>
            </div>
            <div
                className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                {locationLabel && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPlusIcon className="size-3.5 shrink-0"/>
                        <span className="truncate">{locationLabel}</span>
                    </span>
                )}
                {project.projectOwner && (
                    <>
                        {locationLabel && <span className="hidden sm:inline text-border" aria-hidden="true">·</span>}
                        <span className="truncate">{toProperCase(project.projectOwner)}</span>
                    </>
                )}
            </div>
        </div>
    )
}

// Mirrors PersonalParticularsContent in view-contact-form.tsx, one level
// down (a project's own particulars rather than a person's).
function ProjectDetailsContent({project}: { project: ClientProject }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <ContactSection title="Acquisition">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem label="Acquisition Date" value={formatDate(project.acquisitionDate)}/>
                        <DetailItem label="Acquisition Value" value={formatTzs(project.acquisitionValue)}/>
                        <DetailItem
                            label="Sqm Bought"
                            value={project.sqmBought ? thousandSeparator(Number(project.sqmBought)) : null}
                        />
                        <DetailItem label="Project Owner" value={project.projectOwner}/>
                    </dl>
                </ContactSection>

                <ContactSection title="Location">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem label="Region" value={project.region}/>
                        <DetailItem label="District" value={project.district}/>
                        <DetailItem label="Ward" value={project.ward}/>
                        <DetailItem label="Street" value={project.street}/>
                    </dl>
                </ContactSection>

                <ContactSection title="Survey & Town Planning">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem label="TP Number" value={project.tpNumber}/>
                        <DetailItem label="TP Status" value={project.tpStatus}/>
                        <DetailItem label="Survey Number" value={project.surveyNumber}/>
                        <DetailItem label="Survey Status" value={project.surveyStatus}/>
                    </dl>
                </ContactSection>

                <ContactSection title="Fees">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem label="Committment Amount" value={formatTzs(project.committmentAmount)}/>
                        <DetailItem label="LGA Fee" value={formatTzs(project.lgaFee)}/>
                    </dl>
                </ContactSection>
            </div>

            <ContactSection title="Local Leadership">
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-4 rounded-md border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Mwenyekiti
                        </p>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <DetailItem label="Name" value={project.mwenyekitiName}/>
                            <DetailItem
                                label="Mobile"
                                value={project.mwenyekitiMobile}
                                href={project.mwenyekitiMobile ? `tel:${project.mwenyekitiMobile}` : undefined}
                            />
                        </dl>
                    </div>
                    <div className="flex min-w-0 flex-col gap-4 rounded-md border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Mtendaji
                        </p>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <DetailItem label="Name" value={project.mtendajiName}/>
                            <DetailItem
                                label="Mobile"
                                value={project.mtendajiMobile}
                                href={project.mtendajiMobile ? `tel:${project.mtendajiMobile}` : undefined}
                            />
                        </dl>
                    </div>
                </div>
            </ContactSection>

            {project.projectDetails && (
                <ContactSection title="Details">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.projectDetails}</p>
                </ContactSection>
            )}
        </div>
    )
}

function ProjectPaymentsContent({project}: { project: ClientProject }) {
    const target = computeProjectAcquisitionTarget(project)
    return <ProjectPaymentsDataGrid payments={project.payments} target={target}/>
}

function ProjectPlotsContent({project}: { project: ClientProject }) {
    return <ProjectPlotsDataGrid projectId={project.id} plots={project.plots}/>
}

export function ProjectsView({project}: { project: ClientProject }) {
    const horizontalTabs: HorizontalTabItem[] = [
        {
            id: "project-details",
            label: "Project Details",
            icon: FileTextIcon,
            content: <ProjectDetailsContent project={project}/>,
        },
        {
            id: "project-payments",
            label: "Project Payments",
            icon: WalletIcon,
            content: <ProjectPaymentsContent project={project}/>,
        },
    ]

    const verticalTabs: VerticalTabItem[] = [
        {
            id: "overview",
            label: "Overview",
            icon: HouseIcon,
            content: (
                <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                    <ProjectHeader project={project}/>
                    <CustomTabsHorizontal tabs={horizontalTabs} defaultTab="project-details"/>
                </div>
            ),
        },
        {
            id: "plots",
            label: "Plots",
            icon: LandPlot,
            content: (
                <div className="mr-3 pl-6 py-1 mx-3">
                    <ProjectPlotsContent project={project}/>
                </div>
            ),
        },
    ]

    return (
        <CustomTabsVertical
            defaultTab="overview"
            tabs={verticalTabs}
            skeletonTabCount={2}
            unstyled
        />
    )
}
