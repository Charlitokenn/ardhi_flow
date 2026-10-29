import type {ReactNode} from "react"
import {useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {usePostHog} from "posthog-js/react"
import {toast} from "sonner"
import {
    buildContractPlan,
    CONTRACT_MAX_PLOTS,
    CONTRACT_MAX_TERM_MONTHS,
    type ContractPlan,
    createContractBodySchema,
    issuesToFields,
    listPrice,
    percentOf,
    plotSizeUsed,
    type PurchasePlan,
    startDateWindow,
    todayInContractTimeZone,
} from "@ardhiflow/shared-schema"
import {apiClient} from "@/lib/api.ts"
import {cn, thousandSeparator} from "@/lib/utils"
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import ReusableStats from "@/components-reusable/reusable-stats.tsx"
import {Badge} from "@/components/reui/badge.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Checkbox} from "@/components/ui/checkbox.tsx"
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command.tsx"
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field.tsx"
import {Input} from "@/components/ui/input.tsx"
import {InputGroup, InputGroupAddon, InputGroupInput, InputGroupText} from "@/components/ui/input-group.tsx"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx"
import {RadioGroup, RadioGroupItem} from "@/components/ui/radio-group.tsx"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table.tsx"
import {
    Stepper,
    StepperContent,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperPanel,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "@/components/reui/stepper.tsx"
import {
    AlertTriangleIcon,
    BanknoteIcon,
    CheckIcon,
    ChevronsUpDownIcon,
    ExternalLinkIcon,
    HandCoinsIcon,
    LandPlotIcon,
    PercentIcon,
    SearchIcon,
    Trash2Icon,
    WalletIcon,
} from "lucide-react"

// The New Contract flow: four steps, one atomic POST /api/contracts. The
// preview on step 4 comes from the same buildContractPlan the Worker stores
// with, so what you see is what is saved. See
// docs/specs/0005-sales-contract-creation.

// Same sentinel as AddEditContactForm: Radix `Select.Item` rejects "".
const UNSET = "UNSET"

const STEPS = [
    {step: 1, title: "Client and project"},
    {step: 2, title: "Plots and prices"},
    {step: 3, title: "Terms"},
    {step: 4, title: "Commission and review"},
] as const
const TOTAL_STEPS = STEPS.length

interface SalePlot {
    id: string
    plotNumber: string
    surveyedPlotNumber: string | null
    availability: "AVAILABLE" | "SOLD"
    activeContractId: string | null
    unsurveyedSize: string
    surveyedSize: string | null
    pricePerSqm: string | null
    projectId: string
    isDeleted: boolean
}

interface SaleContact {
    id: string
    fullName: string
    mobileNumber: string | null
    contactType: string | null
    isDeleted: boolean
}

interface CommissionDefaults {
    defaultCommissionPercent: number
    defaultPayoutMonths: number
    defaultCancellationFeePercent: number
}

interface PlotChoice {
    plotId: string
    agreedPrice: string
}

interface FormValues {
    clientContactId: string
    projectId: string
    plots: PlotChoice[]
    purchasePlan: PurchasePlan | ""
    termMonths: string
    startDate: string
    downpaymentPercent: string
    cancellationFeePercent: string
    salesAgentContactId: string
    commissionPercent: string
    commissionPayoutMonths: string
}

function emptyValues(today: string, defaults?: CommissionDefaults): FormValues {
    return {
        clientContactId: "",
        projectId: "",
        plots: [],
        purchasePlan: "",
        termMonths: "",
        startDate: today,
        downpaymentPercent: "",
        cancellationFeePercent: defaults ? String(defaults.defaultCancellationFeePercent) : "",
        salesAgentContactId: UNSET,
        commissionPercent: defaults ? String(defaults.defaultCommissionPercent) : "",
        commissionPayoutMonths: defaults ? String(defaults.defaultPayoutMonths) : "",
    }
}

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))

// The POST body. Validated with the server's own schema before sending.
function buildBody(values: FormValues, contractId: string) {
    const hasAgent = values.salesAgentContactId !== UNSET
    return {
        id: contractId,
        projectId: values.projectId,
        clientContactId: values.clientContactId,
        plots: values.plots.map((choice) => ({plotId: choice.plotId, allocatedValue: toNumber(choice.agreedPrice)})),
        purchasePlan: values.purchasePlan as PurchasePlan,
        termMonths: toNumber(values.termMonths),
        startDate: values.startDate,
        downpaymentPercent: values.purchasePlan === "DOWNPAYMENT" ? toNumber(values.downpaymentPercent) : null,
        cancellationFeePercent: toNumber(values.cancellationFeePercent),
        salesAgentContactId: hasAgent ? values.salesAgentContactId : null,
        ...(hasAgent
            ? {
                commissionPercent: toNumber(values.commissionPercent),
                commissionPayoutMonths: toNumber(values.commissionPayoutMonths),
            }
            : {}),
    }
}

// Which step shows an error keyed by a request body path.
function stepForField(path: string): number {
    if (path === "clientContactId" || path === "projectId") return 1
    if (path === "plots" || path.startsWith("plots.")) return 2
    if (path === "salesAgentContactId" || path === "commissionPercent" || path === "commissionPayoutMonths") return 4
    if (path === "id" || path === "body") return 4
    return 3
}

function isSellable(plot: SalePlot): boolean {
    return plot.availability === "AVAILABLE" && !plot.activeContractId && !plot.isDeleted
}

const NO_LONGER_AVAILABLE = "No longer available. Remove it and pick another plot"

