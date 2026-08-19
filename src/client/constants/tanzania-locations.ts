import {useQuery, type UseQueryResult} from "@tanstack/react-query"

// Served as a static asset URL (not bundled into JS) — the source file is
// ~4.5MB, so importing it directly (`import data from "./x.json"`) would
// inline the whole object literal into every chunk that touches this
// module. Fetching it as JSON lets the browser parse it with the native
// (much faster) JSON parser and cache it independently of the JS bundle.
import tanzaniaLocationsUrl from "./tanzania_postcodes.json?url"

// ============================================================================
// Types — mirror the exact shape of constants/tanzania_postcodes.json:
// Region -> District -> Ward -> { postcode, villages }.
// "villages" is this dataset's name for what ArdhiFlow calls "street".
// ============================================================================

export interface TanzaniaVillage {
    readonly name: string
}

export interface TanzaniaWard {
    readonly postcode: string
    readonly villages: readonly TanzaniaVillage[]
}

/** Ward name -> ward info */
export type TanzaniaWardMap = Readonly<Record<string, TanzaniaWard>>
/** District name -> wards */
export type TanzaniaDistrictMap = Readonly<Record<string, TanzaniaWardMap>>
/** Region name -> districts. This is the shape of the whole JSON file. */
export type TanzaniaLocationsData = Readonly<Record<string, TanzaniaDistrictMap>>

// ============================================================================
// Loading — fetched once per page load and cached forever (the dataset is a
// static build artifact, it never changes at runtime).
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Narrows `unknown` JSON to `TanzaniaLocationsData`. This is a shallow
 * structural check, not a full deep validation of all ~68k leaf records —
 * the file is a build-time asset we own, not user input, so the goal is
 * only to fail fast if the fetch returned something unexpected (e.g. an
 * HTML error page from a misconfigured route), not to police every record.
 */
function assertIsTanzaniaLocationsData(value: unknown): asserts value is TanzaniaLocationsData {
    if (!isPlainObject(value)) {
        throw new Error("Tanzania locations data must be a JSON object keyed by region name")
    }
    const [firstRegion] = Object.values(value)
    if (firstRegion !== undefined && !isPlainObject(firstRegion)) {
        throw new Error("Tanzania locations data is malformed: expected region -> district -> ward map")
    }
}

let cachedLocationsPromise: Promise<TanzaniaLocationsData> | null = null

/**
 * Fetches and parses the Tanzania locations dataset. Safe to call from
 * multiple places — the in-flight/resolved promise is cached at module
 * scope so the ~4.5MB file is only ever fetched once per page load.
 */
export function loadTanzaniaLocations(): Promise<TanzaniaLocationsData> {
    if (!cachedLocationsPromise) {
        cachedLocationsPromise = fetch(tanzaniaLocationsUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load Tanzania locations data (HTTP ${response.status})`)
                }
                return response.json() as Promise<unknown>
            })
            .then((data) => {
                assertIsTanzaniaLocationsData(data)
                return data
            })
            .catch((error: unknown) => {
                // Don't cache a rejected promise — a transient network failure
                // shouldn't permanently break the picker for the rest of the tab.
                cachedLocationsPromise = null
                throw error instanceof Error ? error : new Error("Failed to load Tanzania locations data")
            })
    }
    return cachedLocationsPromise
}

export const TANZANIA_LOCATIONS_QUERY_KEY = ["tanzania-locations"] as const

/**
 * TanStack Query wrapper around {@link loadTanzaniaLocations}. Any number of
 * `LocationFields` instances on the page share one cached fetch.
 */
export function useTanzaniaLocations(): UseQueryResult<TanzaniaLocationsData, Error> {
    return useQuery({
        queryKey: TANZANIA_LOCATIONS_QUERY_KEY,
        queryFn: loadTanzaniaLocations,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        retry: 1,
    })
}

// ============================================================================
// Selectors — pure functions over already-loaded data. Region/district/ward
// keys are resolved case-insensitively so values saved before this picker
// existed (free-typed, inconsistent casing) still cascade correctly in edit
// forms instead of silently looking "unset".
// ============================================================================

function resolveKey(map: Readonly<Record<string, unknown>> | undefined, raw: string): string | undefined {
    if (!map || !raw) return undefined
    if (raw in map) return raw
    const target = raw.trim().toLowerCase()
    return Object.keys(map).find((key) => key.trim().toLowerCase() === target)
}

function sortedKeys(map: Readonly<Record<string, unknown>>): string[] {
    return Object.keys(map).sort((a, b) => a.localeCompare(b))
}

export function getRegionNames(data: TanzaniaLocationsData): string[] {
    return sortedKeys(data)
}

export function getDistrictNames(data: TanzaniaLocationsData, region: string): string[] {
    const regionKey = resolveKey(data, region)
    if (!regionKey) return []
    return sortedKeys(data[regionKey])
}

export function getWardNames(data: TanzaniaLocationsData, region: string, district: string): string[] {
    const regionKey = resolveKey(data, region)
    if (!regionKey) return []
    const districtKey = resolveKey(data[regionKey], district)
    if (!districtKey) return []
    return sortedKeys(data[regionKey][districtKey])
}

/** "villages" in the source dataset — displayed to users as "street". */
export function getStreetNames(data: TanzaniaLocationsData, region: string, district: string, ward: string): string[] {
    const regionKey = resolveKey(data, region)
    if (!regionKey) return []
    const districtKey = resolveKey(data[regionKey], district)
    if (!districtKey) return []
    const wardKey = resolveKey(data[regionKey][districtKey], ward)
    if (!wardKey) return []
    return data[regionKey][districtKey][wardKey].villages
        .map((village) => village.name)
        .sort((a, b) => a.localeCompare(b))
}

/** Bonus lookup: the postal code tied to a resolved ward, if callers want it. */
export function getWardPostcode(
    data: TanzaniaLocationsData,
    region: string,
    district: string,
    ward: string
): string | undefined {
    const regionKey = resolveKey(data, region)
    if (!regionKey) return undefined
    const districtKey = resolveKey(data[regionKey], district)
    if (!districtKey) return undefined
    const wardKey = resolveKey(data[regionKey][districtKey], ward)
    if (!wardKey) return undefined
    return data[regionKey][districtKey][wardKey].postcode
}