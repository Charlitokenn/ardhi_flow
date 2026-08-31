import {ClerkProvider, Show, useUser} from '@clerk/expo';
import {tokenCache} from '@clerk/expo/token-cache'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query';
import {StatusBar} from 'expo-status-bar';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useApiClient} from './src/lib/api-client';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
if (!publishableKey) {
    throw new Error('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file');
}

const queryClient = new QueryClient();

function SignedInHome() {
    const {user} = useUser();
    const api = useApiClient();

    // Sanity-check the wiring: calls the same /api/health route the web
    // app already hits. Swap for a real screen once this round-trips.
    const health = useQuery({
        queryKey: ['health'],
        queryFn: async () => {
            const res = await api.api.health.$get();
            return res.json();
        },
    });

    return (
        <View style={styles.container}>
            <Text>Welcome, {user?.firstName ?? 'there'}</Text>
            {health.isLoading && <ActivityIndicator/>}
            {health.data && <Text>API says: {JSON.stringify(health.data)}</Text>}
        </View>
    );
}

function SignedOutScreen() {
    // TODO: real sign-in screen (Clerk's Expo quickstart covers
    // <AuthView /> or a custom useSignIn() flow).
    return (
        <View style={styles.container}>
            <Text>Please sign in.</Text>
        </View>
    );
}

export default function App() {
    return (
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
            <QueryClientProvider client={queryClient}>
                <Show when="signed-in">
                    <SignedInHome/>
                </Show>
                <Show when="signed-out">
                    <SignedOutScreen/>
                </Show>
                <StatusBar style="auto"/>
            </QueryClientProvider>
        </ClerkProvider>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'},
});