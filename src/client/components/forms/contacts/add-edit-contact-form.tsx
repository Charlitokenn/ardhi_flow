import { useEffect, useState } from "react"
import { useAuth } from "@clerk/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { apiClient } from "@/lib/api.ts"
import { useSheetControl } from "@/components-reusable/reusable-sheet.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { PhoneInput } from "@/components/reui/phone-input.tsx"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
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

type Gender = "MALE" | "FEMALE"
type IdType = "NATIONAL_ID" | "PASSPORT" | "DRIVER_LICENSE" | "VOTER_ID"
type Relationship = "PARENT" | "SIBLING" | "SPOUSE" | "FRIEND" | "OTHER"
type ContactType = "CLIENT" | "LAND_SELLER" | "AUDITOR" | "ICT_SUPPORT" | "SURVEYOR" | "SALES_AGENT"

// Sentinel used for "not selected" — Radix `Select.Item` rejects an empty
// string `value`, so unset optional selects use this instead and it's
// normalized back to "" before zod validation / API submission.
const UNSET = "UNSET"

export interface ContactRecord {
  id: string
  fullName: string
  mobileNumber: string | null
  altMobileNumber: string | null
  email: string | null
  gender: Gender | null
  contactType: ContactType | null
  idType: IdType | null
  idNumber: string | null
  region: string | null
  district: string | null
  ward: string | null
  street: string | null
  firstNOKName: string | null
  firstNOKMobile: string | null
  firstNOKRelationship: Relationship | null
  secondNOKName: string | null
  secondNOKMobile: string | null
  secondNOKRelationship: Relationship | null
  smsOptOut: boolean
}

interface FormValues {
  fullName: string
  mobileNumber: string
  altMobileNumber: string
  email: string
  gender: Gender | typeof UNSET
  contactType: ContactType
  idType: IdType | typeof UNSET
  idNumber: string
  region: string
  district: string
  ward: string
  street: string
  firstNOKName: string
  firstNOKMobile: string
  firstNOKRelationship: Relationship | typeof UNSET
  secondNOKName: string
  secondNOKMobile: string
  secondNOKRelationship: Relationship | typeof UNSET
  smsOptOut: boolean
}

const EMPTY_VALUES: FormValues = {
  fullName: "",
  mobileNumber: "",
  altMobileNumber: "",
  email: "",
  gender: UNSET,
  contactType: "CLIENT",
  idType: UNSET,
  idNumber: "",
  region: "",
  district: "",
  ward: "",
  street: "",
  firstNOKName: "",
  firstNOKMobile: "",
  firstNOKRelationship: UNSET,
  secondNOKName: "",
  secondNOKMobile: "",
  secondNOKRelationship: UNSET,
  smsOptOut: false,
}

// Fills in a full `ContactRecord` from whatever subset of fields the caller
// already knows about a row (e.g. the columns shown in the data grid), so
// the query cache can be seeded and the edit form can render instantly
// instead of showing a loading skeleton while the full record is fetched.
function buildSeedRecord(
  seed: Partial<ContactRecord> | undefined,
  contactId: string | undefined,
): ContactRecord | undefined {
  if (!seed || !contactId || seed.id !== contactId) return undefined
  return {
    id: contactId,
    fullName: seed.fullName ?? "",
    mobileNumber: seed.mobileNumber ?? null,
    altMobileNumber: seed.altMobileNumber ?? null,
    email: seed.email ?? null,
    gender: seed.gender ?? null,
    contactType: seed.contactType ?? null,
    idType: seed.idType ?? null,
    idNumber: seed.idNumber ?? null,
    region: seed.region ?? null,
    district: seed.district ?? null,
    ward: seed.ward ?? null,
    street: seed.street ?? null,
    firstNOKName: seed.firstNOKName ?? null,
    firstNOKMobile: seed.firstNOKMobile ?? null,
    firstNOKRelationship: seed.firstNOKRelationship ?? null,
    secondNOKName: seed.secondNOKName ?? null,
    secondNOKMobile: seed.secondNOKMobile ?? null,
    secondNOKRelationship: seed.secondNOKRelationship ?? null,
    smsOptOut: seed.smsOptOut ?? false,
  }
}

