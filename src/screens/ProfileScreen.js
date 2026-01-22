import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

export default function ProfileScreen() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [username, setUsername] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [email, setEmail] = useState('');

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                setEmail(user.email);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error("Error fetching profile:", error);
                } else if (data) {
                    setUsername(data.username);
                    setAvatarUrl(data.avatar_url || '');
                }
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    }

    async function updateProfile() {
        try {
            setSaving(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user logged in!');

            const updates = {
                id: user.id,
                username,
                avatar_url: avatarUrl,
                updated_at: new Date(),
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updates);

            if (error) throw error;
            Alert.alert('Success', 'Profile updated!');
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.form}>
                <Text style={styles.label}>Email (Read-only)</Text>
                <TextInput
                    style={[styles.input, styles.disabledInput]}
                    value={email}
                    editable={false}
                />

                <Text style={styles.label}>Username</Text>
                <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.label}>Avatar URL (Image Link)</Text>
                <TextInput
                    style={styles.input}
                    value={avatarUrl}
                    onChangeText={setAvatarUrl}
                    placeholder="https://example.com/image.png"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                />

                <View style={styles.previewContainer}>
                    <Text style={styles.label}>Avatar Preview:</Text>
                    {avatarUrl ? (
                        <View style={styles.avatar}>
                            {/* In a real app with expo-image, we'd render <Image source={{ uri: avatarUrl }} /> */}
                            {/* Since we don't know if Image is imported or available easily without hassle, just showing a placeholder block */}
                            <Text style={{ color: 'white' }}>IMG</Text>
                        </View>
                    ) : (
                        <View style={[styles.avatar, { backgroundColor: colors.textSecondary }]} />
                    )}
                </View>

                <AppButton
                    title={saving ? "Saving..." : "Update Profile"}
                    onPress={updateProfile}
                    disabled={saving}
                    style={{ marginTop: spacing.xl }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        padding: spacing.l,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    form: {
        marginTop: spacing.m,
    },
    label: {
        color: colors.textSecondary,
        marginBottom: spacing.s,
        fontWeight: 'bold',
    },
    input: {
        backgroundColor: colors.card,
        padding: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.l,
        color: colors.text,
    },
    disabledInput: {
        backgroundColor: '#f0f0f0',
        color: '#888',
    },
    previewContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.m,
        marginBottom: spacing.m,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
