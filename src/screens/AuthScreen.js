import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { supabase } from '../services/supabase';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);

    async function signInWithEmail() {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) Alert.alert('Error', error.message);
        setLoading(false);
    }

    async function signUpWithEmail() {
        if (!username.trim()) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }
        setLoading(true);

        // 1. Sign up auth user
        const { data: { session, user }, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert('Error', error.message);
            setLoading(false);
            return;
        }

        // 2. Check if email verification is enabled (Session will be null)
        if (!session && user) {
            Alert.alert(
                'Check your email',
                'Registration successful! Please check your email to verify your account, OR go to Supabase > Authentication > Providers > Email and disable "Confirm email" for testing.'
            );
            setLoading(false);
            return;
        }

        // 3. Create public profile (User is logged in now)
        if (user && session) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    { id: user.id, username: username, avatar_url: '' }
                ]);

            if (profileError) {
                console.error('Profile creation error:', profileError);
                Alert.alert('Error creating profile', profileError.message);
            }
        }

        setLoading(false);
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Veritas Football</Text>
            <Text style={styles.subtitle}>{isLogin ? 'Sign In' : 'Create Account'}</Text>

            <View style={styles.inputContainer}>
                {!isLogin && (
                    <TextInput
                        style={styles.input}
                        placeholder="Username"
                        placeholderTextColor={colors.textSecondary}
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                    />
                )}
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                    autoCapitalize="none"
                />
            </View>

            <View style={styles.buttonContainer}>
                <AppButton
                    title={loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Sign Up')}
                    onPress={isLogin ? signInWithEmail : signUpWithEmail}
                    disabled={loading}
                />

                <AppButton
                    title={isLogin ? 'Create an account' : 'Already have an account?'}
                    onPress={() => setIsLogin(!isLogin)}
                    outline
                    style={{ marginTop: spacing.m }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: spacing.l,
        backgroundColor: colors.background,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.primary,
        textAlign: 'center',
        marginBottom: spacing.s,
    },
    subtitle: {
        fontSize: 20,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    inputContainer: {
        marginBottom: spacing.l,
    },
    input: {
        backgroundColor: colors.card,
        padding: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.m,
        fontSize: 16,
    },
    buttonContainer: {
        marginTop: spacing.s,
    },
});
