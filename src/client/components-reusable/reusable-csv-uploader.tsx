"use client";

import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table";
import {Separator} from "@/components/ui/separator";
import {addSpacesBeforeCapitals, cn} from "@/lib/utils";
// ============================================================================
// Simple Stepper (vertical only, reusing styles from MultiStepForm)
// ============================================================================
import {AlertCircle, Check, Loader2} from "lucide-react";
import {CSVIcon, ImportIcon } from "@/assets/icons/index";
import {ScrollArea, ScrollBar} from "@/components/ui/scroll-area";
import {toast} from "sonner"

type StepState = "completed" | "active" | "inactive";

interface CsvStepperProps {
    currentStep: number;
    steps: { title: string; description?: string }[];
    orientation?: "vertical" | "horizontal";
}

function CsvStepper({currentStep, steps, orientation = "vertical"}: CsvStepperProps) {
    const isHorizontal = orientation === "horizontal";

    return (
        <div
            className={cn(
                "w-full min-w-0",
                isHorizontal ? "flex" : "flex flex-col h-full",
            )}
            aria-label="Upload steps"
        >
            {isHorizontal ? (
                <ScrollArea className="w-full">
                    <div className="flex items-start gap-4 pb-3">
                        {steps.map((step, index) => {
                            const stepIndex = index + 1;
                            const state: StepState =
                                stepIndex < currentStep
                                    ? "completed"
                                    : stepIndex === currentStep
                                        ? "active"
                                        : "inactive";

                            return (
                                <div key={step.title} className="flex items-center gap-3">
                                    {/* Indicator + label */}
                                    <div className="flex flex-col items-center gap-1 min-w-[80px]">
                    <span
                        className={cn(
                            "flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors shrink-0",
                            state === "active" && "border-primary bg-primary text-primary-foreground",
                            state === "completed" && "border-green-500 bg-green-500 text-white",
                            state === "inactive" && "border-gray-300 bg-background text-gray-500",
                        )}
                        aria-current={state === "active" ? "step" : undefined}
                    >
                      {state === "completed" ? (
                          <Check className="size-4 stroke-3"/>
                      ) : (
                          stepIndex
                      )}
                    </span>

                                        <p
                                            className={cn(
                                                "text-xs font-medium text-center leading-tight",
                                                state === "inactive" ? "text-muted-foreground" : "text-foreground",
                                            )}
                                            title={step.description}
                                        >
                                            {step.title}
                                        </p>
                                    </div>

                                    {/* Horizontal separator line */}
                                    {index < steps.length - 1 && (
                                        <div
                                            className={cn(
                                                "mt-[-14px] h-0.5 w-10 transition-colors",
                                                state === "completed" ? "bg-green-500" : "bg-gray-300",
                                            )}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal"/>
                </ScrollArea>
            ) : (
                steps.map((step, index) => {
                    const stepIndex = index + 1;
                    const state: StepState =
                        stepIndex < currentStep
                            ? "completed"
                            : stepIndex === currentStep
                                ? "active"
                                : "inactive";

                    return (
                        <div key={step.title} className="flex items-start gap-3 relative flex-1">
                            {/* Indicator */}
                            <div className="flex flex-col items-center h-full">
                <span
                    className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors shrink-0",
                        state === "active" && "border-primary bg-primary text-primary-foreground",
                        state === "completed" && "border-green-500 bg-green-500 text-white",
                        state === "inactive" && "border-gray-300 bg-background text-gray-500",
                    )}
                    aria-current={state === "active" ? "step" : undefined}
                >
                  {state === "completed" ? (
                      <Check className="size-4 stroke-3"/>
                  ) : (
                      stepIndex
                  )}
                </span>

                                {/* Separator line */}
                                {index < steps.length - 1 && (
                                    <div
                                        className={cn(
                                            "mt-2 w-0.5 flex-1 transition-colors",
                                            state === "completed" ? "bg-green-500" : "bg-gray-300",
                                        )}
                                    />
                                )}
                            </div>

                            {/* Label */}
                            <div className="space-y-1 pt-1">
                                <p
                                    className={cn(
                                        "text-sm font-medium transition-colors",
                                        state === "active" && "text-foreground",
                                        state === "completed" && "text-foreground",
                                        state === "inactive" && "text-muted-foreground",
                                    )}
                                >
                                    {step.title}
                                </p>
                                {step.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {step.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

export default CsvStepper;

// ============================================================================
// Types
// ============================================================================

export type CsvColumnType = "string" | "number" | "boolean" | "date" | "enum";

export interface CsvFieldConfig<TInsert extends Record<string, unknown>> {
    /** Key from the inferred Drizzle insert type, e.g. keyof NewContact */
    key: keyof TInsert & string;
    /** Human label to show in the UI; falls back to prettified key */
    label?: string;
    /** Is this column required (i.e. .notNull() in Drizzle) */
    required?: boolean;
    /** Basic runtime type hint used for parsing */
    type: CsvColumnType;
    /** Optional description/help text */
    description?: string;
    /** Optional enum values for select / validation */
    enumValues?: readonly string[];
    /** Optional custom parser. Return null/undefined to treat as empty. */
    parse?: (raw: string) => TInsert[keyof TInsert] | null | undefined;
}

export interface CsvImportRowResult {
    row: number;
    status: "created" | "skipped" | "failed";
    reason?: string;
    id?: string;
}

export interface CsvImportSummary {
    created: number;
    results: CsvImportRowResult[];
}

export interface CsvUploaderProps<TInsert extends Record<string, unknown>> {
    /** Name of the entity being uploaded, e.g. "Contact". Only used for copy. */
    entityName: string;
    /** Configuration for the columns based on Drizzle's $inferInsert type. */
    fields: CsvFieldConfig<TInsert>[];
    /** Maximum accepted file size in MB (default: 5MB). */
    maxFileSizeMb?: number;
    /**
     * Server action or mutation that will receive the parsed and mapped rows.
     * May return a per-row created/skipped/failed summary, which the uploader
     * renders instead of its generic "imported" toast; returning nothing
     * keeps the previous generic toast behavior.
     */
    onSubmit: (rows: TInsert[]) => Promise<CsvImportSummary | void> | CsvImportSummary | void;
}

// ============================================================================
// Helpers
// ============================================================================

interface ParsedCsv {
    headers: string[];
    rows: string[][];
}

const isRowEmpty = (row: string[]) => row.every((cell) => cell.trim().length === 0);

// RFC4180-ish CSV parser with support for quoted fields, commas and newlines.
// It parses the whole text character-by-character so newlines inside quotes work.
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === "\"") {
            const nextChar = text[i + 1];
            if (inQuotes && nextChar === "\"") {
                // Escaped quote ""
                field += "\"";
                i++; // skip second quote
            } else {
                // Toggle quoted state
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(field);
            field = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            // Treat CRLF as a single newline
            if (char === "\r" && text[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            field = "";
            if (row.length > 0) {
                rows.push(row);
            }
            row = [];
            continue;
        }

        field += char;
    }

    // Flush last field/row
    if (field.length > 0 || row.length > 0) {
        row.push(field);
    }
    if (row.length > 0) {
        rows.push(row);
    }

    return rows;
}

function basicCsvParse(text: string): ParsedCsv {
    const rawRows = parseCsv(text);
    const rows = rawRows.filter(
        (r) => r.length && !(r.length === 1 && r[0].trim().length === 0),
    );

    if (!rows.length) {
        return {headers: [], rows: []};
    }

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((h) => h.replace(/^"|"$/g, "").trim());

    return {headers, rows: dataRows};
}

function defaultParseByType(type: CsvColumnType, raw: string): unknown {
    const value = raw.trim();
    if (value === "") return null;

    switch (type) {
        case "number": {
            const n = Number(value.replace(/,/g, ""));
            return Number.isNaN(n) ? null : n;
        }
        case "boolean": {
            const v = value.toLowerCase();
            if (["true", "yes", "1", "y"].includes(v)) return true;
            if (["false", "no", "0", "n"].includes(v)) return false;
            return null;
        }
        case "date": {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
        case "enum":
        case "string":
        default:
            return value;
    }
}

// ============================================================================
// Main Reusable CSV Uploader
// ============================================================================

export function ReusableCSVUploader<TInsert extends Record<string, unknown>>({
                                                                                 entityName,
                                                                                 fields,
                                                                                 maxFileSizeMb = 5,
                                                                                 onSubmit,
                                                                             }: CsvUploaderProps<TInsert>) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [file, setFile] = useState<File | null>(null);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<string, string | "__ignore" | null>>({});
    const [preview, setPreview] = useState<TInsert[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [importSummary, setImportSummary] = useState<CsvImportSummary | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const resetUploader = useCallback(() => {
        setImportSummary(null);
        setStep(1);
        setFile(null);
        setCsvHeaders([]);
        setCsvRows([]);
        setMapping({});
        setPreview([]);
        setError(null);
    }, []);

    // This uploader is often rendered inside a narrow Sheet on desktop, where viewport-based
    // breakpoints (md/lg) won't reflect the actual available width.
    // Use element width (ResizeObserver) to decide when to show the stepper on the left.
    const layoutRef = useRef<HTMLDivElement | null>(null);
    const [isWideLayout, setIsWideLayout] = useState(false);

    useEffect(() => {
        if (!layoutRef.current) return;

        const el = layoutRef.current;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            // Match Tailwind's `lg` breakpoint (1024px) but based on container width.
            setIsWideLayout(width >= 1024);
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const steps = useMemo(
        () => [
            {
                title: "Step 1 - CSV Selection",
                description: "Drag & drop or select a CSV file to begin.",
            },
            {
                title: "Step 2 - Data Mapping",
                description: "Map CSV columns to the correct fields.",
            },
            {
                title: "Step 3 - Confirm Mapping",
                description: "Review sample rows before importing.",
            },
        ],
        [],
    );

    const requiredFields = fields.filter((f) => f.required);

    const requiredFieldsMissing = useMemo(
        () =>
            requiredFields.filter((field) => {
                const mappedHeader = mapping[field.key];
                return !mappedHeader || mappedHeader === "__ignore";
            }),
        [mapping, requiredFields],
    );

    const handleFile = useCallback(
        async (file: File) => {
            setError(null);

            const sizeMb = file.size / (1024 * 1024);
            if (sizeMb > maxFileSizeMb) {
                setError(`File is too large. Maximum size is ${maxFileSizeMb}MB.`);
                return;
            }

            if (!file.name.toLowerCase().endsWith(".csv")) {
                setError("Only CSV files are supported.");
                return;
            }

            const text = await file.text();
            const parsed = basicCsvParse(text);

            if (!parsed.headers.length) {
                setError("Could not find any headers in this CSV file.");
                return;
            }

            setFile(file);
            setCsvHeaders(parsed.headers);
            setCsvRows(parsed.rows);

            // Heuristic auto-mapping: try to match by label or key.
            // NOTE: avoid substring matching (e.g. "unsurveyedSize" contains "surveyedSize").
            const toTokens = (input: string) =>
                input
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/[^a-zA-Z0-9]+/g, " ")
                    .trim()
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(Boolean);

            const normalize = (input: string) => toTokens(input).join(" ");

            const scoreMatch = (header: string, candidate: string) => {
                const hNorm = normalize(header);
                const cNorm = normalize(candidate);
                if (!hNorm || !cNorm) return 0;
                if (hNorm === cNorm) return 100;

                const hTokens = toTokens(header);
                const cTokens = toTokens(candidate);
                if (cTokens.length && cTokens.every((t) => hTokens.includes(t))) return 50;
                return 0;
            };

            const initialMapping: Record<string, string | "__ignore" | null> = {};
            const usedHeaders = new Set<string>();

            for (const field of fields) {
                const candidates = [
                    field.label,
                    addSpacesBeforeCapitals(field.key),
                    field.key,
                ].filter(Boolean) as string[];

                const scored = parsed.headers
                    .map((h) => {
                        const bestScore = Math.max(...candidates.map((c) => scoreMatch(h, c)));
                        return {header: h, score: bestScore};
                    })
                    .filter((x) => x.score > 0)
                    .sort((a, b) => b.score - a.score || a.header.length - b.header.length);

                const firstUnused = scored.find((s) => !usedHeaders.has(s.header));
                const chosen = (firstUnused ?? scored[0])?.header;

                initialMapping[field.key] = chosen ?? null;
                if (chosen) usedHeaders.add(chosen);
            }

            setMapping(initialMapping);
            setStep(2);
        },
        [fields, maxFileSizeMb],
    );

    const onDrop = useCallback(
        async (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) {
                void handleFile(file);
            }
        },
        [handleFile],
    );

    const onFileInputChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) {
                void handleFile(file);
            }
        },
        [handleFile],
    );

    const buildPreviewAndValidate = useCallback(() => {
        if (!csvRows.length) return;

        const nonEmptyRows = csvRows.filter((row) => !isRowEmpty(row));
        const mappedRows: TInsert[] = [];

        // Build a full mapped preview so the user can verify *all* rows before upload.
        for (const row of nonEmptyRows) {
            const record: Record<string, unknown> = {};

            for (const field of fields) {
                const mappedHeader = mapping[field.key];
                if (!mappedHeader || mappedHeader === "__ignore") {
                    continue;
                }

                const headerIndex = csvHeaders.indexOf(mappedHeader);
                const raw = row[headerIndex] ?? "";

                const parsedValue = field.parse
                    ? field.parse(raw)
                    : defaultParseByType(field.type, raw);

                if (parsedValue === null || parsedValue === undefined) {
                    // For preview we just show null; full validation happens on submit.
                    record[field.key] = null;
                } else {
                    record[field.key] = parsedValue;
                }
            }

            mappedRows.push(record as TInsert);
        }

        setPreview(mappedRows);
        setStep(3);
    }, [csvHeaders, csvRows, fields, mapping]);

    const handleConfirmAndSubmit = useCallback(async () => {
        setError(null);
        if (!csvRows.length) return;

        // Enforce required mapping UX.
        if (requiredFieldsMissing.length) {
            setError("Please map all required fields before importing.");
            setStep(2);
            return;
        }

        const resultRows: TInsert[] = [];

        for (let rowIndex = 0; rowIndex < csvRows.length; rowIndex++) {
            const row = csvRows[rowIndex];

            // Skip completely empty rows (common when CSV has a trailing newline)
            if (isRowEmpty(row)) {
                continue;
            }

            const record: Record<string, unknown> = {};

            for (const field of fields) {
                const mappedHeader = mapping[field.key];

                if (!mappedHeader || mappedHeader === "__ignore") {
                    if (field.required) {
                        setError(
                            `Row ${rowIndex + 2}: Required field "${field.label ?? field.key}" is not mapped.`,
                        );
                        setStep(2);
                        return;
                    }
                    continue;
                }

                const headerIndex = csvHeaders.indexOf(mappedHeader);
                const raw = row[headerIndex] ?? "";

                const parsedValue = field.parse
                    ? field.parse(raw)
                    : defaultParseByType(field.type, raw);

                if ((parsedValue === null || parsedValue === undefined) && field.required) {
                    setError(
                        `Row ${rowIndex + 2}: Could not parse required field "${field.label ?? field.key}" from value "${raw}".`,
                    );
                    setStep(3);
                    return;
                }

                record[field.key] = parsedValue as unknown;
            }

            resultRows.push(record as TInsert);
        }

        setIsSubmitting(true);
        try {
            const summary = await onSubmit(resultRows);

            if (summary) {
                // A summary was returned — show the created/skipped/failed
                // breakdown instead of the generic toast (see
                // docs/specs/0001-contacts-completion/0005-contacts-csv-bulk-import.md).
                setImportSummary(summary);
                setIsSubmitting(false);
                return;
            }

            toast(`${entityName} imported`, {
                description: `Successfully imported ${resultRows.length} row${resultRows.length === 1 ? "" : "s"}.`,
                duration: 5000,
                icon: <ImportIcon className="size-6"/>,
            });

            setIsSubmitting(false);
            setStep(1);
            setFile(null);
            setCsvHeaders([]);
            setCsvRows([]);
            setMapping({});
            setPreview([]);
        } catch (err) {
            console.error("CSV upload failed", err);
            setError(
                err instanceof Error ? err.message : "Failed to upload data. Please try again.",
            );
            setIsSubmitting(false);
        }
    }, [csvHeaders, csvRows, entityName, fields, mapping, onSubmit, requiredFieldsMissing]);

    const dropzoneLabelId = "csv-upload-dropzone-label";

    if (importSummary) {
        const skippedResults = importSummary.results.filter((r) => r.status === "skipped");
        const failedResults = importSummary.results.filter((r) => r.status === "failed");
        const problemRows = importSummary.results.filter((r) => r.status !== "created");

        return (
            <div className="m-4 space-y-4">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Import results</h2>
                    <p className="text-xs text-muted-foreground">
                        {entityName} import finished.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-emerald-600/40 text-emerald-600">
                        Created: {importSummary.created}
                    </Badge>
                    <Badge variant="outline" className="border-amber-600/40 text-amber-600">
                        Skipped: {skippedResults.length}
                    </Badge>
                    <Badge variant="destructive">
                        Failed: {failedResults.length}
                    </Badge>
                </div>

                {problemRows.length > 0 && (
                    <ScrollArea className="h-[360px] pe-3.5">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Row</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {problemRows.map((result) => (
                                    <TableRow key={result.row}>
                                        <TableCell className="text-xs">{result.row}</TableCell>
                                        <TableCell className="text-xs capitalize">{result.status}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {result.reason ?? "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableCaption>
                                Rows not listed here were created successfully.
                            </TableCaption>
                        </Table>
                    </ScrollArea>
                )}

                <div className="flex justify-end pt-2">
                    <Button size="sm" type="button" onClick={resetUploader} className="btn-primary">
                        Import another file
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={layoutRef}
            className={cn(
                "flex gap-6 m-4",
                isWideLayout ? "flex-row" : "flex-col",
            )}
        >
            {/* Stepper */}
            <div className={cn("mt-2", isWideLayout ? "min-w-[220px] w-auto" : "w-full")}>
                <CsvStepper
                    currentStep={step}
                    steps={steps}
                    orientation={isWideLayout ? "vertical" : "horizontal"}
                />
            </div>

            {/* Divider (horizontal when stacked, vertical when side-by-side) */}
            <div
                className={cn(
                    "border-dashed border-muted-foreground/40",
                    isWideLayout ? "w-px self-stretch border-l" : "h-px w-full border-t",
                )}
            />

            <div className="flex-1 space-y-6 mt-2">
                {/* Step content */}
                {step === 1 && (
                    <section aria-labelledby={dropzoneLabelId} className="space-y-4">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    fileInputRef.current?.click();
                                }
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragActive(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                setDragActive(false);
                            }}
                            onDrop={onDrop}
                            className={cn(
                                "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center transition-colors cursor-pointer",
                                isWideLayout ? "h-[480px] py-10" : "h-[320px] py-6",
                                dragActive && "border-primary bg-primary/5",
                            )}
                        >
                            <CSVIcon className="mb-6 h-12 w-12 text-muted-foreground"/>
                            <p id={dropzoneLabelId} className="text-sm font-medium text-foreground">
                                Drop CSV here or <span className="text-primary underline">browse files</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Maximum CSV size: {maxFileSizeMb}MB - Maximum files: 1
                            </p>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={onFileInputChange}
                            />
                        </div>

                        {file && (
                            <p className="text-xs text-muted-foreground">
                                Selected file: <span className="font-medium">{file.name}</span>
                            </p>
                        )}

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <AlertCircle className="size-4"/>
                            <span>
                Ensure your first row contains column headers. You can map them in the next step.
              </span>
                        </div>
                    </section>
                )}

                {step === 2 && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <div className="space-y-1">
                                <h2 className="text-md font-semibold">Map CSV columns to {entityName}</h2>
                                <p className="text-xs text-muted-foreground">
                                    Required fields must be mapped before you can continue.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={() => setStep(1)}
                                className="btn-primary"
                            >
                                Change file
                            </Button>
                        </div>
                        <ScrollArea className="h-[430px] pe-3.5">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Field</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Required</TableHead>
                                        <TableHead>CSV column</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field) => {
                                        const mappedHeader = mapping[field.key];
                                        const isRequiredMissing =
                                            field.required && (!mappedHeader || mappedHeader === "__ignore");

                                        return (
                                            <TableRow key={field.key}
                                                      className={isRequiredMissing ? "bg-destructive/5" : ""}>
                                                <TableCell>
                                                    <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">
                              {field.label ?? addSpacesBeforeCapitals(field.key)}
                            </span>
                                                        {field.description && (
                                                            <span className="text-xs text-muted-foreground">
                                {field.description}
                              </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs uppercase text-muted-foreground">
                                                    {field.type}
                                                </TableCell>
                                                <TableCell>
                                                    {field.required ? (
                                                        <Badge variant="destructive">Required</Badge>
                                                    ) : (
                                                        <Badge variant="outline">Optional</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <Select
                                                            value={mappedHeader ?? ""}
                                                            onValueChange={(value) => {
                                                                setMapping((prev) => ({
                                                                    ...prev,
                                                                    [field.key]: value,
                                                                }));
                                                            }}
                                                        >
                                                            <SelectTrigger size="sm" className="min-w-[180px]">
                                                                <SelectValue placeholder="Select a column or ignore"/>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="__ignore">Ignore column</SelectItem>
                                                                {csvHeaders.map((header) => (
                                                                    <SelectItem key={header} value={header}>
                                                                        {header}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {isRequiredMissing && (
                                                            <span
                                                                className="flex items-center gap-1 text-[11px] text-destructive">
                                <AlertCircle className="size-3"/>
                                Required field must be mapped
                              </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-muted-foreground">
                {requiredFieldsMissing.length > 0 && (
                    <>
                    <span className="font-medium text-destructive">
                      {requiredFieldsMissing.length} required field
                        {requiredFieldsMissing.length > 1 ? "s" : ""} missing mapping.
                    </span>{" "}
                        Please map them to continue.
                    </>
                )}
              </span>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="cursor-pointer"
                                >
                                    Back
                                </Button>
                                <Button
                                    size="sm"
                                    type="button"
                                    disabled={requiredFieldsMissing.length > 0}
                                    onClick={buildPreviewAndValidate}
                                    className="btn-primary"
                                >
                                    Continue
                                </Button>
                            </div>
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section className="space-y-4">
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">Confirm mapping</h2>
                            <p className="text-xs text-muted-foreground">
                                Review how your CSV rows will be imported into {entityName}.
                            </p>
                        </div>

                        <div className="space-y-2 text-xs">
                            <h3 className="font-medium">Mapped fields</h3>
                            <div className="flex flex-wrap gap-1">
                                {fields.map((field) => {
                                    const mappedHeader = mapping[field.key];
                                    if (!mappedHeader || mappedHeader === "__ignore") return null;

                                    return (
                                        <Badge key={field.key} variant="outline">
                                            {field.label ?? addSpacesBeforeCapitals(field.key)} - <span
                                            className="text-muted-foreground">{mappedHeader}</span>
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>

                        <Separator/>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">Rows to import</span>
                                <span className="text-muted-foreground">
                  Showing {preview.length} of {preview.length} row{preview.length === 1 ? "" : "s"}
                </span>
                            </div>

                            {isSubmitting && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin"/>
                                    <span>
                    Uploading {csvRows.length} row{csvRows.length === 1 ? "" : "s"}...
                  </span>
                                </div>
                            )}
                            <ScrollArea
                                className={cn(
                                    "w-full pe-3.5",
                                    isWideLayout ? "h-[360px]" : "h-[300px]",
                                )}
                            >
                                <div className="min-w-max">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                {fields.map((field) => (
                                                    <TableHead key={field.key}>
                                                        {field.label ?? addSpacesBeforeCapitals(field.key)}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {preview.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={fields.length}
                                                               className="text-center text-xs text-muted-foreground">
                                                        No preview available.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {preview.map((row, i) => (
                                                <TableRow key={i}>
                                                    {fields.map((field) => (
                                                        <TableCell key={field.key} className="text-xs">
                                                            {String(row[field.key] ?? "")}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableCaption>
                                            Data will be saved after you confirm.
                                        </TableCaption>
                                    </Table>
                                </div>
                                <ScrollBar orientation="horizontal"/>
                            </ScrollArea>
                            <div className="flex items-center justify-between pt-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => setStep(2)}
                                    className="cursor-pointer"
                                >
                                    Back to mapping
                                </Button>
                                <Button
                                    size="sm"
                                    type="button"
                                    onClick={handleConfirmAndSubmit}
                                    disabled={isSubmitting}
                                    className="btn-primary"
                                >
                                    {isSubmitting ? "Uploading..." : "Confirm & Upload"}
                                </Button>
                            </div>
                        </div>
                    </section>
                )}

                {error && (
                    <div
                        className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 size-4"/>
                        <p>{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}