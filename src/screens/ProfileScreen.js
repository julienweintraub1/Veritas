import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
                base64: true,
            });

            if (!result.canceled) {
                const asset = result.assets[0];
                // For web compatibility and simplicity, we can use the base64 data to upload
                // Or if we are on native, upload via FormData.
                // However, Supabase Storage upload from React Native often needs ArrayBuffer or Blob.
                // The most reliable way across platforms for small avatars is base64 decoder or fetch->blob.

                await uploadAvatar(asset);
            }
        } catch (error) {
            Alert.alert('Error picking image', error.message);
        }
    };

    const uploadAvatar = async (asset) => {
        try {
            setSaving(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user logged in!');

            const ext = asset.uri.split('.').pop().toLowerCase();
            const fileName = `${user.id}-${Date.now()}.${ext}`;
            const filePath = `${fileName}`;

            // Fetch the file from local URI to get a Blob for upload
            const response = await fetch(asset.uri);
            const blob = await response.blob();

            // Setup storage bucket 'avatars' manually in Supabase dashboard if doesn't exist? 
            // We assume it exists based on our SQL script.

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, blob, {
                    contentType: asset.mimeType || 'image/jpeg',
                    upsert: true,
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            setAvatarUrl(data.publicUrl);
            Alert.alert('Success', 'Image uploaded! Remember to click "Save Profile" to persist changes.');

        } catch (error) {
            console.error(error);
            Alert.alert('Upload Failed', error.message);
        } finally {
            setSaving(false);
        }
    };

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

                <Text style={styles.label}>Profile Picture</Text>
                <View style={styles.avatarContainer}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            <Text style={styles.avatarPlaceholderText}>?</Text>
                        </View>
                    )}
                    <AppButton
                        title="Choose Photo"
                        onPress={pickImage}
                        outline
                        style={styles.pickButton}
                        textStyle={{ fontSize: 14 }}
                    />
                </View>

                <AppButton
                    title={saving ? "Saving..." : "Save Profile"}
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
    avatarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.m,
        marginBottom: spacing.m,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.card,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.border,
        borderColor: colors.textSecondary,
    },
    avatarPlaceholderText: {
        fontSize: 32,
        color: colors.textSecondary,
        fontWeight: 'bold',
    },
    pickButton: {
        height: 40,
        paddingVertical: 0,
        paddingHorizontal: spacing.m,
    },
});