function plotLabel(plot: Pick<SalePlot, "plotNumber" | "surveyedPlotNumber">): string {
    return plot.surveyedPlotNumber ? `Plot ${plot.plotNumber} (${plot.surveyedPlotNumber})` : `Plot ${plot.plotNumber}`
}

function plotListPrice(plot: SalePlot): number | null {
    if (plot.pricePerSqm == null) return null
    return listPrice(plotSizeUsed(plot).size, plot.pricePerSqm)
}

const tzs = (amount: number) => `TZS ${thousandSeparator(amount)}`
const sqm = (size: string) => `${thousandSeparator(Number(size))} m²`

function formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    })
}

// Every error the sheet can know before saving, keyed like the server's 422,
// plus the plan when the body is complete.
function collectErrors(
    values: FormValues,
    contractId: string,
    today: string,
    plotById: Map<string, SalePlot>,
): { errors: Record<string, string>; plan: ContractPlan | null } {
    const body = buildBody(values, contractId)
    const parsed = createContractBodySchema.safeParse(body)
    const errors = parsed.success ? {} : issuesToFields(parsed.error.issues)

    const {min, max} = startDateWindow(today)
    if (!errors.startDate && (values.startDate < min || values.startDate > max)) {
        errors.startDate = `Pick a start date between ${formatDate(min)} and ${formatDate(max)}`
    }

    values.plots.forEach((choice, index) => {
        const plot = plotById.get(choice.plotId)
        if (!plot || !isSellable(plot)) errors[`plots.${index}.plotId`] ??= NO_LONGER_AVAILABLE
    })

    if (!parsed.success) return {errors, plan: null}
    const plan = buildContractPlan({
        purchasePlan: parsed.data.purchasePlan,
        termMonths: parsed.data.termMonths,
        startDate: parsed.data.startDate,
        downpaymentPercent: parsed.data.downpaymentPercent ?? null,
        plots: parsed.data.plots,
        commission: parsed.data.salesAgentContactId
            ? {
                percent: parsed.data.commissionPercent ?? 0,
                payoutMonths: parsed.data.commissionPayoutMonths ?? 1,
            }
            : null,
    })
    for (const issue of plan.issues) errors[issue.path] ??= issue.message
    return {errors, plan}
}

type SaveOutcome =
    | { kind: "saved"; totalContractValue: number }
    | { kind: "unavailable"; plotNumbers: string[] }
    | { kind: "invalid"; fields: Record<string, string> }

function readJsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function errorFor(errors: Record<string, string>, key: string) {
    return errors[key] ? [{message: errors[key]}] : undefined
}

interface NewContractSheetProps {
    // The element that opens the sheet, e.g. the Sales grid's "New Contract" button.
    trigger: ReactNode
}

