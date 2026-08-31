import {useMemo} from 'react'
import {useAuth} from '@clerk/expo'
import {createApiClient} from '@ardhiflow/api-client'
// Type-only import — erased at compile time, matches the pattern in
// apps/web/src/client/lib/api.ts. Unlike web, mobile has no same-origin
// to piggyback on, so the base URL must be explicit per environment.
import type {AppType} from '@ardhiflow/web/worker'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — add it to .env')
}

export function useApiClient() {
    const {getToken} = useAuth()
    return useMemo(
        () => createApiClient<AppType>(API_BASE_URL, () => getToken()),
        [getToken]
    )
}