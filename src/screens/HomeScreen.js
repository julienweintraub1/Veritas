import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../services/supabase';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';
import { spacing } from '../theme/layout';

/**
 * HomeScreen
 * 
 * The main landing page of the application.
 * Currently serves as a navigation hub to accessing Friends and Matchups.
 */
export default function HomeScreen({ navigation }) {

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Welcome to Veritas Football!</Text>
                <Text style={styles.subtitle}>Manage your league, challenge friends, and track your stats.</Text>

                <View style={styles.buttonContainer}>
                    <AppButton
                        title="Go to Friends"
                        onPress={() => navigation.navigate('Friends')}
                        style={styles.button}
                    />
                    <AppButton
                        title="My Rankings"
                        onPress={() => navigation.navigate('Rankings')}
                        outline
                        style={styles.button}
                    />
                </View>

                <View style={styles.footer}>
                    <AppButton
                        title="Sign Out"
                        onPress={handleSignOut}
                        style={{ backgroundColor: colors.destructive, marginTop: spacing.xl }}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.l,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: spacing.s,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: spacing.xl,
        textAlign: 'center',
    },
    buttonContainer: {
        width: '100%',
        gap: spacing.m, // Uses Flexbox gap for spacing between buttons
    },
    button: {
        marginBottom: spacing.s,
    }
});