export function NewContractSheet({trigger}: NewContractSheetProps) {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)
    const posthog = usePostHog()
    const today = todayInContractTimeZone()

    const [open, setOpen] = useState(false)
    // The idempotency key (AC-13): made when the sheet opens, sent as `id`, so
    // a double click or a retry after a timeout can never save twice.
    const [contractId, setContractId] = useState(() => crypto.randomUUID())
    const [values, setValues] = useState<FormValues>(() => emptyValues(today))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [currentStep, setCurrentStep] = useState(1)

    const contactsQuery = useQuery({
        queryKey: ["contacts"],
        queryFn: async () => {
            const res = await api.api.contacts.$get()
            if (!res.ok) throw new Error(`Failed to load contacts (${res.status})`)
            return res.json()
        },
        enabled: open,
        // A client added in the Contacts tab shows up when you come back.
        refetchOnWindowFocus: true,
    })
    const projectsQuery = useQuery({
        queryKey: ["projects"],
        queryFn: async () => {
            const res = await api.api.projects.$get()
            if (!res.ok) throw new Error(`Failed to load projects (${res.status})`)
            return res.json()
        },
        enabled: open,
    })
    const plotsQuery = useQuery({
        queryKey: ["plots"],
        queryFn: async () => {
            const res = await api.api.plots.$get()
            if (!res.ok) throw new Error(`Failed to load plots (${res.status})`)
            return res.json()
        },
        enabled: open,
    })
    const settingsQuery = useQuery({
        queryKey: ["commission-settings"],
        queryFn: async () => {
            const res = await api.api["commission-settings"].$get()
            if (!res.ok) throw new Error(`Failed to load commission settings (${res.status})`)
            return res.json()
        },
        enabled: open,
    })

    // Prefill the company defaults once they arrive, without overwriting
    // anything already typed (adjusting state during render, as in
    // AddEditContactForm, instead of an effect).
    const [seededDefaults, setSeededDefaults] = useState(false)
    if (!seededDefaults && settingsQuery.data) {
        const defaults = settingsQuery.data
        setSeededDefaults(true)
        setValues((prev) => ({
            ...prev,
            cancellationFeePercent: prev.cancellationFeePercent || String(defaults.defaultCancellationFeePercent),
            commissionPercent: prev.commissionPercent || String(defaults.defaultCommissionPercent),
            commissionPayoutMonths: prev.commissionPayoutMonths || String(defaults.defaultPayoutMonths),
        }))
    }

    const contacts: SaleContact[] = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])
    const clients = useMemo(() => contacts.filter((c) => !c.isDeleted && c.contactType === "CLIENT"), [contacts])
    const agents = useMemo(() => contacts.filter((c) => !c.isDeleted && c.contactType === "SALES_AGENT"), [contacts])
    const projects = useMemo(
        () => (projectsQuery.data ?? []).filter((p) => !p.isDeleted).map((p) => ({id: p.id, projectName: p.projectName})),
        [projectsQuery.data],
    )
    const allPlots: SalePlot[] = useMemo(() => plotsQuery.data ?? [], [plotsQuery.data])
    const plotById = useMemo(() => new Map(allPlots.map((plot) => [plot.id, plot])), [allPlots])
    const projectPlots = useMemo(
        () =>
            allPlots
                .filter((plot) => plot.projectId === values.projectId && isSellable(plot))
                .sort((a, b) => Number(a.plotNumber) - Number(b.plotNumber)),
        [allPlots, values.projectId],
    )

    const {errors: liveErrors, plan} = collectErrors(values, contractId, today, plotById)
    const contractTotal = values.plots.reduce((sum, choice) => sum + (Number(choice.agreedPrice) || 0), 0)

    const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
        setValues((prev) => ({...prev, [key]: value}))
        setErrors((prev) => {
            if (!(key in prev)) return prev
            const next = {...prev}
            delete next[key]
            return next
        })
    }

    // Plot indexes shift when one is removed, so every plot error is dropped
    // on any change to the list and recomputed on the next Next/Save.
    const setPlots = (next: (plots: PlotChoice[]) => PlotChoice[]) => {
        setValues((prev) => ({...prev, plots: next(prev.plots)}))
        setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => stepForField(key) !== 2)))
    }

    const setProject = (projectId: string) => {
        setValues((prev) => ({...prev, projectId, plots: projectId === prev.projectId ? prev.plots : []}))
        setErrors((prev) =>
            Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "projectId" && stepForField(key) !== 2)),
        )
    }

    const togglePlot = (plot: SalePlot, checked: boolean) => {
        setPlots((plots) =>
            checked
                ? [...plots, {plotId: plot.id, agreedPrice: String(plotListPrice(plot) ?? "")}]
                : plots.filter((choice) => choice.plotId !== plot.id),
        )
    }

    const setAgreedPrice = (plotId: string, agreedPrice: string) => {
        setPlots((plots) => plots.map((choice) => (choice.plotId === plotId ? {...choice, agreedPrice} : choice)))
    }

    // Payout months can't exceed the term, so lowering the term clamps it (AC-6).
    const setTerm = (termMonths: string) => {
        const term = Number(termMonths)
        setValues((prev) => {
            const payout = Number(prev.commissionPayoutMonths)
            const clamp = Number.isInteger(term) && term >= 1 && payout > term
            return {...prev, termMonths, commissionPayoutMonths: clamp ? String(term) : prev.commissionPayoutMonths}
        })
        setErrors((prev) => {
            const next = {...prev}
            delete next.termMonths
            delete next.commissionPayoutMonths
            return next
        })
    }

    // Replaces the errors of the given steps with what's wrong now. Returns
    // the first of those steps that has an error, or null.
    const validateSteps = (steps: number[]): number | null => {
        setErrors((prev) => {
            const next = Object.fromEntries(Object.entries(prev).filter(([key]) => !steps.includes(stepForField(key))))
            for (const [key, message] of Object.entries(liveErrors)) {
                if (steps.includes(stepForField(key))) next[key] = message
            }
            return next
        })
        const failing = Object.keys(liveErrors).map(stepForField).filter((step) => steps.includes(step))
        return failing.length > 0 ? Math.min(...failing) : null
    }

    const goToStep = (target: number) => {
        if (target > currentStep) {
            const passed = Array.from({length: target - currentStep}, (_, i) => currentStep + i)
            const invalidStep = validateSteps(passed)
            if (invalidStep !== null) {
                setCurrentStep(invalidStep)
                return
            }
        }
        setCurrentStep(target)
    }

    const resetForm = () => {
        setValues(emptyValues(todayInContractTimeZone(), settingsQuery.data))
        setErrors({})
        setCurrentStep(1)
    }

    const createContract = useMutation({
        mutationFn: async (body: ReturnType<typeof buildBody>): Promise<SaveOutcome> => {
            const res = await api.api.contracts.$post({json: body})
            const payload = readJsonRecord(await res.json().catch(() => null))
            if (res.status === 201 || res.status === 200) {
                return {kind: "saved", totalContractValue: Number(payload.totalContractValue)}
            }
            if (res.status === 409 && Array.isArray(payload.plotNumbers)) {
                return {kind: "unavailable", plotNumbers: payload.plotNumbers.map(String)}
            }
            if (res.status === 422 && payload.fields && typeof payload.fields === "object") {
                return {kind: "invalid", fields: payload.fields as Record<string, string>}
            }
            throw new Error(`Failed to create contract (${res.status})`)
        },
        onSuccess: (outcome) => {
            if (outcome.kind === "saved") {
                queryClient.invalidateQueries({queryKey: ["contracts"]})
                queryClient.invalidateQueries({queryKey: ["plots"]})
                queryClient.invalidateQueries({queryKey: ["projects"]})
                posthog.capture("contract_created", {
                    plotCount: values.plots.length,
                    purchasePlan: values.purchasePlan,
                    termMonths: Number(values.termMonths),
                    hasSalesAgent: values.salesAgentContactId !== UNSET,
                })
                const client = clients.find((c) => c.id === values.clientContactId)
                toast.success("Contract created", {
                    description: `${client?.fullName ?? "The client"}, ${tzs(outcome.totalContractValue)}`,
                })
                resetForm()
                setOpen(false)
                return
            }

            posthog.capture("contract_creation_failed", {reason: outcome.kind})
            if (outcome.kind === "unavailable") {
                // Keep the form, refresh the picker, and flag the plots to replace (AC-10).
                queryClient.invalidateQueries({queryKey: ["plots"]})
                const taken = new Set(outcome.plotNumbers)
                const flagged: Record<string, string> = {}
                values.plots.forEach((choice, index) => {
                    const plot = plotById.get(choice.plotId)
                    if (plot && taken.has(plot.plotNumber)) flagged[`plots.${index}.plotId`] = NO_LONGER_AVAILABLE
                })
                setErrors((prev) => ({...prev, ...flagged}))
                setCurrentStep(2)
                const list = outcome.plotNumbers.join(", ")
                toast.error(
                    outcome.plotNumbers.length === 1
                        ? `Plot ${list} is no longer available. Replace it and save again.`
                        : `Plots ${list} are no longer available. Replace them and save again.`,
                )
                return
            }

            setErrors(outcome.fields)
            setCurrentStep(Math.min(...Object.keys(outcome.fields).map(stepForField)))
            toast.error("Some details need fixing before the contract can be saved")
        },
        onError: () => {
            posthog.capture("contract_creation_failed", {reason: "error"})
            toast.error("Could not save the contract", {
                description: "Check your connection and press Save again. A retry never creates a second contract.",
            })
        },
    })
    const isSaving = createContract.isPending

    const handleSave = () => {
        if (isSaving) return
        const invalidStep = validateSteps([1, 2, 3, 4])
        if (invalidStep !== null) {
            setCurrentStep(invalidStep)
            toast.error("Please fix the highlighted fields")
            return
        }
        createContract.mutate(buildBody(values, contractId))
    }

    const isLastStep = currentStep === TOTAL_STEPS
    const currentStepDef = STEPS[currentStep - 1]

    return (
        <ReusableSheet
            trigger={trigger}
            title="New contract"
            description={`Step ${currentStep} of ${TOTAL_STEPS}: ${currentStepDef.title}`}
            widthClassName="sm:max-w-4xl"
            open={open}
            onOpenChange={(next) => {
                if (isSaving) return // ignore Escape/overlay click mid request
                // A fresh idempotency key each time the sheet opens. The draft
                // itself is kept, so closing by accident loses nothing.
                if (next && !open) setContractId(crypto.randomUUID())
                setOpen(next)
            }}
            onSubmit={(event) => {
                event.preventDefault()
                if (isLastStep) handleSave()
                else goToStep(currentStep + 1)
            }}
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
                        disabled={currentStep === 1 || isSaving}
                    >
                        Back
                    </Button>
                    <div className="text-muted-foreground order-last w-full text-center text-sm sm:order-none sm:w-auto">
                        {values.plots.length > 0 ? (
                            <>
                                {values.plots.length} plot{values.plots.length > 1 ? "s" : ""} ·{" "}
                                <span className="text-foreground font-medium">{tzs(contractTotal)}</span>
                            </>
                        ) : (
                            "No plots picked yet"
                        )}
                    </div>
                    <Button type="submit" disabled={isSaving}>
                        {isLastStep ? (isSaving ? "Saving..." : "Save contract") : "Next"}
                    </Button>
                </div>
            }
        >
            <Stepper value={currentStep} onValueChange={goToStep} className="gap-6">
                <StepperNav className="gap-2">
                    {STEPS.map(({step, title}) => (
                        <StepperItem key={step} step={step} className="relative items-start not-last:flex-1">
                            <StepperTrigger type="button" className="flex grow flex-col items-start gap-2 text-left">
                                <StepperIndicator>
                                    {step < currentStep ? <CheckIcon className="size-3.5"/> : step}
                                </StepperIndicator>
                                <StepperTitle className="hidden text-xs sm:block">{title}</StepperTitle>
                            </StepperTrigger>
                            {step < TOTAL_STEPS && <StepperSeparator className="mt-3 mx-2"/>}
                        </StepperItem>
                    ))}
                </StepperNav>

                <StepperPanel>
                    <StepperContent value={1}>
                        <ClientProjectStep
                            values={values}
                            errors={errors}
                            clients={clients}
                            projects={projects}
                            projectPlots={projectPlots}
                            isLoading={contactsQuery.isLoading || projectsQuery.isLoading}
                            onClientChange={(id) => update("clientContactId", id)}
                            onProjectChange={setProject}
                        />
                    </StepperContent>
                    <StepperContent value={2}>
                        <PlotsStep
                            values={values}
                            errors={errors}
                            projectName={projects.find((p) => p.id === values.projectId)?.projectName ?? null}
                            projectPlots={projectPlots}
                            plotById={plotById}
                            isLoading={plotsQuery.isLoading}
                            contractTotal={contractTotal}
                            onToggle={togglePlot}
                            onAgreedPriceChange={setAgreedPrice}
                        />
                    </StepperContent>
                    <StepperContent value={3}>
                        <TermsStep
                            values={values}
                            errors={errors}
                            today={today}
                            onChange={update}
                            onTermChange={setTerm}
                        />
                    </StepperContent>
                    <StepperContent value={4}>
                        <CommissionReviewStep
                            values={values}
                            errors={errors}
                            agents={agents}
                            plan={Object.keys(liveErrors).length === 0 ? plan : null}
                            plotById={plotById}
                            clientName={clients.find((c) => c.id === values.clientContactId)?.fullName ?? null}
                            onChange={update}
                        />
                    </StepperContent>
                </StepperPanel>
            </Stepper>
        </ReusableSheet>
    )
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