function toFormValues(contact: ContactRecord): FormValues {
  return {
    fullName: contact.fullName ?? "",
    mobileNumber: contact.mobileNumber ?? "",
    altMobileNumber: contact.altMobileNumber ?? "",
    email: contact.email ?? "",
    gender: contact.gender ?? UNSET,
    contactType: contact.contactType ?? "CLIENT",
    idType: contact.idType ?? UNSET,
    idNumber: contact.idNumber ?? "",
    region: contact.region ?? "",
    district: contact.district ?? "",
    ward: contact.ward ?? "",
    street: contact.street ?? "",
    firstNOKName: contact.firstNOKName ?? "",
    firstNOKMobile: contact.firstNOKMobile ?? "",
    firstNOKRelationship: contact.firstNOKRelationship ?? UNSET,
    secondNOKName: contact.secondNOKName ?? "",
    secondNOKMobile: contact.secondNOKMobile ?? "",
    secondNOKRelationship: contact.secondNOKRelationship ?? UNSET,
    smsOptOut: contact.smsOptOut ?? false,
  }
}

function buildPayload(values: FormValues) {
  return {
    fullName: values.fullName.trim(),
    mobileNumber: values.mobileNumber.trim() || null,
    altMobileNumber: values.altMobileNumber.trim() || null,
    email: values.email.trim() || null,
    gender: values.gender === UNSET ? null : values.gender,
    contactType: values.contactType,
    idType: values.idType === UNSET ? null : values.idType,
    idNumber: values.idNumber.trim() || null,
    region: values.region.trim() || null,
    district: values.district.trim() || null,
    ward: values.ward.trim() || null,
    street: values.street.trim() || null,
    firstNOKName: values.firstNOKName.trim() || null,
    firstNOKMobile: values.firstNOKMobile.trim() || null,
    firstNOKRelationship: values.firstNOKRelationship === UNSET ? null : values.firstNOKRelationship,
    secondNOKName: values.secondNOKName.trim() || null,
    secondNOKMobile: values.secondNOKMobile.trim() || null,
    secondNOKRelationship: values.secondNOKRelationship === UNSET ? null : values.secondNOKRelationship,
    smsOptOut: values.smsOptOut,
  }
}

const contactTypeOptions: { value: ContactType; label: string }[] = [
  { value: "CLIENT", label: "Client" },
  { value: "LAND_SELLER", label: "Land Seller" },
  { value: "SALES_AGENT", label: "Sales Agent" },
  { value: "AUDITOR", label: "Auditor" },
  { value: "SURVEYOR", label: "Surveyor" },
  { value: "ICT_SUPPORT", label: "ICT Support" },
]

const idTypeOptions: { value: IdType; label: string }[] = [
  { value: "NATIONAL_ID", label: "National ID" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVER_LICENSE", label: "Driver License" },
  { value: "VOTER_ID", label: "Voter ID" },
]

const relationshipOptions: { value: Relationship; label: string }[] = [
  { value: "PARENT", label: "Parent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "SPOUSE", label: "Spouse" },
  { value: "FRIEND", label: "Friend" },
  { value: "OTHER", label: "Other" },
]

// ============================================================================
// Zod validation (per step) — mirrors the field groups of the original
// add-contact-form.tsx / edit-contact-form.tsx "Contact Info" / "Address" /
// "Next of Kin" steps, adapted to this project's contacts schema/enums.
// ============================================================================

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/
const CONTACT_TYPE_VALUES = contactTypeOptions.map((o) => o.value)
const GENDER_VALUES: Gender[] = ["MALE", "FEMALE"]

const phoneRequired = z
  .string()
  .trim()
  .min(1, "Mobile number is required")
  .regex(PHONE_REGEX, "Enter a valid mobile number e.g. +255712000111")

const phoneOptional = z
  .string()
  .trim()
  .refine((v) => v === "" || PHONE_REGEX.test(v), "Enter a valid mobile number e.g. +255712000111")

const emailOptional = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address")

const contactInfoSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  mobileNumber: phoneRequired,
  altMobileNumber: phoneOptional,
  email: emailOptional,
  contactType: z.string().refine((v) => CONTACT_TYPE_VALUES.includes(v as ContactType), "Select a contact type"),
  gender: z.string().refine((v) => GENDER_VALUES.includes(v as Gender), "Select a gender"),
  idType: z.string(),
  idNumber: z.string().max(200, "ID number is too long"),
})

const addressSchema = z.object({
  region: z.string(),
  district: z.string(),
  ward: z.string(),
  street: z.string(),
})

const emergencySchema = z.object({
  firstNOKName: z.string(),
  firstNOKMobile: phoneOptional,
  firstNOKRelationship: z.string(),
  secondNOKName: z.string(),
  secondNOKMobile: phoneOptional,
  secondNOKRelationship: z.string(),
})

