import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import { supabase } from '../services/supabase';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

/**
 * FriendsScreen
 * 
 * Allows users to view their friends list and add new friends via Supabase.
 */
export default function FriendsScreen({ navigation }) {
    const [friends, setFriends] = useState([]);
    const [newFriend, setNewFriend] = useState('');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchFriends();
    }, []);

    /**
     * Fetches the list of accepted friends.
     * Uses the 'my_friends' view we created in SQL.
     */
    const fetchFriends = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // First get the friend IDs from the view
            const { data: friendRelations, error } = await supabase
                .from('friend_requests')  // Using direct table query for reliability if view is acting up
                .select(`
                    id,
                    sender_id,
                    receiver_id,
                    status
                `)
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .eq('status', 'accepted');

            if (error) throw error;

            // Resolve the "other" person's ID
            const friendIds = friendRelations.map(rel =>
                rel.sender_id === user.id ? rel.receiver_id : rel.sender_id
            );

            if (friendIds.length === 0) {
                setFriends([]);
                return;
            }

            // Fetch profile details for those IDs
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .in('id', friendIds);

            if (profileError) throw profileError;

            setFriends(profiles || []);
        } catch (error) {
            console.error('Error fetching friends:', error.message);
        }
    };

    /**
     * Handles adding a new friend by username.
     * 1. Looks up the username in 'profiles'.
     * 2. If found, sends a friend request.
     */
    const addFriend = async () => {
        if (!newFriend.trim()) return;
        setLoading(true);

        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();

            // 1. Find user by username
            const { data: foundUser, error: searchError } = await supabase
                .from('profiles')
                .select('id, username')
                .eq('username', newFriend.trim())
                .maybeSingle(); // Use maybeSingle instead of single to avoid error when no user found

            if (searchError) {
                console.error('Search error:', searchError);
                Alert.alert('Error', `Database error: ${searchError.message}`);
                setLoading(false);
                return;
            }

            if (!foundUser) {
                Alert.alert('Error', 'User not found. Check the username.');
                setLoading(false);
                return;
            }

            if (foundUser.id === currentUser.id) {
                Alert.alert('Error', "You can't add yourself!");
                setLoading(false);
                return;
            }

            // 2. Check if request already exists
            const { data: existing } = await supabase
                .from('friend_requests')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${foundUser.id}),and(sender_id.eq.${foundUser.id},receiver_id.eq.${currentUser.id})`);

            if (existing && existing.length > 0) {
                Alert.alert('Info', `Friendship status is already: ${existing[0].status}`);
                setLoading(false);
                return;
            }

            // 3. Send Request
            const { error: insertError } = await supabase
                .from('friend_requests')
                .insert([
                    { sender_id: currentUser.id, receiver_id: foundUser.id, status: 'accepted' } // Auto-accepting for easier testing as requested
                ]);

            if (insertError) {
                Alert.alert('Error', insertError.message);
            } else {
                Alert.alert('Success', `Added ${foundUser.username}!`);
                setNewFriend('');
                fetchFriends(); // Refresh list
            }

        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await fetchFriends();
        setRefreshing(false);
    }, []);

    return (
        <View style={styles.container}>
            {/* Add Friend Section */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Find friend by username..."
                    placeholderTextColor={colors.textSecondary}
                    value={newFriend}
                    onChangeText={setNewFriend}
                    autoCapitalize="none"
                />
                <View style={styles.addButtonWrapper}>
                    <AppButton
                        title={loading ? "..." : "Add"}
                        onPress={addFriend}
                        disabled={loading}
                    />
                </View>
            </View>

            {/* Friends List Section */}
            <Text style={styles.sectionTitle}>Friends</Text>
            <FlatList
                data={friends}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                renderItem={({ item }) => (
                    <View style={styles.friendItem}>
                        <View style={styles.friendInfo}>
                            <View style={styles.avatarPlaceholder} />
                            <Text style={styles.friendName}>{item.username}</Text>
                        </View>
                        <AppButton
                            title="Matchup"
                            onPress={() => navigation.navigate('Matchup', { friend: item })}
                            style={styles.matchupButton}
                            outline
                        />
                    </View>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No friends yet. Find one by username above!</Text>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // ... (styles unchanged for the most part, but including them to satisfy tool)
    container: {
        flex: 1,
        padding: spacing.m,
        backgroundColor: colors.background,
    },
    inputContainer: {
        flexDirection: 'row',
        marginBottom: spacing.l,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 50,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.m,
        borderRadius: borderRadius.m,
        backgroundColor: colors.card,
        marginRight: spacing.s,
    },
    addButtonWrapper: {
        width: 80,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: spacing.m,
    },
    listContent: {
        paddingBottom: spacing.l,
    },
    friendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.m,
        backgroundColor: colors.card,
        borderRadius: borderRadius.m,
        marginBottom: spacing.s,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    friendInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.secondary,
        marginRight: spacing.m,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
    },
    matchupButton: {
        width: 'auto',
        paddingVertical: 6,
        paddingHorizontal: spacing.m,
    },
    emptyText: {
        textAlign: 'center',
        color: colors.textSecondary,
        marginTop: spacing.xl,
    }
});