function ClientProjectStep({
                               values,
                               errors,
                               clients,
                               projects,
                               projectPlots,
                               isLoading,
                               onClientChange,
                               onProjectChange,
                           }: {
    values: FormValues
    errors: Record<string, string>
    clients: SaleContact[]
    projects: { id: string; projectName: string }[]
    projectPlots: SalePlot[]
    isLoading: boolean
    onClientChange: (id: string) => void
    onProjectChange: (id: string) => void
}) {
    const [clientOpen, setClientOpen] = useState(false)
    const client = clients.find((c) => c.id === values.clientContactId)
    const pricedCount = projectPlots.filter((plot) => plot.pricePerSqm != null).length

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-16 w-full"/>
                <Skeleton className="h-16 w-full"/>
            </div>
        )
    }

    return (
        <FieldGroup>
            <Field data-invalid={!!errors.clientContactId}>
                <FieldLabel htmlFor="contract-client">
                    Client <span className="text-destructive">*</span>
                </FieldLabel>
                <Popover open={clientOpen} onOpenChange={setClientOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            id="contract-client"
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={clientOpen}
                            aria-invalid={!!errors.clientContactId}
                            className="w-full justify-between font-normal"
                        >
                            {client ? (
                                <span className="truncate">
                                    {client.fullName}
                                    {client.mobileNumber && (
                                        <span className="text-muted-foreground"> · {client.mobileNumber}</span>
                                    )}
                                </span>
                            ) : (
                                <span className="text-muted-foreground">Search clients</span>
                            )}
                            <ChevronsUpDownIcon className="size-4 opacity-50" aria-hidden/>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 sm:w-96" align="start">
                        <Command>
                            <CommandInput placeholder="Search by name or phone..."/>
                            <CommandList>
                                <CommandEmpty>No client found.</CommandEmpty>
                                <CommandGroup>
                                    {clients.map((c) => (
                                        <CommandItem
                                            key={c.id}
                                            value={`${c.fullName} ${c.mobileNumber ?? ""} ${c.id}`}
                                            onSelect={() => {
                                                onClientChange(c.id)
                                                setClientOpen(false)
                                            }}
                                        >
                                            <CheckIcon
                                                className={cn("size-4", c.id === values.clientContactId ? "opacity-100" : "opacity-0")}
                                                aria-hidden
                                            />
                                            <span className="truncate">{c.fullName}</span>
                                            {c.mobileNumber && (
                                                <span className="text-muted-foreground ml-auto text-xs">{c.mobileNumber}</span>
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <FieldDescription>
                    Not in the list?{" "}
                    <a
                        href="/contacts"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                        Add a client first <ExternalLinkIcon className="size-3" aria-hidden/>
                    </a>{" "}
                    (opens Contacts in a new tab, so this draft is kept; the list updates when you come back).
                </FieldDescription>
                <FieldError errors={errorFor(errors, "clientContactId")}/>
            </Field>

            <Field data-invalid={!!errors.projectId}>
                <FieldLabel htmlFor="contract-project">
                    Project <span className="text-destructive">*</span>
                </FieldLabel>
                <Select value={values.projectId || undefined} onValueChange={onProjectChange}>
                    <SelectTrigger id="contract-project" className="w-full" aria-invalid={!!errors.projectId}>
                        <SelectValue placeholder="Pick a project"/>
                    </SelectTrigger>
                    <SelectContent>
                        {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.projectName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FieldDescription>
                    {values.projectId
                        ? `${projectPlots.length} available plot${projectPlots.length === 1 ? "" : "s"}, ${pricedCount} with a price per sqm. Changing the project clears the plots you picked.`
                        : "A contract holds plots from one project only."}
                </FieldDescription>
                <FieldError errors={errorFor(errors, "projectId")}/>
            </Field>
        </FieldGroup>
    )
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

function PlotsStep({
                       values,
                       errors,
                       projectName,
                       projectPlots,
                       plotById,
                       isLoading,
                       contractTotal,
                       onToggle,
                       onAgreedPriceChange,
                   }: {
    values: FormValues
    errors: Record<string, string>
    projectName: string | null
    projectPlots: SalePlot[]
    plotById: Map<string, SalePlot>
    isLoading: boolean
    contractTotal: number
    onToggle: (plot: SalePlot, checked: boolean) => void
    onAgreedPriceChange: (plotId: string, value: string) => void
}) {
    const [search, setSearch] = useState("")
    const chosenIds = new Set(values.plots.map((choice) => choice.plotId))
    const atLimit = values.plots.length >= CONTRACT_MAX_PLOTS
    const searchLower = search.trim().toLowerCase()
    const visiblePlots = projectPlots.filter(
        (plot) => !searchLower || plotLabel(plot).toLowerCase().includes(searchLower),
    )

    if (!values.projectId) {
        return (
            <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
                Pick a project on the first step to see its plots.
            </div>
        )
    }

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <section className="space-y-3 lg:col-span-2" aria-labelledby="available-plots-heading">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 id="available-plots-heading" className="text-sm font-medium">
                        Available in {projectName}
                    </h3>
                    <span className="text-muted-foreground text-xs">{projectPlots.length} plots</span>
                </div>
                <InputGroup>
                    <InputGroupAddon align="inline-start">
                        <SearchIcon/>
                    </InputGroupAddon>
                    <InputGroupInput
                        placeholder="Search plot number..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search plots"
                    />
                </InputGroup>

                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-14 w-full"/>
                        <Skeleton className="h-14 w-full"/>
                        <Skeleton className="h-14 w-full"/>
                    </div>
                ) : visiblePlots.length === 0 ? (
                    <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                        {projectPlots.length === 0 ? "This project has no available plots." : "No plot matches your search."}
                    </div>
                ) : (
                    <ul className="divide-border max-h-96 divide-y overflow-y-auto rounded-md border">
                        {visiblePlots.map((plot) => {
                            const checked = chosenIds.has(plot.id)
                            const price = plotListPrice(plot)
                            const unpriced = plot.pricePerSqm == null
                            const disabled = unpriced || (!checked && atLimit)
                            const {size, basis} = plotSizeUsed(plot)
                            const inputId = `contract-plot-${plot.id}`
                            return (
                                <li key={plot.id}>
                                    <label
                                        htmlFor={inputId}
                                        className={cn(
                                            "flex items-start gap-3 px-3 py-2.5 transition-colors",
                                            disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted/50 cursor-pointer",
                                            checked && "bg-primary/5",
                                        )}
                                    >
                                        <Checkbox
                                            id={inputId}
                                            checked={checked}
                                            disabled={disabled}
                                            onCheckedChange={(next) => onToggle(plot, next === true)}
                                            className="mt-0.5"
                                        />
                                        <div className="min-w-0 flex-1 space-y-0.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium">{plotLabel(plot)}</span>
                                                {price != null && <span className="text-sm">{tzs(price)}</span>}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                {sqm(size)} {basis === "SURVEYED" ? "surveyed" : "unsurveyed"}
                                                {unpriced
                                                    ? " · Set a price per sqm on the plot first"
                                                    : ` · ${tzs(Number(plot.pricePerSqm))}/m²`}
                                            </div>
                                        </div>
                                    </label>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {atLimit && (
                    <p className="text-muted-foreground text-xs">
                        A contract holds at most {CONTRACT_MAX_PLOTS} plots.
                    </p>
                )}
            </section>

            <section className="space-y-3 lg:col-span-3" aria-labelledby="chosen-plots-heading">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 id="chosen-plots-heading" className="text-sm font-medium">
                        In this contract
                    </h3>
                    <span className="text-muted-foreground text-xs">
                        {values.plots.length} of {CONTRACT_MAX_PLOTS}
                    </span>
                </div>

                {values.plots.length === 0 ? (
                    <div
                        className={cn(
                            "flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center",
                            errors.plots && "border-destructive",
                        )}
                    >
                        <LandPlotIcon className="text-muted-foreground size-8" aria-hidden/>
                        <p className="text-sm font-medium">No plots picked yet</p>
                        <p className="text-muted-foreground text-sm">
                            Tick plots on the left. Each one starts at its list price, and you can agree a lower price.
                        </p>
                        <FieldError errors={errorFor(errors, "plots")}/>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {values.plots.map((choice, index) => {
                            const plot = plotById.get(choice.plotId)
                            if (!plot) return null
                            const {size, basis} = plotSizeUsed(plot)
                            const price = plotListPrice(plot)
                            const agreed = Number(choice.agreedPrice)
                            const discount = price && agreed > 0 && agreed < price ? price - agreed : 0
                            const plotError = errors[`plots.${index}.plotId`]
                            const priceKey = `plots.${index}.allocatedValue`
                            const inputId = `contract-agreed-${plot.id}`
                            return (
                                <li
                                    key={choice.plotId}
                                    className={cn("space-y-3 rounded-md border p-3", plotError && "border-destructive")}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-medium">{plotLabel(plot)}</div>
                                            {plotError && (
                                                <div className="text-destructive flex items-center gap-1 text-xs">
                                                    <AlertTriangleIcon className="size-3" aria-hidden/> {plotError}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => onToggle(plot, false)}
                                            aria-label={`Remove ${plotLabel(plot)}`}
                                        >
                                            <Trash2Icon className="size-3.5"/>
                                        </Button>
                                    </div>
                                    <dl className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <dt className="text-muted-foreground">
                                                Size ({basis === "SURVEYED" ? "surveyed" : "unsurveyed"})
                                            </dt>
                                            <dd className="font-medium">{sqm(size)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Price per sqm</dt>
                                            <dd className="font-medium">
                                                {plot.pricePerSqm ? tzs(Number(plot.pricePerSqm)) : "Not set"}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">List price</dt>
                                            <dd className="font-medium">{price != null ? tzs(price) : "—"}</dd>
                                        </div>
                                    </dl>
                                    <Field data-invalid={!!errors[priceKey]}>
                                        <FieldLabel htmlFor={inputId} className="text-xs">
                                            Agreed price
                                        </FieldLabel>
                                        <InputGroup>
                                            <InputGroupAddon align="inline-start">
                                                <InputGroupText>TZS</InputGroupText>
                                            </InputGroupAddon>
                                            <InputGroupInput
                                                id={inputId}
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                step={1}
                                                value={choice.agreedPrice}
                                                onChange={(e) => onAgreedPriceChange(choice.plotId, e.target.value)}
                                                aria-invalid={!!errors[priceKey]}
                                            />
                                        </InputGroup>
                                        {discount > 0 && price && (
                                            <FieldDescription>
                                                {tzs(discount)} below list ({((discount / price) * 100).toFixed(1)}% off)
                                            </FieldDescription>
                                        )}
                                        <FieldError errors={errorFor(errors, priceKey)}/>
                                    </Field>
                                </li>
                            )
                        })}
                    </ul>
                )}

                {values.plots.length > 0 && (
                    <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2.5">
                        <span className="text-sm">Contract total</span>
                        <span className="text-base font-semibold">{tzs(contractTotal)}</span>
                    </div>
                )}
            </section>
        </div>
    )
}

// ── Step 3 ───────────────────────────────────────────────────────────────────

function TermsStep({
                       values,
                       errors,
                       today,
                       onChange,
                       onTermChange,
                   }: {
    values: FormValues
    errors: Record<string, string>
    today: string
    onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void
    onTermChange: (value: string) => void
}) {
    const {min, max} = startDateWindow(today)
    const isPast = values.startDate !== "" && values.startDate < today
    const percent = Number(values.downpaymentPercent)
    const percentValid = Number.isInteger(percent) && percent >= 1 && percent <= 99
    const downpayment = percentValid
        ? values.plots.reduce((sum, choice) => sum + percentOf(Number(choice.agreedPrice) || 0, percent), 0)
        : null

    const plans: { value: PurchasePlan; title: string; description: string }[] = [
        {
            value: "FLAT_RATE",
            title: "Flat rate",
            description: "The full price split into equal monthly installments. A cash sale is flat rate with a term of 1.",
        },
        {
            value: "DOWNPAYMENT",
            title: "Downpayment",
            description: "A share of the price due on the start date, the rest split monthly.",
        },
    ]

    return (
        <FieldGroup>
            <Field data-invalid={!!errors.purchasePlan}>
                <FieldLabel>
                    Purchase plan <span className="text-destructive">*</span>
                </FieldLabel>
                <RadioGroup
                    value={values.purchasePlan}
                    onValueChange={(v) => onChange("purchasePlan", v as PurchasePlan)}
                    className="grid gap-3 sm:grid-cols-2"
                    aria-invalid={!!errors.purchasePlan}
                >
                    {plans.map((plan) => (
                        <label
                            key={plan.value}
                            htmlFor={`contract-plan-${plan.value}`}
                            className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                                values.purchasePlan === plan.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                            )}
                        >
                            <RadioGroupItem id={`contract-plan-${plan.value}`} value={plan.value} className="mt-0.5"/>
                            <div className="space-y-0.5">
                                <div className="text-sm font-medium">{plan.title}</div>
                                <div className="text-muted-foreground text-xs">{plan.description}</div>
                            </div>
                        </label>
                    ))}
                </RadioGroup>
                <FieldError errors={errorFor(errors, "purchasePlan")}/>
            </Field>

            <Field orientation="responsive">
                <FieldContent data-invalid={!!errors.termMonths}>
                    <FieldLabel htmlFor="contract-term">
                        Term (months) <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                        id="contract-term"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={CONTRACT_MAX_TERM_MONTHS}
                        step={1}
                        value={values.termMonths}
                        onChange={(e) => onTermChange(e.target.value)}
                        placeholder={`1 to ${CONTRACT_MAX_TERM_MONTHS}`}
                        aria-invalid={!!errors.termMonths}
                    />
                    <FieldError errors={errorFor(errors, "termMonths")}/>
                </FieldContent>
                <FieldContent data-invalid={!!errors.startDate}>
                    <FieldLabel htmlFor="contract-start">
                        Start date <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                        id="contract-start"
                        type="date"
                        min={min}
                        max={max}
                        value={values.startDate}
                        onChange={(e) => onChange("startDate", e.target.value)}
                        aria-invalid={!!errors.startDate}
                    />
                    {isPast && !errors.startDate && (
                        <p className="text-warning-foreground bg-warning/10 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs">
                            <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden/>
                            This date is in the past. Installments due before today start out overdue.
                        </p>
                    )}
                    <FieldError errors={errorFor(errors, "startDate")}/>
                </FieldContent>
            </Field>

            <Field orientation="responsive">
                {values.purchasePlan === "DOWNPAYMENT" && (
                    <FieldContent data-invalid={!!errors.downpaymentPercent}>
                        <FieldLabel htmlFor="contract-downpayment">
                            Downpayment <span className="text-destructive">*</span>
                        </FieldLabel>
                        <InputGroup>
                            <InputGroupInput
                                id="contract-downpayment"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={99}
                                step={1}
                                value={values.downpaymentPercent}
                                onChange={(e) => onChange("downpaymentPercent", e.target.value)}
                                placeholder="1 to 99"
                                aria-invalid={!!errors.downpaymentPercent}
                            />
                            <InputGroupAddon align="inline-end">
                                <InputGroupText>%</InputGroupText>
                            </InputGroupAddon>
                        </InputGroup>
                        <FieldDescription>
                            {downpayment != null
                                ? `${tzs(downpayment)} due on the start date`
                                : "The shilling amount shows once you enter a percent."}
                        </FieldDescription>
                        <FieldError errors={errorFor(errors, "downpaymentPercent")}/>
                    </FieldContent>
                )}
                <FieldContent data-invalid={!!errors.cancellationFeePercent}>
                    <FieldLabel htmlFor="contract-cancellation">
                        Cancellation fee <span className="text-destructive">*</span>
                    </FieldLabel>
                    <InputGroup>
                        <InputGroupInput
                            id="contract-cancellation"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            step={1}
                            value={values.cancellationFeePercent}
                            onChange={(e) => onChange("cancellationFeePercent", e.target.value)}
                            placeholder="0 to 100"
                            aria-invalid={!!errors.cancellationFeePercent}
                        />
                        <InputGroupAddon align="inline-end">
                            <InputGroupText>%</InputGroupText>
                        </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>Prefilled from the company default.</FieldDescription>
                    <FieldError errors={errorFor(errors, "cancellationFeePercent")}/>
                </FieldContent>
            </Field>
        </FieldGroup>
    )
}

// ── Step 4 ───────────────────────────────────────────────────────────────────

function CommissionReviewStep({
                                  values,
                                  errors,
                                  agents,
                                  plan,
                                  plotById,
                                  clientName,
                                  onChange,
                              }: {
    values: FormValues
    errors: Record<string, string>
    agents: SaleContact[]
    plan: ContractPlan | null
    plotById: Map<string, SalePlot>
    clientName: string | null
    onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void
}) {
    const hasAgent = values.salesAgentContactId !== UNSET
    const term = Number(values.termMonths)

    return (
        <div className="space-y-8">
            <section className="space-y-3" aria-labelledby="commission-heading">
                <h3 id="commission-heading" className="text-sm font-medium">
                    Sales commission
                </h3>
                <FieldGroup>
                    <Field data-invalid={!!errors.salesAgentContactId}>
                        <FieldLabel htmlFor="contract-agent">Sales agent</FieldLabel>
                        <Select
                            value={values.salesAgentContactId}
                            onValueChange={(v) => onChange("salesAgentContactId", v)}
                        >
                            <SelectTrigger id="contract-agent" className="w-full" aria-invalid={!!errors.salesAgentContactId}>
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={UNSET}>No sales agent</SelectItem>
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                        {agent.fullName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            {hasAgent
                                ? "Prefilled from the company commission settings. Change them for this sale if agreed."
                                : "Without an agent, no commission is recorded."}
                        </FieldDescription>
                        <FieldError errors={errorFor(errors, "salesAgentContactId")}/>
                    </Field>
                    {hasAgent && (
                        <Field orientation="responsive">
                            <FieldContent data-invalid={!!errors.commissionPercent}>
                                <FieldLabel htmlFor="contract-commission">Commission</FieldLabel>
                                <InputGroup>
                                    <InputGroupInput
                                        id="contract-commission"
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={values.commissionPercent}
                                        onChange={(e) => onChange("commissionPercent", e.target.value)}
                                        aria-invalid={!!errors.commissionPercent}
                                    />
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupText>%</InputGroupText>
                                    </InputGroupAddon>
                                </InputGroup>
                                <FieldError errors={errorFor(errors, "commissionPercent")}/>
                            </FieldContent>
                            <FieldContent data-invalid={!!errors.commissionPayoutMonths}>
                                <FieldLabel htmlFor="contract-payout">Paid out over (months)</FieldLabel>
                                <Input
                                    id="contract-payout"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={Number.isInteger(term) && term >= 1 ? term : CONTRACT_MAX_TERM_MONTHS}
                                    step={1}
                                    value={values.commissionPayoutMonths}
                                    onChange={(e) => onChange("commissionPayoutMonths", e.target.value)}
                                    aria-invalid={!!errors.commissionPayoutMonths}
                                />
                                <FieldError errors={errorFor(errors, "commissionPayoutMonths")}/>
                            </FieldContent>
                        </Field>
                    )}
                </FieldGroup>
            </section>

            <section className="space-y-4" aria-labelledby="review-heading">
                <div className="space-y-1">
                    <h3 id="review-heading" className="text-sm font-medium">
                        Review
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        {clientName ? `${clientName}, ` : ""}
                        {plan
                            ? `${plan.plots.length} plot${plan.plots.length > 1 ? "s" : ""}, starting ${formatDate(values.startDate)}. This is exactly what will be saved.`
                            : "The schedule shows here once every step is complete."}
                    </p>
                </div>

                {plan ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <ReusableStats
                                label="Contract value"
                                value={tzs(plan.totalContractValue)}
                                indicatorIcon={<BanknoteIcon/>}
                                variant="icon"
                            />
                            <ReusableStats
                                label="Downpayment"
                                value={tzs(plan.downpaymentAmount)}
                                indicatorIcon={<WalletIcon/>}
                                variant="icon"
                                trendDescription={plan.downpaymentPercent != null ? `${plan.downpaymentPercent}%` : "Flat rate"}
                            />
                            <ReusableStats
                                label="Financed"
                                value={tzs(plan.financedAmount)}
                                indicatorIcon={<PercentIcon/>}
                                variant="icon"
                                trendDescription={`Over ${values.termMonths} months`}
                            />
                            <ReusableStats
                                label="Commission"
                                value={tzs(plan.commissionAmount)}
                                indicatorIcon={<HandCoinsIcon/>}
                                variant="icon"
                                trendDescription={hasAgent ? `${plan.commissionPercent}%` : "No agent"}
                            />
                        </div>

                        <div className="space-y-4">
                            {plan.plots.map((planned) => {
                                const plot = plotById.get(planned.plotId)
                                return (
                                    <div key={planned.plotId} className="rounded-md border">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                                            <span className="text-sm font-medium">
                                                {plot ? plotLabel(plot) : "Plot"}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                                {tzs(planned.allocatedValue)} · {planned.installments.length} installments
                                            </span>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>No.</TableHead>
                                                        <TableHead>Due date</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {planned.installments.map((installment) => (
                                                        <TableRow key={installment.installmentNo}>
                                                            <TableCell>
                                                                {installment.installmentNo === 0 ? (
                                                                    <Badge size="sm" variant="info-outline">Downpayment</Badge>
                                                                ) : (
                                                                    installment.installmentNo
                                                                )}
                                                            </TableCell>
                                                            <TableCell>{formatDate(installment.dueDate)}</TableCell>
                                                            <TableCell className="text-right">{tzs(installment.amount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {plan.tranches.length > 0 && (
                            <div className="rounded-md border">
                                <div className="border-b px-3 py-2 text-sm font-medium">Commission payouts</div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tranche</TableHead>
                                            <TableHead>Target month</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {plan.tranches.map((tranche) => (
                                            <TableRow key={tranche.trancheNumber}>
                                                <TableCell>{tranche.trancheNumber}</TableCell>
                                                <TableCell>
                                                    {new Date(`${tranche.targetMonth}T00:00:00Z`).toLocaleDateString("en-GB", {
                                                        month: "long",
                                                        year: "numeric",
                                                        timeZone: "UTC",
                                                    })}
                                                </TableCell>
                                                <TableCell className="text-right">{tzs(tranche.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
                        Something on an earlier step still needs an answer. Press Save to jump to it.
                    </div>
                )}
            </section>
        </div>
    )
}