const steps = [
  { step: 1, title: "Contact info", schema: contactInfoSchema, fields: Object.keys(contactInfoSchema.shape) },
  { step: 2, title: "Address", schema: addressSchema, fields: Object.keys(addressSchema.shape) },
  { step: 3, title: "Next of kin", schema: emergencySchema, fields: Object.keys(emergencySchema.shape) },
] as const

const TOTAL_STEPS = steps.length

// The `Select` fields whose "not selected" state is the `UNSET` sentinel —
// normalized back to "" before running each step's zod schema.
const SELECT_FIELDS = ["gender", "idType", "firstNOKRelationship", "secondNOKRelationship"] as const

function normalizeForValidation(values: FormValues): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...values }
  for (const field of SELECT_FIELDS) {
    if (normalized[field] === UNSET) normalized[field] = ""
  }
  return normalized
}

interface AddEditContactFormProps {
  mode: "add" | "edit"
  contactId?: string
  onSuccess?: () => void
  // Partial contact data already known by the caller (e.g. the row currently
  // shown in the contacts data grid). When it matches `contactId`, it's used
  // to seed the React Query cache so the form renders immediately instead of
  // showing a skeleton, while the full record is still refetched in the
  // background to make sure it's up to date.
  initialData?: Partial<ContactRecord>
}

