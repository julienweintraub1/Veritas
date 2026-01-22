import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import RankingWizard from '../components/RankingWizard';
import { loadWizardState } from '../services/wizard';

/**
 * WizardScreen
 * 
 * Full-screen wizard experience for ranking players via pairwise comparisons.
 * Integrates with existing Veritas rankings system.
 */
export default function WizardScreen({ route, navigation }) {
    const { position, scoringType } = route.params;

    const [userId, setUserId] = useState(null);
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlayers();
    }, [position, scoringType]);

    const loadPlayers = async () => {
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                Alert.alert('Error', 'User not authenticated');
                navigation.goBack();
                return;
            }
            setUserId(user.id);

            // Load existing wizard state
            const wizardState = await loadWizardState(user.id, position, scoringType);

            // Determine which positions to fetch
            let posQuery = position;
            if (position === 'FLEX') posQuery = ['RB', 'WR', 'TE'];
            if (position === 'SUPERFLEX') posQuery = ['QB', 'RB', 'WR', 'TE'];

            // Build query
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

            // Filter players with projections > 0
            const formatKey = scoringType.toLowerCase();
            const filteredPlayers = allPlayers.filter(p => {
                const proj = p.projections?.[formatKey] || 0;
                return proj > 0;
            });

            // Restore wizard state if it exists
            if (wizardState && wizardState.rankedIds && wizardState.rankedIds.length > 0) {
                // Build players array with restored state
                const restoredPlayers = [];
                const playerMap = new Map(filteredPlayers.map(p => [p.id, p]));

                wizardState.rankedIds.forEach((playerId, index) => {
                    const player = playerMap.get(playerId);
                    if (player) {
                        const state = wizardState.comparisonState[playerId] || {};
                        restoredPlayers.push({
                            ...player,
                            rank: state.rank || index + 1,
                            isCompared: state.isCompared || false
                        });
                    }
                });

                // Add any new players that weren't in the saved state
                filteredPlayers.forEach(player => {
                    if (!wizardState.rankedIds.includes(player.id)) {
                        restoredPlayers.push({
                            ...player,
                            rank: restoredPlayers.length + 1,
                            isCompared: false
                        });
                    }
                });

                setPlayers(restoredPlayers);
            } else {
                // No saved state, start fresh with default projection-based ordering
                const sortedPlayers = filteredPlayers
                    .sort((a, b) => {
                        const projA = a.projections?.[formatKey] || 0;
                        const projB = b.projections?.[formatKey] || 0;
                        return projB - projA; // Descending
                    })
                    .map((player, index) => ({
                        ...player,
                        rank: index + 1,
                        isCompared: false
                    }));

                setPlayers(sortedPlayers);
            }

            setLoading(false);
        } catch (error) {
            console.error('Error loading players for wizard:', error);
            Alert.alert('Error', 'Could not load players');
            navigation.goBack();
        }
    };

    const handleWizardComplete = (finalRankings) => {
        Alert.alert(
            'Ranking Complete',
            'Your rankings have been saved!',
            [
                {
                    text: 'OK',
                    onPress: () => navigation.goBack()
                }
            ]
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
            <RankingWizard
                initialPlayers={players}
                userId={userId}
                position={position}
                scoringType={scoringType}
                onComplete={handleWizardComplete}
            />
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
        backgroundColor: colors.background,
    },
});
