import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const insets = useSafeAreaInsets();
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
            if (totalA > totalB) winnerId = currentUserId;
            else if (totalB > totalA) winnerId = opponentId;

            // Map score to correct columns
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

    const renderHeaderStatus = () => {
        if (status === 'active') {
            return <Text style={[styles.vsText, { color: '#28a745' }]}>LIVE</Text>;
        }
        if (status === 'final') {
            return <Text style={[styles.vsText, { color: colors.textSecondary }]}>FINAL</Text>;
        }
        return <Text style={styles.vsText}>VS</Text>;
    };

    const renderSettings = () => (
        <View style={styles.settingsSection}>
            <Text style={styles.sectionLabel}>Matchup Settings</Text>

            {/* Format Selector */}
            <View style={styles.formatSelectorRaw}>
                <Text style={styles.settingLabel}>Score Format:</Text>
                <View style={styles.compactFormatContainer}>
                    {['STD', 'PPR', 'HALF'].map(format => (
                        <TouchableOpacity
                            key={format}
                            style={[styles.compactFormatBtn, scoringType === format && styles.compactFormatBtnActive]}
                            onPress={() => setScoringType(format)}
                        >
                            <Text style={[styles.compactFormatText, scoringType === format && styles.textWhite]}>
                                {format}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Modifiers */}
            <View style={styles.modifiersRow}>
                <Text style={styles.settingLabel}>Roster Slots:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactModifiersScroll}>
                    {POSITIONS.map(pos => {
                        const myVal = mySettings[pos] || 0;
                        const oppVal = opponentSettings[pos] || 0;
                        const isCapped = myVal > oppVal;

                        return (
                            <View key={pos} style={[styles.compactModCard, isCapped && styles.modCardCapped]}>
                                <Text style={styles.compactModTitle}>{pos}</Text>
                                <View style={styles.compactModControls}>
                                    <TouchableOpacity onPress={() => updatePositionCount(pos, -1)} style={styles.compactModBtn}>
                                        <Text style={styles.compactBtnText}>-</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.compactModCount}>{myVal}</Text>
                                    <TouchableOpacity onPress={() => updatePositionCount(pos, 1)} style={styles.compactModBtn}>
                                        <Text style={styles.compactBtnText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );

    const renderRoster = () => {
        const effectiveSettings = getEffectiveSettings();
        const slots = [];
        POSITIONS.forEach(pos => {
            const count = effectiveSettings[pos] || 0;
            for (let i = 0; i < count; i++) {
                slots.push({ position: pos, key: `${pos}-${i}` });
            }
        });

        if (slots.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No active slots. Adjust settings below.</Text>
                </View>
            );
        }

        return (
            <View style={[styles.rosterContainer, status !== 'active' && { opacity: 0.8 }]}>
                {slots.map((slot, index) => {
                    const slotA = lineupA[index];
                    const slotB = lineupB[index];
                    return (
                        <View key={slot.key} style={styles.rosterRow}>
                            {/* User A (Me) */}
                            <View style={styles.playerSlot}>
                                {slotA?.player ? (
                                    <>
                                        <View style={styles.nameRow}>
                                            <Text style={styles.playerName} numberOfLines={1}>
                                                {slotA.player.first_name.charAt(0)}. {slotA.player.last_name}
                                            </Text>
                                            {slotA.rank && <Text style={styles.rankText}>#{slotA.rank}</Text>}
                                        </View>
                                        <Text style={styles.playerScore}>{slotA.live.toFixed(1)}</Text>
                                    </>
                                ) : (
                                    <Text style={styles.emptyText}>--</Text>
                                )}
                            </View>

                            <View style={styles.positionBadge}>
                                <Text style={styles.positionText}>{slot.position}</Text>
                            </View>

                            {/* User B (Opponent) */}
                            <View style={[styles.playerSlot, { alignItems: 'flex-end' }]}>
                                {slotB?.player ? (
                                    <>
                                        <View style={[styles.nameRow, { justifyContent: 'flex-end' }]}>
                                            <Text style={styles.playerName} numberOfLines={1}>
                                                {slotB.player.first_name.charAt(0)}. {slotB.player.last_name}
                                            </Text>
                                            {slotB.rank && <Text style={styles.rankText}>#{slotB.rank}</Text>}
                                        </View>
                                        <Text style={styles.playerScore}>{slotB.live.toFixed(1)}</Text>
                                    </>
                                ) : (
                                    <Text style={styles.emptyText}>--</Text>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    const shouldShowConfirm = status === 'pending' && ((amIUser1 && !user1Confirmed) || (!amIUser1 && !user2Confirmed));
    const isWaiting = status === 'pending' && ((amIUser1 && user1Confirmed) || (!amIUser1 && user2Confirmed));

    if (loading) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
    }

    return (
        <View style={styles.container}>
            {/* Condensed Header */}
            <View style={[styles.scoreboard, { paddingTop: Math.max(insets.top, 10) }]}>
                {/* Chat Button (Top Right Absolute) or just layout */}
                <TouchableOpacity
                    style={styles.chatButton}
                    onPress={() => navigation.navigate('Chat', { friend })}
                >
                    <Text style={{ fontSize: 20 }}>💬</Text>
                </TouchableOpacity>

                <View style={styles.teamHeader}>
                    {/* My Avatar (Placeholder or Real) */}
                    {recordA.avatar_url ? (
                        <Image source={{ uri: recordA.avatar_url }} style={styles.avatarSmall} />
                    ) : (
                        <View style={styles.avatarSmall}>
                            <Text style={styles.avatarText}>{recordA.username?.charAt(0) || 'Me'}</Text>
                        </View>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.teamNameSmall} numberOfLines={1} ellipsizeMode="tail">
                            {recordA.username || 'You'}
                        </Text>
                        <Text style={styles.recordText}>({recordA.wins}-{recordA.losses}-{recordA.ties})</Text>
                    </View>
                    <Text style={styles.totalScore}>{totalA.toFixed(2)}</Text>
                </View>

                <View style={styles.vsContainer}>
                    {renderHeaderStatus()}
                </View>

                <View style={[styles.teamHeader, { alignItems: 'flex-end', justifyContent: 'flex-end' }]}>
                    <Text style={styles.totalScore}>{totalB.toFixed(2)}</Text>
                    <View style={{ alignItems: 'flex-end', flex: 1 }}>
                        <Text style={styles.teamNameSmall} numberOfLines={1} ellipsizeMode="tail">
                            {friend?.username || 'Opponent'}
                        </Text>
                        <Text style={styles.recordText}>({recordB.wins}-{recordB.losses}-{recordB.ties})</Text>
                    </View>
                    {recordB.avatar_url ? (
                        <Image source={{ uri: recordB.avatar_url }} style={[styles.avatarSmall, { marginLeft: 8 }]} />
                    ) : (
                        <View style={[styles.avatarSmall, { backgroundColor: colors.secondary, marginLeft: 8 }]}>
                            <Text style={styles.avatarText}>{friend?.username?.charAt(0) || 'Opp'}</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Main Content */}
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Training Wheels / Guidance */}
                {status === 'pending' && (
                    <View style={styles.guidanceBox}>
                        <Text style={styles.guidanceText}>How to play:</Text>
                        <Text style={styles.guidanceSub}>1. Adjust position counts below to set your max preference.</Text>
                        <Text style={styles.guidanceSub}>2. The lower count between you and your opponent sets the slot limit.</Text>
                        <Text style={styles.guidanceSub}>3. Confirm when you are ready!</Text>
                    </View>
                )}

                {renderRoster()}
                {renderSettings()}
                <View style={{ height: 80 }} />
            </ScrollView>

            {/* Footer Action */}
            {shouldShowConfirm && (
                <View style={[styles.footerAction, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <AppButton
                        title="Confirm Matchup"
                        onPress={confirmMatchup}
                        style={styles.confirmButton}
                    />
                </View>
            )}

            {isWaiting && (
                <View style={[styles.footerAction, styles.waitingFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <Text style={styles.waitingText}>Waiting for {friend?.username} to confirm...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header (Condensed)
    scoreboard: {
        flexDirection: 'row',
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.m,
        paddingVertical: spacing.s,
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, elevation: 4, zIndex: 1
    },
    teamHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatarSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.3)', marginRight: 8 },
    teamNameSmall: { color: colors.white, fontWeight: 'bold', fontSize: 12 },
    recordText: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
    totalScore: { color: colors.white, fontSize: 18, fontWeight: 'bold', marginHorizontal: 8 },
    vsContainer: { paddingHorizontal: 10, alignItems: 'center', minWidth: 50 },
    vsText: { color: 'rgba(255,255,255,0.8)', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },

    // Roster
    scrollContent: { paddingVertical: spacing.m },
    rosterContainer: { backgroundColor: colors.white, marginHorizontal: spacing.m, borderRadius: borderRadius.m, overflow: 'hidden', paddingVertical: 4 },
    rosterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: spacing.s, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', height: 50 },
    positionBadge: { width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F5', paddingVertical: 2, borderRadius: 4, marginHorizontal: 4 },
    positionText: { fontSize: 9, fontWeight: 'bold', color: colors.textSecondary },
    playerSlot: { flex: 1, justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    playerName: { fontSize: 13, color: colors.text, fontWeight: '600' },
    playerScore: { fontSize: 11, color: colors.textSecondary },
    rankText: { fontSize: 10, color: '#6c757d', marginLeft: 4 },
    emptyText: { color: '#ccc', fontSize: 12, fontStyle: 'italic' },
    emptyState: { padding: 40, alignItems: 'center' },
    emptyStateText: { color: colors.textSecondary },

    // Settings (Bottom)
    settingsSection: { marginTop: spacing.l, paddingHorizontal: spacing.m, paddingTop: spacing.m, borderTopWidth: 1, borderTopColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
    sectionLabel: { fontSize: 12, fontWeight: 'bold', color: colors.textSecondary, marginBottom: spacing.s, textTransform: 'uppercase' },
    settingLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, width: 80 },

    formatSelectorRaw: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.m },
    compactFormatContainer: { flexDirection: 'row', flex: 1, backgroundColor: '#E0E0E0', borderRadius: 8, padding: 2 },
    compactFormatBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    compactFormatBtnActive: { backgroundColor: colors.primary, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 1 },
    compactFormatText: { fontSize: 10, fontWeight: 'bold', color: colors.textSecondary },
    textWhite: { color: colors.white },

    modifiersRow: { flexDirection: 'row', alignItems: 'center' },
    compactModifiersScroll: { gap: 8, paddingRight: 20 },
    compactModCard: { alignItems: 'center', backgroundColor: colors.white, padding: 4, borderRadius: 6, borderWidth: 1, borderColor: '#E0E0E0', width: 60 },
    modCardCapped: { borderColor: '#FFB74D', backgroundColor: '#FFF3E0' },
    compactModTitle: { fontSize: 9, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 2 },
    compactModControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    compactModBtn: { padding: 4 },
    compactBtnText: { fontSize: 14, fontWeight: 'bold', color: colors.primary },
    compactModCount: { fontSize: 12, fontWeight: 'bold', color: colors.text },

    // Footer
    footerAction: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, padding: spacing.m, borderTopWidth: 1, borderTopColor: colors.border },
    waitingFooter: { backgroundColor: '#FFF3CD', borderTopColor: '#FFEEBA', alignItems: 'center' },
    waitingText: { color: '#856404', fontWeight: 'bold' },
    confirmButton: { width: '100%' },
    chatButton: {
        position: 'absolute',
        top: 40,
        right: 10,
        zIndex: 10,
        backgroundColor: colors.white,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        elevation: 3,
    },
    guidanceBox: {
        backgroundColor: '#FFF3E0', // Light orange
        marginHorizontal: spacing.m,
        marginBottom: spacing.s,
        padding: spacing.m,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FFB74D',
    },
    guidanceText: {
        fontWeight: 'bold',
        color: '#E65100',
        marginBottom: 4,
    },
    guidanceSub: {
        fontSize: 12,
        color: '#E65100',
        marginBottom: 2,
    },
    avatarText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
    }
});
