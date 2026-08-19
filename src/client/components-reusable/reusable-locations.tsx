import {useId, useMemo} from "react"

import {cn} from "@/lib/utils"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import {FieldContent, FieldError, FieldLabel} from "@/components/ui/field"

import {
    getDistrictNames,
    getRegionNames,
    getStreetNames,
    getWardNames,
    useTanzaniaLocations,
} from "@/constants/tanzania-locations"

/**
 * The four-field address shape shared by any form that needs a Tanzania
 * region/district/ward/street address (contacts, plots, sales agents, ...).
 * Kept as a plain string record so it lines up 1:1 with the corresponding
 * DB columns, which are all nullable `text` — empty string means "not set".
 */
export interface TanzaniaAddressValue {
    region: string
    district: string
    ward: string
    street: string
}

export const EMPTY_TANZANIA_ADDRESS: TanzaniaAddressValue = {
    region: "",
    district: "",
    ward: "",
    street: "",
}

export interface TanzaniaAddressErrors {
    region?: string
    district?: string
    ward?: string
    street?: string
}

export interface TanzaniaLocationFieldsProps {
    /** Controlled value — the four address fields as currently held by the parent form. */
    value: TanzaniaAddressValue
    /**
     * Called with the *whole* next address whenever any field changes.
     * Selecting a region always clears district/ward/street (and so on down
     * the chain) so the parent never has to reimplement that reset logic.
     */
    onChange: (value: TanzaniaAddressValue) => void
    /** Per-field validation messages, keyed the same way `values`/`errors` already are in this form. */
    errors?: TanzaniaAddressErrors
    /** Disables all four fields, e.g. while the form is submitting. */
    disabled?: boolean
    /** Shows a required marker on each label. Validation itself stays the caller's responsibility. */
    required?: boolean
    /** Prefix for the generated element ids — set this if two instances render on the same page. */
    idPrefix?: string
    className?: string
}

/**
 * Cascading Region -> District -> Ward -> Street picker backed by
 * `constants/tanzania_postcodes.json`. Each field only becomes interactive
 * once its parent is selected, and picking a new value at any level clears
 * everything below it.
 *
 * Fully controlled — wire it to any form's existing state:
 *
 * ```tsx
 * <TanzaniaLocationFields
 *   value={{ region: values.region, district: values.district, ward: values.ward, street: values.street }}
 *   onChange={(next) => setValues((prev) => ({ ...prev, ...next }))}
 *   errors={{ region: errors.region, district: errors.district, ward: errors.ward, street: errors.street }}
 * />
 * ```
 */
export function TanzaniaLocationFields({
                                           value,
                                           onChange,
                                           errors,
                                           disabled = false,
                                           required = false,
                                           idPrefix,
                                           className,
                                       }: TanzaniaLocationFieldsProps) {
    const generatedId = useId()
    const prefix = idPrefix ?? generatedId

    const {data, isLoading, isError, error, refetch} = useTanzaniaLocations()

    const regionOptions = useMemo(() => (data ? getRegionNames(data) : []), [data])
    const districtOptions = useMemo(
        () => (data ? getDistrictNames(data, value.region) : []),
        [data, value.region]
    )
    const wardOptions = useMemo(
        () => (data ? getWardNames(data, value.region, value.district) : []),
        [data, value.region, value.district]
    )
    const streetOptions = useMemo(
        () => (data ? getStreetNames(data, value.region, value.district, value.ward) : []),
        [data, value.region, value.district, value.ward]
    )

    const handleRegionChange = (next: string | null) => {
        onChange({region: next ?? "", district: "", ward: "", street: ""})
    }
    const handleDistrictChange = (next: string | null) => {
        onChange({...value, district: next ?? "", ward: "", street: ""})
    }
    const handleWardChange = (next: string | null) => {
        onChange({...value, ward: next ?? "", street: ""})
    }
    const handleStreetChange = (next: string | null) => {
        onChange({...value, street: next ?? ""})
    }

    if (isError) {
        return (
            <div
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs/relaxed text-destructive">
                {error instanceof Error ? `: ${error.message}` : "."}{" "}
                <button
                    type="button"
                    onClick={() => void refetch()}
                    className="font-medium underline underline-offset-2"
                >
                    Retry
                </button>
            </div>
        )
    }

    const dataLoaded = !isLoading && !!data

    return (
        <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
            <LevelField
                id={`${prefix}-region`}
                label="Region"
                required={required}
                error={errors?.region}
                value={value.region}
                onValueChange={handleRegionChange}
                options={regionOptions}
                placeholder={dataLoaded ? "Select region" : "Loading regions..."}
                emptyMessage="No matching region"
                disabled={disabled || !dataLoaded}
            />

            <LevelField
                // Remount when the region changes so any typed search text and
                // internal highlight state from the previous region don't linger.
                key={`district-${value.region}`}
                id={`${prefix}-district`}
                label="District"
                required={required}
                error={errors?.district}
                value={value.district}
                onValueChange={handleDistrictChange}
                options={districtOptions}
                placeholder={value.region ? "Select district" : "Select a region first"}
                emptyMessage="No matching district"
                disabled={disabled || !dataLoaded || !value.region}
            />

            <LevelField
                key={`ward-${value.region}-${value.district}`}
                id={`${prefix}-ward`}
                label="Ward"
                required={required}
                error={errors?.ward}
                value={value.ward}
                onValueChange={handleWardChange}
                options={wardOptions}
                placeholder={value.district ? "Select ward" : "Select a district first"}
                emptyMessage="No matching ward"
                disabled={disabled || !dataLoaded || !value.district}
            />

            <LevelField
                key={`street-${value.region}-${value.district}-${value.ward}`}
                id={`${prefix}-street`}
                label="Street"
                required={required}
                error={errors?.street}
                value={value.street}
                onValueChange={handleStreetChange}
                options={streetOptions}
                placeholder={value.ward ? "Select street" : "Select a ward first"}
                emptyMessage="No matching street"
                disabled={disabled || !dataLoaded || !value.ward}
            />
        </div>
    )
}

interface LevelFieldProps {
    id: string
    label: string
    required: boolean
    error: string | undefined
    value: string
    onValueChange: (next: string | null) => void
    options: readonly string[]
    placeholder: string
    emptyMessage: string
    disabled: boolean
}

function LevelField({
                        id,
                        label,
                        required,
                        error,
                        value,
                        onValueChange,
                        options,
                        placeholder,
                        emptyMessage,
                        disabled,
                    }: LevelFieldProps) {
    return (
        <FieldContent data-invalid={!!error}>
            <FieldLabel htmlFor={id}>
                {label} {required && <span className="text-destructive">*</span>}
            </FieldLabel>

            {/* `items` + `value` + `onValueChange` drive selection; the single
          ComboboxInput below both displays the selected value when closed
          and doubles as the live search box while the popup is open — it
          is not paired with a second input inside ComboboxContent. */}
            <Combobox items={options} value={value || null} onValueChange={onValueChange} disabled={disabled}>
                <ComboboxInput
                    id={id}
                    placeholder={placeholder}
                    showClear={!!value && !disabled}
                    aria-invalid={!!error}
                    disabled={disabled}
                />
                <ComboboxContent>
                    <ComboboxEmpty className="px-4 py-2.5 text-sm">{emptyMessage}</ComboboxEmpty>
                    <ComboboxList>
                        {options.map((option) => (
                            <ComboboxItem key={option} value={option}>
                                {option}
                            </ComboboxItem>
                        ))}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>

            <FieldError errors={error ? [{message: error}] : undefined}/>
        </FieldContent>
    )
}