import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity } from 'react-native';
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
        if (!email.includes('@')) {
            Alert.alert('Validation Error', 'Please sign in with your Email Address.');
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            Alert.alert('Sign In Failed', error.message);
        }
        setLoading(false);
    }

    async function signUpWithEmail() {
        if (!username.trim()) {
            Alert.alert('Validation Error', 'Please enter a username');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Validation Error', 'Password must be at least 6 characters long.');
            return;
        }

        setLoading(true);

        // 1. Sign up auth user
        const { data: { session, user }, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert('Sign Up Error', error.message);
            setLoading(false);
            return;
        }

        // 2. Check if email verification is enabled
        if (!session && user) {
            Alert.alert(
                'Check your email',
                'Registration successful! Please check your email to verify your account.'
            );
            setLoading(false);
            return;
        }

        // 3. Create public profile
        if (user && session) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    { id: user.id, username: username, avatar_url: '' }
                ]);

            if (profileError) {
                console.error('Profile creation error:', profileError);
                Alert.alert('Profile Error', 'Account created but profile setup failed: ' + profileError.message);
            }
        }

        setLoading(false);
    }

    async function forgotPassword() {
        if (!email.trim() || !email.includes('@')) {
            Alert.alert('Input Required', 'Please enter your email address to reset your password.');
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://veritas-football.vercel.app/reset-password', // Placeholder URL
        });
        setLoading(false);

        if (error) {
            Alert.alert('Error', error.message);
        } else {
            Alert.alert('Check Email', 'If an account exists for this email, you will receive a password reset link.');
        }
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
                    placeholder="Email Address"
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password (min 6 chars)"
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

                {isLogin && (
                    <TouchableOpacity onPress={forgotPassword} style={styles.forgotButton}>
                        <Text style={styles.forgotText}>Forgot Password?</Text>
                    </TouchableOpacity>
                )}
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
    forgotButton: {
        marginTop: spacing.m,
        alignSelf: 'center',
        padding: spacing.s,
    },
    forgotText: {
        color: colors.textSecondary,
        textDecorationLine: 'underline',
    },
});
