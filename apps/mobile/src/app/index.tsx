import {useAuth} from '@clerk/expo'
import {useHostedAuth} from '@clerk/expo/hosted-auth'
import {ActivityIndicator, Button, StyleSheet, Text, View} from 'react-native'

export default function MainScreen() {
    const {isLoaded, isSignedIn} = useAuth()
    const {startHostedAuth} = useHostedAuth()

    const handleSignUp = async () => {
        try {
            await startHostedAuth({mode: 'sign-up'})
        } catch (error) {
            // Handle the error in your app.
        }
    }

    if (!isLoaded) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large"/>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            {isSignedIn ? (
                <Text>You're signed in</Text>
            ) : (
                <Button title="Sign up" onPress={handleSignUp}/>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
})