export function AddEditContactForm({ mode, contactId, onSuccess, initialData }: AddEditContactFormProps) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const api = apiClient(getToken)
  const sheetControl = useSheetControl()
  const isEdit = mode === "edit"

  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [currentStep, setCurrentStep] = useState(1)
  const [highestStep, setHighestStep] = useState(1)

  const contactQuery = useQuery({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const res = await api.api.contacts[":id"].$get({ param: { id: contactId! } })
      if (!res.ok) throw new Error("Failed to load contact")
      return (await res.json()) as ContactRecord
    },
    enabled: isEdit && !!contactId,
    initialData: () => buildSeedRecord(initialData, contactId),
  })

  useEffect(() => {
    if (isEdit && contactQuery.data) {
      setValues(toFormValues(contactQuery.data))
    } else if (!isEdit) {
      setValues(EMPTY_VALUES)
    }
    setErrors({})
    setCurrentStep(1)
    setHighestStep(1)
  }, [isEdit, contactQuery.data])

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] })
    if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] })
  }

  const createContact = useMutation({
    mutationFn: async () => {
      const res = await api.api.contacts.$post({ json: buildPayload(values) })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const message = (body && typeof body === "object" && "error" in body ? (body as { error?: string }).error : null)
          ?? "Failed to create contact"
        throw new Error(message)
      }
      return res.json()
    },
    onSuccess: () => {
      invalidate()
      toast.success(`${values.fullName} was added`)
      onSuccess?.()
      sheetControl?.close()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create contact")
    },
  })

  const updateContact = useMutation({
    mutationFn: async () => {
      const res = await api.api.contacts[":id"].$patch({ param: { id: contactId! }, json: buildPayload(values) })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const message = (body && typeof body === "object" && "error" in body ? (body as { error?: string }).error : null)
          ?? "Failed to update contact"
        throw new Error(message)
      }
      return res.json()
    },
    onSuccess: () => {
      invalidate()
      toast.success(`${values.fullName} was updated`)
      onSuccess?.()
      sheetControl?.close()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update contact")
    },
  })

  const isSaving = createContact.isPending || updateContact.isPending
  const isLoadingContact = isEdit && contactQuery.isLoading

  // Validates a single step's fields against its zod schema, replacing any
  // previous errors for that step's fields with the freshly computed ones.
  const validateStep = (stepNumber: number): boolean => {
    const stepDef = steps.find((s) => s.step === stepNumber)!
    const normalized = normalizeForValidation(values)
    const result = stepDef.schema.safeParse(normalized)
    const fieldErrors = result.success ? {} : result.error.flatten().fieldErrors

    setErrors((prev) => {
      const next = { ...prev }
      for (const field of stepDef.fields) delete next[field]
      for (const [key, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) next[key] = messages[0]
      }
      return next
    })

    return result.success
  }

  const goToStep = (step: number) => {
    if (step > currentStep && !validateStep(currentStep)) return
    setCurrentStep(step)
    setHighestStep((prev) => Math.max(prev, step))
  }

  const handleNext = () => goToStep(Math.min(currentStep + 1, TOTAL_STEPS))
  const handleBack = () => setCurrentStep((prev) => Math.max(1, prev - 1))

  const handleSave = () => {
    let firstInvalidStep: number | null = null
    for (const s of steps) {
      if (!validateStep(s.step) && firstInvalidStep === null) {
        firstInvalidStep = s.step
      }
    }

    if (firstInvalidStep !== null) {
      setCurrentStep(firstInvalidStep)
      setHighestStep((prev) => Math.max(prev, firstInvalidStep!))
      toast.error("Please fix the highlighted fields")
      return
    }

    if (isEdit) {
      updateContact.mutate()
    } else {
      createContact.mutate()
    }
  }

  const isLastStep = currentStep === TOTAL_STEPS

  if (isLoadingContact) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-2/3" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Stepper value={currentStep} onValueChange={goToStep} className="gap-6">
        <StepperNav>
          {steps.map(({ step, title }, index) => (
            <StepperItem key={step} step={step} completed={step < currentStep} disabled={step > highestStep}>
              <StepperTrigger className="flex-col gap-2">
                <StepperIndicator>{step}</StepperIndicator>
                <StepperTitle className="hidden text-center sm:block">{title}</StepperTitle>
              </StepperTrigger>
              {index < steps.length - 1 && <StepperSeparator />}
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel className="mt-6">
          <StepperContent value={1}>
            <div className="space-y-6">
              <FieldSet>
                <FieldLegend variant="label">Contact info</FieldLegend>
                <FieldGroup>
                  <Field data-invalid={!!errors.fullName}>
                    <FieldLabel htmlFor="fullName">
                      Full name <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="fullName"
                      value={values.fullName}
                      onChange={(e) => update("fullName", e.target.value)}
                      placeholder="e.g. John Doe"
                      aria-invalid={!!errors.fullName}
                    />
                    <FieldError errors={errors.fullName ? [{ message: errors.fullName }] : undefined} />
                  </Field>

                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="contactType">Contact type</FieldLabel>
                      <Select value={values.contactType} onValueChange={(v) => update("contactType", v as ContactType)}>
                        <SelectTrigger id="contactType" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {contactTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                    <FieldContent data-invalid={!!errors.gender}>
                      <FieldLabel htmlFor="gender">
                        Gender <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Select value={values.gender} onValueChange={(v) => update("gender", v as Gender)}>
                        <SelectTrigger id="gender" className="w-full" aria-invalid={!!errors.gender}>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldError errors={errors.gender ? [{ message: errors.gender }] : undefined} />
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <FieldContent data-invalid={!!errors.mobileNumber}>
                      <FieldLabel htmlFor="mobileNumber">
                        Mobile number <span className="text-destructive">*</span>
                      </FieldLabel>
                      <PhoneInput
                        id="mobileNumber"
                        value={values.mobileNumber}
                        onChange={(v) => update("mobileNumber", v ?? "")}
                        defaultCountry="TZ"
                        aria-invalid={!!errors.mobileNumber}
                      />
                      <FieldError errors={errors.mobileNumber ? [{ message: errors.mobileNumber }] : undefined} />
                    </FieldContent>
                    <FieldContent data-invalid={!!errors.altMobileNumber}>
                      <FieldLabel htmlFor="altMobileNumber">Alt mobile number</FieldLabel>
                      <PhoneInput
                        id="altMobileNumber"
                        value={values.altMobileNumber}
                        onChange={(v) => update("altMobileNumber", v ?? "")}
                        defaultCountry="TZ"
                        aria-invalid={!!errors.altMobileNumber}
                      />
                      <FieldError errors={errors.altMobileNumber ? [{ message: errors.altMobileNumber }] : undefined} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={!!errors.email}>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      value={values.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="name@example.com"
                      aria-invalid={!!errors.email}
                    />
                    <FieldError errors={errors.email ? [{ message: errors.email }] : undefined} />
                  </Field>

                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="idType">ID type</FieldLabel>
                      <Select value={values.idType} onValueChange={(v) => update("idType", v as IdType)}>
                        <SelectTrigger id="idType" className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET}>Not specified</SelectItem>
                          {idTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                    <FieldContent data-invalid={!!errors.idNumber}>
                      <FieldLabel htmlFor="idNumber">ID number</FieldLabel>
                      <Input
                        id="idNumber"
                        value={values.idNumber}
                        onChange={(e) => update("idNumber", e.target.value)}
                        placeholder="Enter valid ID number"
                        aria-invalid={!!errors.idNumber}
                      />
                      <FieldError errors={errors.idNumber ? [{ message: errors.idNumber }] : undefined} />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </div>
          </StepperContent>

          <StepperContent value={2}>
            <div className="space-y-6">
              <FieldSet>
                <FieldLegend variant="label">Contact&apos;s address</FieldLegend>
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="region">Region</FieldLabel>
                      <Input
                        id="region"
                        value={values.region}
                        onChange={(e) => update("region", e.target.value)}
                        placeholder="Enter region name"
                      />
                    </FieldContent>
                    <FieldContent>
                      <FieldLabel htmlFor="district">District</FieldLabel>
                      <Input
                        id="district"
                        value={values.district}
                        onChange={(e) => update("district", e.target.value)}
                        placeholder="Enter district name"
                      />
                    </FieldContent>
                  </Field>
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="ward">Ward</FieldLabel>
                      <Input
                        id="ward"
                        value={values.ward}
                        onChange={(e) => update("ward", e.target.value)}
                        placeholder="Enter ward name"
                      />
                    </FieldContent>
                    <FieldContent>
                      <FieldLabel htmlFor="street">Street</FieldLabel>
                      <Input
                        id="street"
                        value={values.street}
                        onChange={(e) => update("street", e.target.value)}
                        placeholder="Enter street name"
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </div>
          </StepperContent>

          <StepperContent value={3}>
            <div className="space-y-6">
              <FieldSet>
                <FieldLegend variant="label">Next of kin details</FieldLegend>
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="firstNOKName">NOK 1: Full name</FieldLabel>
                      <Input
                        id="firstNOKName"
                        value={values.firstNOKName}
                        onChange={(e) => update("firstNOKName", e.target.value)}
                        placeholder="Full name"
                      />
                    </FieldContent>
                    <FieldContent data-invalid={!!errors.firstNOKMobile}>
                      <FieldLabel htmlFor="firstNOKMobile">Mobile</FieldLabel>
                      <PhoneInput
                        id="firstNOKMobile"
                        value={values.firstNOKMobile}
                        onChange={(v) => update("firstNOKMobile", v ?? "")}
                        defaultCountry="TZ"
                        aria-invalid={!!errors.firstNOKMobile}
                      />
                      <FieldError errors={errors.firstNOKMobile ? [{ message: errors.firstNOKMobile }] : undefined} />
                    </FieldContent>
                    <FieldContent>
                      <FieldLabel htmlFor="firstNOKRelationship">Relationship</FieldLabel>
                      <Select
                        value={values.firstNOKRelationship}
                        onValueChange={(v) => update("firstNOKRelationship", v as Relationship)}
                      >
                        <SelectTrigger id="firstNOKRelationship" className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET}>Not specified</SelectItem>
                          {relationshipOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="secondNOKName">NOK 2: Full name</FieldLabel>
                      <Input
                        id="secondNOKName"
                        value={values.secondNOKName}
                        onChange={(e) => update("secondNOKName", e.target.value)}
                        placeholder="Full name"
                      />
                    </FieldContent>
                    <FieldContent data-invalid={!!errors.secondNOKMobile}>
                      <FieldLabel htmlFor="secondNOKMobile">Mobile</FieldLabel>
                      <PhoneInput
                        id="secondNOKMobile"
                        value={values.secondNOKMobile}
                        onChange={(v) => update("secondNOKMobile", v ?? "")}
                        defaultCountry="TZ"
                        aria-invalid={!!errors.secondNOKMobile}
                      />
                      <FieldError errors={errors.secondNOKMobile ? [{ message: errors.secondNOKMobile }] : undefined} />
                    </FieldContent>
                    <FieldContent>
                      <FieldLabel htmlFor="secondNOKRelationship">Relationship</FieldLabel>
                      <Select
                        value={values.secondNOKRelationship}
                        onValueChange={(v) => update("secondNOKRelationship", v as Relationship)}
                      >
                        <SelectTrigger id="secondNOKRelationship" className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET}>Not specified</SelectItem>
                          {relationshipOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="smsOptOut"
                      checked={values.smsOptOut}
                      onCheckedChange={(checked) => update("smsOptOut", checked === true)}
                    />
                    <FieldLabel htmlFor="smsOptOut" className="font-normal">
                      Opt out of marketing SMS
                    </FieldLabel>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={handleBack} disabled={currentStep === 1 || isSaving}>
          Back
        </Button>

        {isLastStep ? (
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : isEdit ? "Update contact" : "Save contact"}
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} disabled={isSaving}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
