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
                <Text style={styles.subtitle}>
                    Veritas football uses your rankings to create perfect rosters. Find and challenge friends in Arena. Customize rankings to give your team an edge.
                </Text>

                <View style={styles.buttonContainer}>
                    <AppButton
                        title="Arena"
                        onPress={() => navigation.navigate('Friends')}
                        style={styles.button}
                    />
                    <AppButton
                        title="Rankings"
                        onPress={() => navigation.navigate('Rankings')}
                        outline
                        style={styles.button}
                    />
                    <AppButton
                        title="My Profile"
                        onPress={() => navigation.navigate('Profile')}
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
    },
    infoBox: {
        backgroundColor: colors.card,
        padding: spacing.m,
        borderRadius: 8,
        width: '100%',
        alignItems: 'center',
    },
    infoText: {
        color: colors.textSecondary,
        fontSize: 14,
        marginBottom: 4,
        textAlign: 'center',
    },
});
