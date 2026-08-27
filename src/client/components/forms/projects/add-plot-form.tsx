import type {FormEvent} from "react"
import {useId, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
import {z} from "zod"
import {apiClient} from "@/lib/api.ts"
import {Button} from "@/components/ui/button.tsx"
import {Input} from "@/components/ui/input.tsx"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx"
import {Field, FieldError, FieldLabel} from "@/components/ui/field.tsx"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select.tsx"
import {PlusIcon, Trash2Icon} from "lucide-react"

type Availability = "AVAILABLE" | "SOLD"

interface PlotLine {
    key: string
    plotNumber: string
    surveyedPlotNumber: string
    unsurveyedSize: string
    surveyedSize: string
    availability: Availability
}

let lineCounter = 0
function newLine(): PlotLine {
    lineCounter += 1
    return {
        key: `line-${lineCounter}`,
        plotNumber: "",
        surveyedPlotNumber: "",
        unsurveyedSize: "",
        surveyedSize: "",
        availability: "AVAILABLE",
    }
}

const lineSchema = z.object({
    plotNumber: z.string().trim().min(1, "Required").refine((v) => !Number.isNaN(Number(v)), "Must be a number"),
    surveyedPlotNumber: z.string(),
    unsurveyedSize: z
        .string()
        .trim()
        .min(1, "Required")
        .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Enter a valid size"),
    surveyedSize: z
        .string()
        .trim()
        .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter a valid size"),
})

interface AddPlotFormProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

export function AddPlotForm({projectId, open, onOpenChange, onSuccess}: AddPlotFormProps) {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)
    const idPrefix = useId()

    const [lines, setLines] = useState<PlotLine[]>(() => [newLine()])
    const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})

    const resetForm = () => {
        setLines([newLine()])
        setErrors({})
    }

    const updateLine = <K extends keyof PlotLine>(key: string, field: K, value: PlotLine[K]) => {
        setLines((prev) => prev.map((line) => (line.key === key ? {...line, [field]: value} : line)))
    }

    const addLine = () => setLines((prev) => [...prev, newLine()])
    const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))

    const createPlots = useMutation({
        mutationFn: async (validLines: PlotLine[]) => {
            const results = await Promise.allSettled(
                validLines.map((line) =>
                    api.api.plots.$post({
                        json: {
                            projectId,
                            plotNumber: line.plotNumber.trim(),
                            surveyedPlotNumber: line.surveyedPlotNumber.trim() || null,
                            unsurveyedSize: line.unsurveyedSize.trim(),
                            surveyedSize: line.surveyedSize.trim() || null,
                            availability: line.availability,
                        },
                    }).then((res) => {
                        if (!res.ok) throw new Error(`Failed to add plot ${line.plotNumber}`)
                        return res.json()
                    })
                )
            )
            const created = results.filter((r) => r.status === "fulfilled").length
            const failed = results.length - created
            return {created, failed}
        },
        onSuccess: ({created, failed}) => {
            if (created > 0) {
                queryClient.invalidateQueries({queryKey: ["project-statement-data", projectId]})
                queryClient.invalidateQueries({queryKey: ["projects"]})
            }
            if (failed === 0) {
                toast.success(created === 1 ? "Plot added" : `${created} plots added`)
                onSuccess?.()
                onOpenChange(false)
                resetForm()
            } else if (created > 0) {
                toast.warning(`Added ${created} plot(s), ${failed} failed`)
                onSuccess?.()
            } else {
                toast.error("Failed to add plot(s)")
            }
        },
        onError: () => {
            toast.error("Failed to add plot(s)")
        },
    })

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()

        const nextErrors: Record<string, Record<string, string>> = {}
        const validLines: PlotLine[] = []

        for (const line of lines) {
            const result = lineSchema.safeParse(line)
            if (!result.success) {
                nextErrors[line.key] = Object.fromEntries(
                    Object.entries(result.error.flatten().fieldErrors).map(([field, messages]) => [
                        field,
                        messages?.[0] ?? "Invalid",
                    ])
                )
            } else {
                validLines.push(line)
            }
        }

        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            toast.error("Please fix the highlighted fields")
            return
        }

        createPlots.mutate(validLines)
    }

    const isSaving = createPlots.isPending

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (isSaving) return
                onOpenChange(next)
                if (!next) resetForm()
            }}
        >
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add plot{lines.length > 1 ? "s" : ""}</DialogTitle>
                    <DialogDescription>
                        Add one or more plots to this project. Use &quot;Add another plot&quot; for more than one.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                        {lines.map((line, index) => {
                            const lineErrors = errors[line.key] ?? {}
                            return (
                                <div
                                    key={line.key}
                                    className="relative space-y-3 rounded-md border p-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-muted-foreground">
                                            Plot {index + 1}
                                        </span>
                                        {lines.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => removeLine(line.key)}
                                                aria-label="Remove plot"
                                            >
                                                <Trash2Icon className="size-3.5"/>
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field data-invalid={!!lineErrors.plotNumber}>
                                            <FieldLabel htmlFor={`${idPrefix}-${line.key}-plotNumber`}>
                                                Plot number <span className="text-destructive">*</span>
                                            </FieldLabel>
                                            <Input
                                                id={`${idPrefix}-${line.key}-plotNumber`}
                                                value={line.plotNumber}
                                                onChange={(e) => updateLine(line.key, "plotNumber", e.target.value)}
                                                placeholder="e.g. 142"
                                                aria-invalid={!!lineErrors.plotNumber}
                                            />
                                            <FieldError
                                                errors={lineErrors.plotNumber ? [{message: lineErrors.plotNumber}] : undefined}/>
                                        </Field>

                                        <Field>
                                            <FieldLabel htmlFor={`${idPrefix}-${line.key}-surveyedPlotNumber`}>
                                                Surveyed plot number
                                            </FieldLabel>
                                            <Input
                                                id={`${idPrefix}-${line.key}-surveyedPlotNumber`}
                                                value={line.surveyedPlotNumber}
                                                onChange={(e) =>
                                                    updateLine(line.key, "surveyedPlotNumber", e.target.value)
                                                }
                                                placeholder="Optional"
                                            />
                                        </Field>

                                        <Field data-invalid={!!lineErrors.unsurveyedSize}>
                                            <FieldLabel htmlFor={`${idPrefix}-${line.key}-unsurveyedSize`}>
                                                Unsurveyed size (m&sup2;) <span className="text-destructive">*</span>
                                            </FieldLabel>
                                            <Input
                                                id={`${idPrefix}-${line.key}-unsurveyedSize`}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={line.unsurveyedSize}
                                                onChange={(e) =>
                                                    updateLine(line.key, "unsurveyedSize", e.target.value)
                                                }
                                                placeholder="e.g. 500"
                                                aria-invalid={!!lineErrors.unsurveyedSize}
                                            />
                                            <FieldError
                                                errors={lineErrors.unsurveyedSize ? [{message: lineErrors.unsurveyedSize}] : undefined}/>
                                        </Field>

                                        <Field data-invalid={!!lineErrors.surveyedSize}>
                                            <FieldLabel htmlFor={`${idPrefix}-${line.key}-surveyedSize`}>
                                                Surveyed size (m&sup2;)
                                            </FieldLabel>
                                            <Input
                                                id={`${idPrefix}-${line.key}-surveyedSize`}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={line.surveyedSize}
                                                onChange={(e) => updateLine(line.key, "surveyedSize", e.target.value)}
                                                placeholder="Optional"
                                                aria-invalid={!!lineErrors.surveyedSize}
                                            />
                                            <FieldError
                                                errors={lineErrors.surveyedSize ? [{message: lineErrors.surveyedSize}] : undefined}/>
                                        </Field>

                                        <Field>
                                            <FieldLabel htmlFor={`${idPrefix}-${line.key}-availability`}>
                                                Availability
                                            </FieldLabel>
                                            <Select
                                                value={line.availability}
                                                onValueChange={(v) => updateLine(line.key, "availability", v as Availability)}
                                            >
                                                <SelectTrigger id={`${idPrefix}-${line.key}-availability`} className="w-full">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="AVAILABLE">Available</SelectItem>
                                                    <SelectItem value="SOLD">Sold</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={isSaving}>
                        <PlusIcon/> Add another plot
                    </Button>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? "Saving..." : lines.length > 1 ? `Save ${lines.length} plots` : "Save plot"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
