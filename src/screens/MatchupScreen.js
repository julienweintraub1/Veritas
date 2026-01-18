import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DEF'];

export default function MatchupScreen({ route, navigation }) {
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [matchupId, setMatchupId] = useState(null);
    const [rosterSettings, setRosterSettings] = useState({
        "QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "SUPERFLEX": 0, "K": 1, "DEF": 1
    });

    useEffect(() => {
        if (friend) {
            fetchOrCreateMatchup();
        }
    }, [friend]);

    const fetchOrCreateMatchup = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Check for existing matchup
            // Check both directions: user1=me & user2=friend OR user1=friend & user2=me
            const { data: existing, error: fetchError } = await supabase
                .from('matchups')
                .select('*')
                .or(`and(user1_id.eq.${user.id},user2_id.eq.${friend.id}),and(user1_id.eq.${friend.id},user2_id.eq.${user.id})`)
                .single();

            if (existing) {
                setMatchupId(existing.id);
                setRosterSettings(existing.roster_settings);
                setLoading(false);
            } else {
                // 2. Create new matchup if none exists
                const { data: newMatchup, error: createError } = await supabase
                    .from('matchups')
                    .insert([{
                        user1_id: user.id,
                        user2_id: friend.id
                        // roster_settings uses default from DB
                    }])
                    .select()
                    .single();

                if (createError) throw createError;

                setMatchupId(newMatchup.id);
                setRosterSettings(newMatchup.roster_settings);
                setLoading(false);
            }
        } catch (error) {
            console.error('Error loading matchup:', error);
            Alert.alert('Error', 'Could not load matchup.');
            navigation.goBack();
        }
    };

    const updatePositionCount = async (position, increment) => {
        const currentCount = rosterSettings[position] || 0;
        const newCount = currentCount + increment;

        if (newCount < 0) return; // No negative slots

        const newSettings = { ...rosterSettings, [position]: newCount };

        // Optimistic update
        setRosterSettings(newSettings);

        // Sync to DB
        if (matchupId) {
            const { error } = await supabase
                .from('matchups')
                .update({ roster_settings: newSettings })
                .eq('id', matchupId);

            if (error) {
                Alert.alert('Error', 'Failed to save changes.');
                setRosterSettings(rosterSettings); // Revert
            }
        }
    };

    // --- Render Helpers ---

    const renderHeader = () => (
        <View style={styles.scoreboard}>
            <View style={styles.teamHeader}>
                <View style={styles.avatar} />
                <Text style={styles.teamName}>You</Text>
                <Text style={styles.totalScore}>0.00</Text>
            </View>
            <View style={styles.vsContainer}>
                <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={styles.teamHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.secondary }]} />
                <Text style={styles.teamName}>{friend?.username || 'Opponent'}</Text>
                <Text style={styles.totalScore}>0.00</Text>
            </View>
        </View>
    );

    const renderModifiers = () => (
        <View style={styles.modifiersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modifiersScroll}>
                {POSITIONS.map(pos => (
                    <View key={pos} style={styles.modifierCard}>
                        <Text style={styles.modifierTitle}>{pos}</Text>
                        <View style={styles.modifierControls}>
                            <TouchableOpacity onPress={() => updatePositionCount(pos, -1)} style={styles.modBtn}>
                                <Text style={styles.modBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.modifierCount}>{rosterSettings[pos] || 0}</Text>
                            <TouchableOpacity onPress={() => updatePositionCount(pos, 1)} style={styles.modBtn}>
                                <Text style={styles.modBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    );

    const renderRoster = () => {
        const slots = [];
        // Generate flat list of slots based on settings
        // Order matters: use POSITIONS array order
        POSITIONS.forEach(pos => {
            const count = rosterSettings[pos] || 0;
            for (let i = 0; i < count; i++) {
                slots.push({ position: pos, key: `${pos}-${i}` });
            }
        });

        if (slots.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No roster slots. Add some above!</Text>
                </View>
            );
        }

        return (
            <View style={styles.rosterContainer}>
                <View style={styles.tableHeader}>
                    <Text style={[styles.headerText, { flex: 1 }]}>Starters</Text>
                </View>
                {slots.map((slot) => (
                    <View key={slot.key} style={styles.rosterRow}>
                        <View style={styles.playerSlot}>
                            <Text style={styles.playerName}>Empty</Text>
                            <Text style={styles.playerScore}>-</Text>
                        </View>

                        <View style={styles.positionBadge}>
                            <Text style={styles.positionText}>{slot.position}</Text>
                        </View>

                        <View style={styles.playerSlot}>
                            <Text style={[styles.playerName, styles.alignRight]}>Empty</Text>
                            <Text style={[styles.playerScore, styles.alignRight]}>-</Text>
                        </View>
                    </View>
                ))}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderHeader()}
            {renderModifiers()}
            <ScrollView style={styles.scrollContent}>
                {renderRoster()}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        flex: 1,
    },
    // Scoreboard
    scoreboard: {
        flexDirection: 'row',
        backgroundColor: colors.primary,
        padding: spacing.l,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 20, // Extra padding for status bar area if needed
    },
    teamHeader: { alignItems: 'center', flex: 1 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 4 },
    teamName: { color: colors.white, fontWeight: 'bold', fontSize: 14, marginBottom: 2 },
    totalScore: { color: colors.white, fontSize: 20, fontWeight: 'bold' },
    vsText: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold', fontSize: 16 },

    // Modifiers
    modifiersContainer: {
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: spacing.s,
    },
    modifiersScroll: {
        paddingHorizontal: spacing.m,
        gap: spacing.s,
    },
    modifierCard: {
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        padding: 8,
        borderRadius: 8,
        minWidth: 70,
        borderWidth: 1,
        borderColor: '#E1E4E8',
    },
    modifierTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: 4,
    },
    modifierControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modBtn: {
        padding: 2,
    },
    modBtnText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.primary,
        width: 15, // Fixed width for alignment
        textAlign: 'center',
    },
    modifierCount: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.text,
        width: 10,
        textAlign: 'center',
    },

    // Roster
    rosterContainer: {
        backgroundColor: colors.card,
        margin: spacing.m,
        borderRadius: borderRadius.m,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tableHeader: {
        backgroundColor: '#F8F9FA',
        padding: spacing.s,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerText: {
        fontWeight: 'bold',
        color: colors.textSecondary,
        fontSize: 12,
        textTransform: 'uppercase',
    },
    rosterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: spacing.s,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    positionBadge: {
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F0F2F5',
        paddingVertical: 4,
        borderRadius: 4,
        marginHorizontal: spacing.s,
    },
    positionText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    playerSlot: { flex: 1 },
    playerName: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    playerScore: { fontSize: 11, color: colors.textSecondary },
    alignRight: { textAlign: 'right' },

    emptyState: { padding: 20, alignItems: 'center' },
    emptyStateText: { color: colors.textSecondary },
});
