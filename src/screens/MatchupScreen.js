import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase, getUserRecord } from '../services/supabase';
import { distributeMatchupLineups } from '../services/distribution';
import { refreshLiveScores, getCurrentWeekGames, shouldPollScores, fetchNFLState, areAllGamesFinal } from '../services/liveScoring';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DEF'];
const DEFAULT_SETTINGS = { "QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "SUPERFLEX": 0, "K": 1, "DEF": 1 };

export default function MatchupScreen({ route, navigation }) {
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [matchupId, setMatchupId] = useState(null);

    // Identity
    const [currentUserId, setCurrentUserId] = useState(null);
    const [opponentId, setOpponentId] = useState(null);
    const [amIUser1, setAmIUser1] = useState(false);

    // State
    const [scoringType, setScoringType] = useState('STD'); // STD, PPR, HALF
    const [status, setStatus] = useState('pending');
    const [user1Confirmed, setUser1Confirmed] = useState(false);
    const [user2Confirmed, setUser2Confirmed] = useState(false);
    const [recordA, setRecordA] = useState({ wins: 0, losses: 0, ties: 0 });
    const [recordB, setRecordB] = useState({ wins: 0, losses: 0, ties: 0 });

    // Settings
    const [mySettings, setMySettings] = useState({ ...DEFAULT_SETTINGS });
    const [opponentSettings, setOpponentSettings] = useState({ ...DEFAULT_SETTINGS });

    // Distribution Results
    const [lineupA, setLineupA] = useState([]);
    const [lineupB, setLineupB] = useState([]);
    const [totalA, setTotalA] = useState(0);
    const [totalB, setTotalB] = useState(0);
    const [distributing, setDistributing] = useState(false);

    useEffect(() => {
        if (friend) {
            fetchOrCreateMatchup();
        }
    }, [friend, scoringType]);

    // Calculate effective settings (Negotiation: LOWER quantity wins)
    const getEffectiveSettings = useCallback(() => {
        const effective = {};
        POSITIONS.forEach(pos => {
            const myCount = mySettings[pos] ?? 0;
            const oppCount = opponentSettings[pos] ?? 0;
            effective[pos] = Math.min(myCount, oppCount);
        });
        return effective;
    }, [mySettings, opponentSettings]);

    // Auto-distribute when effective settings or identity changes
    useEffect(() => {
        if (currentUserId && opponentId && !loading) {
            distributeLineups();
        }
    }, [currentUserId, opponentId, mySettings, opponentSettings, scoringType, loading]);

    // Live scoring polling & Auto-Finalize
    useEffect(() => {
        let pollInterval;

        const checkAndRefreshScores = async () => {
            try {
                const state = await fetchNFLState();
                const games = await getCurrentWeekGames(state.week);

                // Auto-Finalize Check
                if (areAllGamesFinal(games)) {
                    await finalizeMatchup();
                    return; // Stop polling
                }

                // Polling
                if (shouldPollScores(games)) {
                    const result = await refreshLiveScores();
                    if (result.success && currentUserId && opponentId) {
                        await distributeLineups();
                    }
                }
            } catch (error) {
                console.error('Live score polling error:', error);
            }
        };

        const startPolling = async () => {
            await checkAndRefreshScores();
            pollInterval = setInterval(async () => {
                await checkAndRefreshScores();
            }, 60000);
        };

        if (!loading && status === 'active') {
            startPolling();
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [loading, currentUserId, opponentId, status]);

    const fetchOrCreateMatchup = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Check for existing matchup SPECIFIC to this scoringType
            const { data: existing, error: fetchError } = await supabase
                .from('matchups')
                .select('*')
                .eq('scoring_type', scoringType)
                .or(`and(user1_id.eq.${user.id},user2_id.eq.${friend.id}),and(user1_id.eq.${friend.id},user2_id.eq.${user.id})`)
                .maybeSingle();

            let matchup;
            let isUser1 = false;

            if (existing) {
                matchup = existing;
            } else {
                // 2. Create new matchup if none exists for this format
                const { data: newMatchup, error: createError } = await supabase
                    .from('matchups')
                    .insert([{
                        user1_id: user.id,
                        user2_id: friend.id,
                        scoring_type: scoringType,
                        roster_settings: DEFAULT_SETTINGS,
                        user1_settings: DEFAULT_SETTINGS,
                        user2_settings: DEFAULT_SETTINGS,
                        status: 'pending'
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                matchup = newMatchup;
            }

            // Set Identity & State
            setMatchupId(matchup.id);
            setCurrentUserId(user.id);
            setOpponentId(friend.id);

            isUser1 = (user.id === matchup.user1_id);
            setAmIUser1(isUser1);

            // Load Settings (Handle nulls by falling back to defaults)
            const u1Settings = matchup.user1_settings || DEFAULT_SETTINGS;
            const u2Settings = matchup.user2_settings || DEFAULT_SETTINGS;

            setMySettings(isUser1 ? u1Settings : u2Settings);
            setOpponentSettings(isUser1 ? u2Settings : u1Settings);

            setStatus(matchup.status || 'pending');
            setUser1Confirmed(matchup.user1_confirmed);
            setUser2Confirmed(matchup.user2_confirmed);

            // Fetch Records
            const recA = await getUserRecord(user.id);
            const recB = await getUserRecord(friend.id);
            setRecordA(recA);
            setRecordB(recB);

        } catch (error) {
            console.error('Error loading matchup:', error);
            Alert.alert('Error', 'Could not load matchup.');
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const updatePositionCount = async (position, increment) => {
        const currentCount = mySettings[position] || 0;
        const newCount = currentCount + increment;
        if (newCount < 0) return;

        const newSettings = { ...mySettings, [position]: newCount };
        setMySettings(newSettings);

        // Optimistic update of DB + REST CONFIRMATION if editing
        if (matchupId) {
            const updatePayload = amIUser1
                ? { user1_settings: newSettings, user1_confirmed: false }
                : { user2_settings: newSettings, user2_confirmed: false };

            // If active, maybe change status back to pending?
            if (status === 'active') {
                updatePayload.status = 'pending';
                // Also unconfirm opponent? Usually yes, if terms change, contract is void.
                // But for simplicity, let's just unconfirm ME, and since I am not confirmed, status becomes pending.
                // NOTE: logic block below handles status calc.
            }

            const { error } = await supabase
                .from('matchups')
                .update(updatePayload)
                .eq('id', matchupId);

            if (error) {
                console.error("Update failed", error);
                setMySettings(mySettings); // Revert
            } else {
                // Determine ephemeral status
                setStatus('pending');
                amIUser1 ? setUser1Confirmed(false) : setUser2Confirmed(false);
            }
        }
    };

    const confirmMatchup = async () => {
        if (!matchupId) return;

        try {
            // I am confirming.
            const updates = amIUser1
                ? { user1_confirmed: true }
                : { user2_confirmed: true };

            // Check if opponent is ALREADY confirmed?
            const opponentConfirmed = amIUser1 ? user2Confirmed : user1Confirmed;

            if (opponentConfirmed) {
                updates.status = 'active';
            }

            const { error } = await supabase
                .from('matchups')
                .update(updates)
                .eq('id', matchupId);

            if (error) throw error;

            // Update local state
            amIUser1 ? setUser1Confirmed(true) : setUser2Confirmed(true);
            if (opponentConfirmed) setStatus('active');

        } catch (error) {
            Alert.alert('Error', 'Failed to confirm matchup');
        }
    };

    const finalizeMatchup = async () => {
        if (!matchupId || status !== 'active') return;

        try {
            // Determine winner
            let winnerId = null;
            if (totalA > totalB) winnerId = currentUserId; // currentUserId matches user1_id or user2_id? No, strictly current user. 
            // Wait, I need to know which score corresponds to which ID? 
            // totalA is MY score. totalB is OPPONENT score.
            else if (totalB > totalA) winnerId = opponentId;

            // Map score to correct columns
            // amIUser1 is true if currentUserId == user1_id
            const u1Score = amIUser1 ? totalA : totalB;
            const u2Score = amIUser1 ? totalB : totalA;

            const { error } = await supabase
                .from('matchups')
                .update({
                    status: 'final',
                    winner_id: winnerId,
                    user1_score: u1Score,
                    user2_score: u2Score
                })
                .eq('id', matchupId);

            if (error) throw error;

            setStatus('final');
            Alert.alert('Game Final', 'Records have been updated!');

            // Refresh records
            const recA = await getUserRecord(currentUserId);
            const recB = await getUserRecord(opponentId);
            setRecordA(recA);
            setRecordB(recB);

        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to finalize matchup');
        }
    };

    const distributeLineups = async () => {
        if (!currentUserId || !opponentId) return;

        setDistributing(true);
        try {
            // Use EFFECTIVE settings (Min of both)
            const effectiveSettings = getEffectiveSettings();

            const result = await distributeMatchupLineups(
                currentUserId,
                opponentId,
                effectiveSettings,
                scoringType
            );

            if (result.success) {
                setLineupA(result.lineupA);
                setLineupB(result.lineupB);
                setTotalA(result.totalA);
                setTotalB(result.totalB);
            }
        } catch (error) {
            console.error('Distribution error:', error);
        } finally {
            setDistributing(false);
        }
    };

    // --- Render Helpers ---

    const renderStatusBanner = () => {
        if (status === 'active') {
            return (
                <View style={[styles.statusBanner, styles.statusActive]}>
                    <Text style={styles.statusText}>● MATCHUP LIVE</Text>
                </View>
            );
        }

        // Pending State
        const iConfirmed = amIUser1 ? user1Confirmed : user2Confirmed;
        const oppConfirmed = amIUser1 ? user2Confirmed : user1Confirmed;

        if (iConfirmed && !oppConfirmed) {
            return (
                <View style={[styles.statusBanner, styles.statusWaiting]}>
                    <Text style={[styles.statusText, styles.textDark]}>Waiting for opponent to confirm...</Text>
                </View>
            );
        }

        // I haven't confirmed, or nobody has
        return (
            <View style={styles.statusBannerContainer}>
                <View style={[styles.statusBanner, styles.statusPending]}>
                    <Text style={[styles.statusText, styles.textDark]}>Matchup Pending - Adjust Roster & Confirm</Text>
                </View>
                <AppButton
                    title="Confirm Settings"
                    onPress={confirmMatchup}
                    style={styles.confirmButton}
                    size="small"
                />
            </View>
        );
    };

    const renderModifiers = () => (
        <View style={styles.modifiersContainer}>
            <Text style={styles.sectionLabel}>Your Roster Settings</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modifiersScroll}>
                {POSITIONS.map(pos => {
                    const myVal = mySettings[pos] || 0;
                    const oppVal = opponentSettings[pos] || 0;
                    const effective = Math.min(myVal, oppVal);
                    // Warn if my value is higher than effective (means opponent is capping it)
                    const isCapped = myVal > oppVal;

                    return (
                        <View key={pos} style={[styles.modifierCard, isCapped && styles.modifierCardCapped]}>
                            <Text style={styles.modifierTitle}>{pos}</Text>
                            <View style={styles.modifierControls}>
                                <TouchableOpacity onPress={() => updatePositionCount(pos, -1)} style={styles.modBtn}>
                                    <Text style={styles.modBtnText}>-</Text>
                                </TouchableOpacity>
                                <Text style={styles.modifierCount}>{myVal}</Text>
                                <TouchableOpacity onPress={() => updatePositionCount(pos, 1)} style={styles.modBtn}>
                                    <Text style={styles.modBtnText}>+</Text>
                                </TouchableOpacity>
                            </View>
                            {isCapped && <Text style={styles.cappedText}>(Limit: {oppVal})</Text>}
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );

    const renderRoster = () => {
        if (status !== 'active') {
            // Review/Preview Mode
            // Could show a placeholder or "Preview"
            // Requirement: "default as no contest" -> maybe just show empty?
            // "This 'confirms' both users want to participate"
            // I'll show the preview but with opacity or overlay
        }

        const effectiveSettings = getEffectiveSettings();
        const slots = [];
        POSITIONS.forEach(pos => {
            const count = effectiveSettings[pos] || 0;
            for (let i = 0; i < count; i++) {
                slots.push({ position: pos, key: `${pos}-${i}` });
            }
        });

        if (slots.length === 0) {
            return <View style={styles.emptyState}><Text style={styles.emptyStateText}>No active slots.</Text></View>;
        }

        return (
            <View style={[styles.rosterContainer, status !== 'active' && { opacity: 0.7 }]}>
                <View style={styles.tableHeader}>
                    <Text style={styles.headerText}>
                        {status === 'active' ? 'Starters' : 'Preview (Pending Confirmation)'}
                    </Text>
                </View>
                {slots.map((slot, index) => {
                    const slotA = lineupA[index];
                    const slotB = lineupB[index];

                    return (
                        <View key={slot.key} style={styles.rosterRow}>
                            {/* User A (Me) */}
                            <View style={styles.playerSlot}>
                                {slotA?.player ? (
                                    <>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.playerName}>{slotA.player.first_name} {slotA.player.last_name}</Text>
                                            {slotA.rank && <Text style={styles.rankText}>#{slotA.rank}</Text>}
                                        </View>
                                        <Text style={styles.playerScore}>{slotA.live.toFixed(1)}</Text>
                                    </>
                                ) : (
                                    <Text style={styles.playerName}>Empty</Text>
                                )}
                            </View>

                            <View style={styles.positionBadge}>
                                <Text style={styles.positionText}>{slot.position}</Text>
                            </View>

                            {/* User B (Opponent) */}
                            <View style={styles.playerSlot}>
                                {slotB?.player ? (
                                    <>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                                            <Text style={styles.playerName}>{slotB.player.first_name} {slotB.player.last_name}</Text>
                                            {slotB.rank && <Text style={[styles.rankText, { marginLeft: 4 }]}>#{slotB.rank}</Text>}
                                        </View>
                                        <Text style={[styles.playerScore, styles.alignRight]}>{slotB.live.toFixed(1)}</Text>
                                    </>
                                ) : (
                                    <Text style={[styles.playerName, styles.alignRight]}>Empty</Text>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    if (loading) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.scoreboard}>
                <View style={styles.teamHeader}>
                    <View style={styles.avatar} />
                    <Text style={styles.teamName}>You</Text>
                    <Text style={styles.recordText}>({recordA.wins}-{recordA.losses}-{recordA.ties})</Text>
                    <Text style={styles.totalScore}>{totalA.toFixed(2)}</Text>
                </View>
                <View style={styles.vsContainer}>
                    <Text style={styles.vsText}>VS</Text>
                </View>
                <View style={styles.teamHeader}>
                    <View style={[styles.avatar, { backgroundColor: colors.secondary }]} />
                    <Text style={styles.teamName}>{friend?.username || 'Opponent'}</Text>
                    <Text style={styles.recordText}>({recordB.wins}-{recordB.losses}-{recordB.ties})</Text>
                    <Text style={styles.totalScore}>{totalB.toFixed(2)}</Text>
                </View>
            </View>

            {renderStatusBanner()}

            <View style={styles.formatSelectorContainer}>
                <Text style={styles.formatLabel}>Scoring Format:</Text>
                <View style={styles.formatButtons}>
                    {['STD', 'PPR', 'HALF'].map(format => (
                        <TouchableOpacity
                            key={format}
                            style={[styles.formatButton, scoringType === format && styles.formatButtonActive]}
                            onPress={() => setScoringType(format)}
                        >
                            <Text style={[styles.formatButtonText, scoringType === format && styles.formatButtonTextActive]}>
                                {format === 'HALF' ? 'HALF PPR' : format}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {renderModifiers()}

            <ScrollView style={styles.scrollContent}>
                {renderRoster()}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Status
    statusBannerContainer: { padding: spacing.s, backgroundColor: '#FFF3CD', gap: 8 },
    statusBanner: { padding: spacing.xs, alignItems: 'center', justifyContent: 'center' },
    statusActive: { backgroundColor: '#D4EDDA', padding: spacing.s, flexDirection: 'row', justifyContent: 'space-between' },
    statusPending: { backgroundColor: 'transparent' }, // Container handles color
    statusWaiting: { backgroundColor: '#CCE5FF', padding: spacing.s },
    statusText: { fontWeight: 'bold', fontSize: 12, color: '#155724' },
    finalBtn: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    finalBtnText: { color: colors.white, fontSize: 10, fontWeight: 'bold' },
    recordText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginBottom: 2 },
    emptySlot: { justifyContent: 'center', height: 40 },
    rankText: { fontSize: 10, color: '#6c757d', marginLeft: 4, fontWeight: 'bold' },
    textDark: { color: '#856404' },
    confirmButton: { width: '100%' },

    // Header
    scoreboard: { flexDirection: 'row', backgroundColor: colors.primary, padding: spacing.l, alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 },
    teamHeader: { alignItems: 'center', flex: 1 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 4 },
    teamName: { color: colors.white, fontWeight: 'bold', fontSize: 14, marginBottom: 2 },
    totalScore: { color: colors.white, fontSize: 20, fontWeight: 'bold' },
    vsText: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold', fontSize: 16 },

    // Modifiers
    modifiersContainer: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.s },
    sectionLabel: { marginLeft: spacing.m, marginBottom: 4, fontSize: 10, fontWeight: 'bold', color: colors.textSecondary, textTransform: 'uppercase' },
    modifiersScroll: { paddingHorizontal: spacing.m, gap: spacing.s },
    modifierCard: { alignItems: 'center', backgroundColor: '#F8F9FA', padding: 8, borderRadius: 8, minWidth: 70, borderWidth: 1, borderColor: '#E1E4E8' },
    modifierCardCapped: { borderColor: '#FFA000', backgroundColor: '#FFF8E1' },
    modifierTitle: { fontSize: 10, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 4 },
    modifierControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    modBtn: { padding: 2 },
    modBtnText: { fontSize: 18, fontWeight: 'bold', color: colors.primary, width: 15, textAlign: 'center' },
    modifierCount: { fontSize: 14, fontWeight: 'bold', color: colors.text, width: 10, textAlign: 'center' },
    cappedText: { fontSize: 8, color: '#E65100', marginTop: 2, fontWeight: 'bold' },

    // Format Selector
    formatSelectorContainer: { paddingHorizontal: spacing.m, paddingVertical: spacing.s, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
    formatLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.s },
    formatButtons: { flexDirection: 'row', gap: spacing.s },
    formatButton: { flex: 1, paddingVertical: 8, paddingHorizontal: spacing.s, borderRadius: borderRadius.s, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white },
    formatButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    formatButtonText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    formatButtonTextActive: { color: colors.white },

    // Roster
    scrollContent: { flex: 1 },
    rosterContainer: { backgroundColor: colors.card, margin: spacing.m, borderRadius: borderRadius.m, overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tableHeader: { backgroundColor: '#F8F9FA', padding: spacing.s, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerText: { fontWeight: 'bold', color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', textAlign: 'center' },
    rosterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: spacing.s, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    positionBadge: { width: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F5', paddingVertical: 4, borderRadius: 4, marginHorizontal: spacing.s },
    positionText: { fontSize: 10, fontWeight: 'bold', color: colors.textSecondary },
    playerSlot: { flex: 1 },
    playerName: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    playerScore: { fontSize: 11, color: colors.textSecondary },
    alignRight: { textAlign: 'right' },
    conflictText: { color: colors.destructive, fontStyle: 'italic' },
    emptyState: { padding: 20, alignItems: 'center' },
    emptyStateText: { color: colors.textSecondary },
});
