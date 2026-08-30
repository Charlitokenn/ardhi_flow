import {useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
import {apiClient} from "@/lib/api.ts"
import {Button} from "@/components/ui/button.tsx"
import {Input} from "@/components/ui/input.tsx"
import {PhoneInput} from "@/components/reui/phone-input.tsx"
import {Textarea} from "@/components/ui/textarea.tsx"
import {Field, FieldContent, FieldError, FieldGroup, FieldLabel, FieldSet,} from "@/components/ui/field.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {ColorPicker} from "@/components/ui/color-picker.tsx"
import {ColorSwatchIcon} from "@/assets/icons";

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
const DEFAULT_BRAND_COLOR = "#0F6B3D" // Default brand color matching seed data

interface FormValues {
    slogan: string
    primaryColor: string
    email: string
    mobileNumber: string
    address: string
    website: string
    signerTitle: string
}

const EMPTY_VALUES: FormValues = {
    slogan: "",
    primaryColor: "",
    email: "",
    mobileNumber: "",
    address: "",
    website: "",
    signerTitle: "",
}

function toFormValues(settings: Partial<Record<keyof FormValues, string | null>> | null | undefined): FormValues {
    return {
        slogan: settings?.slogan ?? "",
        primaryColor: settings?.primaryColor ?? "",
        email: settings?.email ?? "",
        mobileNumber: settings?.mobileNumber ?? "",
        address: settings?.address ?? "",
        website: settings?.website ?? "",
        signerTitle: settings?.signerTitle ?? "",
    }
}

// Mounted into a custom "Branding" page inside Clerk's own <OrganizationProfile>
// (see team-switcher.tsx). Company name and logo are shown read only, sourced
// live from Clerk — everything else here is edited and saved to the tenant's
// own `company_settings` row via GET/PUT /api/company-settings.
export function BrandingSettingsForm() {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
    const [seeded, setSeeded] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const settingsQuery = useQuery({
        queryKey: ["company-settings"],
        queryFn: async () => {
            const res = await api.api["company-settings"].$get()
            if (!res.ok) throw new Error(`Failed to load branding settings (${res.status})`)
            return res.json()
        },
    })

    if (settingsQuery.data && !seeded) {
        setSeeded(true)
        setValues(toFormValues(settingsQuery.data))
    }

    const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
        setValues((prev) => ({...prev, [key]: value}))
    }

    const saveSettings = useMutation({
        mutationFn: async () => {
            const res = await api.api["company-settings"].$put({
                json: {
                    slogan: values.slogan.trim() || null,
                    primaryColor: values.primaryColor.trim() || null,
                    email: values.email.trim() || null,
                    mobileNumber: values.mobileNumber.trim() || null,
                    address: values.address.trim() || null,
                    website: values.website.trim() || null,
                    signerTitle: values.signerTitle.trim() || null,
                },
            })
            if (!res.ok) {
                const body: unknown = await res.json().catch(() => null)
                const message = (body && typeof body === "object" && "error" in body ? (body as {
                        error?: string
                    }).error : null)
                    ?? "Failed to save branding settings"
                throw new Error(message)
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["company-settings"]})
            toast('Save Successful', {
                description: `Branding settings saved`,
                duration: 5000,
                icon: <ColorSwatchIcon className="size-6"/>,
            });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to save branding settings")
        },
    })

    const handleSave = () => {
        const color = values.primaryColor.trim()
        if (color && !HEX_COLOR_REGEX.test(color)) {
            setErrors({primaryColor: "Enter a 6 digit hex color, e.g. #1e3a5f"})
            return
        }
        setErrors({})
        saveSettings.mutate()
    }

    if (settingsQuery.isLoading) {
        return (
            <div className="space-y-4 p-1">
                <Skeleton className="h-16 w-full"/>
                <Skeleton className="h-9 w-full"/>
                <Skeleton className="h-9 w-full"/>
                <Skeleton className="h-9 w-full"/>
            </div>
        )
    }

    if (settingsQuery.isError) {
        return (
            <div className="p-1 text-sm text-destructive">
                {settingsQuery.error instanceof Error ? settingsQuery.error.message : "Failed to load branding settings"}
            </div>
        )
    }

    return (
        <div className="space-y-6 p-1">
            <FieldSet>
                <FieldGroup>
                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldLabel htmlFor="slogan">Slogan</FieldLabel>
                            <Input
                                id="slogan"
                                value={values.slogan}
                                onChange={(e) => update("slogan", e.target.value)}
                                placeholder="e.g. Your trusted land partner"
                            />
                        </FieldContent>
                        <FieldContent data-invalid={!!errors.primaryColor}>
                            <FieldLabel htmlFor="primaryColor">Brand color</FieldLabel>
                            <div className="flex items-center gap-2">
                                <ColorPicker
                                    value={values.primaryColor || DEFAULT_BRAND_COLOR}
                                    onChange={(hex) => update("primaryColor", hex)}
                                    showAlpha={false}
                                />
                                <span
                                    className="size-9 shrink-0 rounded-md border"
                                    style={{backgroundColor: HEX_COLOR_REGEX.test(values.primaryColor) ? values.primaryColor : undefined}}
                                />
                            </div>
                            <FieldError errors={errors.primaryColor ? [{message: errors.primaryColor}] : undefined}/>
                        </FieldContent>
                    </Field>
                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldLabel htmlFor="email">Official Email</FieldLabel>
                            <Input
                                id="email"
                                type="email"
                                value={values.email}
                                onChange={(e) => update("email", e.target.value)}
                                placeholder="name@example.com"
                            />
                        </FieldContent>
                        <FieldContent>
                            <FieldLabel htmlFor="mobileNumber">Official Mobile number</FieldLabel>
                            <PhoneInput
                                id="mobileNumber"
                                value={values.mobileNumber}
                                onChange={(v) => update("mobileNumber", v ?? "")}
                                defaultCountry="TZ"
                                placeholder="+255712000111"
                            />
                        </FieldContent>
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="address">Corporate Address</FieldLabel>
                        <Textarea
                            id="address"
                            value={values.address}
                            onChange={(e) => update("address", e.target.value)}
                            placeholder="Street, ward, district, region"
                            rows={2}
                        />
                    </Field>

                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldLabel htmlFor="website">Website</FieldLabel>
                            <Input
                                id="website"
                                value={values.website}
                                onChange={(e) => update("website", e.target.value)}
                                placeholder="https://example.com"
                            />
                        </FieldContent>
                        <FieldContent>
                            <FieldLabel htmlFor="signerTitle">Confirmation Letter Signatory's Title</FieldLabel>
                            <Input
                                id="signerTitle"
                                value={values.signerTitle}
                                onChange={(e) => update("signerTitle", e.target.value)}
                                placeholder="e.g. Meneja Mkuu"
                            />
                        </FieldContent>
                    </Field>
                </FieldGroup>
            </FieldSet>

            <div className="flex justify-end border-t pt-4">
                <Button type="button" onClick={handleSave} disabled={saveSettings.isPending}>
                    {saveSettings.isPending ? "Saving..." : "Save Branding"}
                </Button>
            </div>
        </div>
    )
}
