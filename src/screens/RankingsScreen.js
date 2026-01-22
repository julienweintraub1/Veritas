import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';
import AppButton from '../components/AppButton';
import { supabase } from '../services/supabase';
import { syncPlayersToSupabase } from '../services/sleeper';
import { fetchNFLState } from '../services/liveScoring';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DEF'];
const FORMATS = ['STD', 'PPR', 'HALF'];

export default function RankingsScreen({ navigation }) {
    // State
    const insets = useSafeAreaInsets();
    const [selectedPos, setSelectedPos] = useState('QB');
    const [selectedFormat, setSelectedFormat] = useState('STD');
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState('');
    const [currentWeek, setCurrentWeek] = useState(null);

    // Reload rankings when position or format changes
    useEffect(() => {
        fetchRankings();
    }, [selectedPos, selectedFormat]);

    // ALSO reload rankings when screen comes into focus (after wizard completion)
    useFocusEffect(
        useCallback(() => {
            fetchRankings();
        }, [selectedPos, selectedFormat])
    );

    // Auto-Sync on Mount
    useEffect(() => {
        handleSync();
    }, []);

    const fetchRankings = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 0. Fetch Current Week
            const state = await fetchNFLState();
            setCurrentWeek(state.week);

            // 1. Fetch User's Ranking List
            const { data: rankingData } = await supabase
                .from('user_rankings')
                .select('ranked_ids')
                .eq('user_id', user.id)
                .eq('position', selectedPos)
                .eq('scoring_type', selectedFormat)
                .single();

            const rankedIds = rankingData?.ranked_ids || [];

            // 2. Fetch Player Details (including projections and stats)
            let posQuery = selectedPos;
            if (selectedPos === 'FLEX') posQuery = ['RB', 'WR', 'TE'];
            if (selectedPos === 'SUPERFLEX') posQuery = ['QB', 'RB', 'WR', 'TE'];

            let query = supabase
                .from('nfl_players')
                .select('*')
                .eq('active', true);

            if (Array.isArray(posQuery)) {
                query = query.in('position', posQuery);
            } else {
                query = query.eq('position', posQuery);
            }

            const { data: allPlayers, error } = await query;
            if (error) throw error;

            const formatKey = selectedFormat.toLowerCase();
            let filteredPlayers = allPlayers.filter(p => {
                const proj = p.projections?.[formatKey] || 0;
                return proj > 0; // STRICTOR FILTERING
            });

            let finalPlayers = [];

            // 3. Logic: Default vs Custom
            if (rankedIds.length > 0) {
                // CUSTOM: Sort by user's ranked_ids, but ONLY for players who pass the projection filter
                const idToIndex = new Map(rankedIds.map((id, index) => [id, index]));
                finalPlayers = filteredPlayers.sort((a, b) => {
                    const indexA = idToIndex.has(a.id) ? idToIndex.get(a.id) : 99999;
                    const indexB = idToIndex.has(b.id) ? idToIndex.get(b.id) : 99999;
                    return indexA - indexB;
                });
            } else {
                // DEFAULT: Sort by Projections descending
                finalPlayers = filteredPlayers.sort((a, b) => {
                    const projA = a.projections?.[formatKey] || 0;
                    const projB = b.projections?.[formatKey] || 0;
                    return projB - projA;
                });
            }

            setPlayers(finalPlayers);

        } catch (error) {
            console.error('Error fetching rankings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncStatus('Syncing latest players...');
        await syncPlayersToSupabase(setSyncStatus);
        setSyncing(false);
        setSyncStatus(''); // Clear status when done
        fetchRankings();
    };

    const movePlayer = (index, direction) => {
        const newPlayers = [...players];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= newPlayers.length) return;

        const [movedPlayer] = newPlayers.splice(index, 1);
        newPlayers.splice(newIndex, 0, movedPlayer);
        setPlayers(newPlayers);
        saveRankings(newPlayers);
    };

    const saveRankings = async (newPlayers) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const rankedIds = newPlayers.map(p => p.id);
            await supabase.from('user_rankings').upsert({
                user_id: user.id,
                position: selectedPos,
                scoring_type: selectedFormat,
                ranked_ids: rankedIds,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,position,scoring_type' });
        } catch (error) {
            console.error('Error saving:', error);
        }
    };

    // --- Renders ---

    const renderHeader = () => (
        <View>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.l) }]}>
                <Text style={styles.title}>Rankings</Text>
                <View style={styles.headerButtons}>
                    <AppButton
                        title="Wizard"
                        onPress={() => navigation.navigate('Wizard', { position: selectedPos, scoringType: selectedFormat })}
                        style={styles.wizardBtn}
                        textStyle={{ fontSize: 14 }}
                    />
                </View>
            </View>
            {/* Training Wheels Guidance */}
            <View style={styles.guidanceContainer}>
                <Text style={styles.guidanceText}>
                    Rankings save automatically as you move players.
                </Text>
                <Text style={styles.guidanceSubText}>
                    Tip: Use the Wizard for a faster, more accurate ranking!
                </Text>
            </View>

            {syncStatus ? <Text style={styles.syncStatus}>{syncStatus}</Text> : null}
        </View>
    );

    const renderTabs = () => (
        <View>
            <View style={styles.tabScrollConfirm}>
                <FlatList
                    horizontal
                    data={POSITIONS}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabContainer}
                    keyExtractor={item => item}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.tab, selectedPos === item && styles.activeTab]}
                            onPress={() => setSelectedPos(item)}
                        >
                            <Text style={[styles.tabText, selectedPos === item && styles.activeTabText]}>{item}</Text>
                        </TouchableOpacity>
                    )}
                />
            </View>
            <View style={styles.subTabContainer}>
                {FORMATS.map(fmt => (
                    <TouchableOpacity
                        key={fmt}
                        style={[styles.subTab, selectedFormat === fmt && styles.activeSubTab]}
                        onPress={() => setSelectedFormat(fmt)}
                    >
                        <Text style={[styles.subTabText, selectedFormat === fmt && styles.activeSubTabText]}>{fmt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const renderPlayerItem = ({ item, index }) => {
        const formatKey = selectedFormat.toLowerCase();
        const projection = item.projections?.[formatKey] || 0;

        // Only show live stats if they belong to the current week
        const actual = (item.stats_week === currentWeek) ? (item.current_week_stats?.[formatKey] || 0) : 0;

        return (
            <View style={styles.playerRow}>
                <Text style={styles.rankNumber}>{index + 1}</Text>
                <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{item.first_name} {item.last_name}</Text>
                    <Text style={styles.playerDetails}>{item.position} - {item.team || 'FA'}</Text>
                </View>

                <View style={styles.scoreStats}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>PROJ</Text>
                        <Text style={styles.statValue}>{projection.toFixed(1)}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={[styles.statLabel, actual > 0 && { color: colors.primary }]}>LIVE</Text>
                        <Text style={[styles.statValue, actual > 0 && { color: colors.primary }]}>{actual.toFixed(1)}</Text>
                    </View>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, index === 0 && styles.disabledBtn]}
                        onPress={() => movePlayer(index, 'up')}
                        disabled={index === 0}
                    >
                        <Text style={styles.actionText}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, index === players.length - 1 && styles.disabledBtn]}
                        onPress={() => movePlayer(index, 'down')}
                        disabled={index === players.length - 1}
                    >
                        <Text style={styles.actionText}>▼</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {renderHeader()}
            {renderTabs()}
            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
                <FlatList
                    data={players}
                    keyExtractor={item => item.id}
                    renderItem={renderPlayerItem}
                    contentContainerStyle={styles.listContent}
                    initialNumToRender={20}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.m,
        paddingTop: spacing.l,
        paddingBottom: spacing.s,
    },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    headerButtons: { flexDirection: 'row', gap: 8 },
    syncBtn: { width: 80, height: 36, paddingVertical: 0 },
    wizardBtn: { width: 100, height: 36, paddingVertical: 0 },
    syncStatus: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingBottom: spacing.s,
    },
    guidanceContainer: {
        backgroundColor: colors.card,
        padding: spacing.m,
        marginHorizontal: spacing.m,
        marginBottom: spacing.s,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary + '40', // light primary
    },
    guidanceText: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 4,
        textAlign: 'center',
    },
    guidanceSubText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    tabScrollConfirm: { borderBottomWidth: 1, borderBottomColor: colors.border },
    tabContainer: { paddingHorizontal: spacing.s },
    tab: { paddingVertical: 12, paddingHorizontal: 16, marginRight: 4 },
    activeTab: { borderBottomWidth: 3, borderBottomColor: colors.primary },
    tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    activeTabText: { color: colors.primary },
    subTabContainer: {
        flexDirection: 'row',
        padding: spacing.s,
        backgroundColor: '#F8F9FA',
        gap: spacing.s,
    },
    subTab: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeSubTab: { backgroundColor: colors.primary, borderColor: colors.primary },
    subTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    activeSubTabText: { color: colors.white },
    listContent: { paddingBottom: spacing.xl },
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.card,
    },
    rankNumber: { width: 30, fontSize: 16, fontWeight: 'bold', color: colors.textSecondary, textAlign: 'center' },
    playerInfo: { flex: 1, marginLeft: spacing.s },
    playerName: { fontSize: 16, fontWeight: '500', color: colors.text },
    playerDetails: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    scoreStats: { flexDirection: 'row', gap: 12, marginRight: spacing.m },
    statBox: { alignItems: 'center', minWidth: 40 },
    statLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: 'bold' },
    statValue: { fontSize: 14, fontWeight: 'bold', color: colors.text },
    actions: { flexDirection: 'row', gap: 8 },
    actionBtn: { padding: 8, backgroundColor: '#F0F2F5', borderRadius: 4 },
    actionText: { fontSize: 12, color: colors.textSecondary },
    disabledBtn: { opacity: 0.3 },
});
