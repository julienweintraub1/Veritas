import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';
import AppButton from './AppButton';
import {
    findNextComparison,
    processSelection,
    handlePromotionChoice,
    saveWizardState,
    resetWizardState
} from '../services/wizard';

/**
 * RankingWizard Component
 * 
 * Implements pairwise comparison UI for building player rankings.
 * Uses merge-sort-inspired algorithm for efficient ranking.
 * 
 * @param {Array} initialPlayers - Array of player objects
 * @param {string} userId - Current user ID
 * @param {string} position - Position being ranked (QB, RB, etc.)
 * @param {string} scoringType - Scoring format (STD, PPR, HALF)
 * @param {Function} onComplete - Callback when wizard completes
 */
export default function RankingWizard({ initialPlayers, userId, position, scoringType, onComplete }) {
    // State
    const [rankings, setRankings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // Promotion cycle state
    const [isPromoting, setIsPromoting] = useState(false);
    const [promotedPlayerId, setPromotedPlayerId] = useState(null);
    const [currentPromotionIndex, setCurrentPromotionIndex] = useState(null);
    const [originalComparisonIds, setOriginalComparisonIds] = useState({ playerAId: null, playerBId: null });

    // Initialize rankings from players
    useEffect(() => {
        if (!initialPlayers || initialPlayers.length === 0) {
            setIsLoading(false);
            return;
        }

        // Convert players to ranking format
        const initialRankings = initialPlayers.map((player, index) => ({
            id: player.id,
            rank: index + 1,
            isCompared: false,
            player: player // Store full player data for display
        }));

        setRankings(initialRankings);
        setIsLoading(false);
    }, [initialPlayers]);

    // Find next comparison pair
    const comparisonPair = findNextComparison(rankings);
    const { playerA, playerB } = comparisonPair || {};

    // Find promotion comparison if in promotion mode
    const promotingPlayer = isPromoting && promotedPlayerId
        ? rankings.find(p => p.id === promotedPlayerId)
        : null;

    const comparisonPlayer = isPromoting && currentPromotionIndex !== null && currentPromotionIndex > 0
        ? rankings[currentPromotionIndex - 1]
        : null;

    // Handle main comparison selection
    const handleSelection = async (selectedPlayerId) => {
        if (!playerA || !playerB || isProcessing) return;

        setIsProcessing(true);

        try {
            // Store original comparison for later marking as compared
            setOriginalComparisonIds({ playerAId: playerA.id, playerBId: playerB.id });

            const loserId = selectedPlayerId === playerA.id ? playerB.id : playerA.id;
            const result = processSelection(rankings, selectedPlayerId, loserId);

            if (result.shouldPromote) {
                // Start promotion cycle
                setIsPromoting(true);
                setPromotedPlayerId(result.promotedPlayerId);
                const loserIndex = rankings.findIndex(p => p.id === loserId);
                setCurrentPromotionIndex(loserIndex);
                setRankings(result.rankings);
            } else {
                // No promotion needed, save and continue
                setRankings(result.rankings);
                await saveWizardState(userId, position, scoringType, result.rankings);

                // Check if wizard is complete
                const allCompared = result.rankings.every(p => p.isCompared);
                if (allCompared && onComplete) {
                    onComplete(result.rankings);
                }
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to process selection');
            console.error('Selection error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle promotion cycle choice
    const handlePromotion = async (selectedPlayerId) => {
        if (!isPromoting || !promotedPlayerId || currentPromotionIndex === null || isProcessing) {
            return;
        }

        setIsProcessing(true);

        try {
            const result = handlePromotionChoice(
                rankings,
                promotedPlayerId,
                currentPromotionIndex,
                selectedPlayerId
            );

            if (result.continuePromotion) {
                // Keep promoting
                setCurrentPromotionIndex(result.newPromotionIndex);
                setRankings(result.rankings);
            } else {
                // Promotion cycle ended
                setIsPromoting(false);
                setPromotedPlayerId(null);
                setCurrentPromotionIndex(null);

                // Mark original comparison players as compared
                const finalRankings = result.rankings.map(p => {
                    if (p.id === originalComparisonIds.playerAId || p.id === originalComparisonIds.playerBId) {
                        return { ...p, isCompared: true };
                    }
                    return p;
                });

                setRankings(finalRankings);
                await saveWizardState(userId, position, scoringType, finalRankings);

                // Check if wizard is complete
                const allCompared = finalRankings.every(p => p.isCompared);
                if (allCompared && onComplete) {
                    onComplete(finalRankings);
                }
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to process promotion');
            console.error('Promotion error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle reset
    const handleReset = async () => {
        Alert.alert(
            'Reset Wizard',
            'Are you sure? This will restart the ranking process.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        setIsResetting(true);
                        await resetWizardState(userId, position, scoringType);

                        // Reset local state
                        const resetRankings = rankings.map(p => ({ ...p, isCompared: false }));
                        setRankings(resetRankings);
                        setIsPromoting(false);
                        setPromotedPlayerId(null);
                        setCurrentPromotionIndex(null);

                        setIsResetting(false);
                    }
                }
            ]
        );
    };

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading Wizard...</Text>
            </View>
        );
    }

    // No players to rank
    if (rankings.length < 2) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Not enough players to start wizard.</Text>
                <Text style={styles.emptySubtext}>You need at least 2 players.</Text>
            </View>
        );
    }

    // All comparisons complete
    if (!playerA && !playerB && !isPromoting) {
        return (
            <View style={styles.completeContainer}>
                <Text style={styles.completeTitle}>🎉 Ranking Complete!</Text>
                <Text style={styles.completeText}>
                    All players have been ranked using your preferences.
                </Text>
                <AppButton
                    title="Start Over"
                    onPress={handleReset}
                    outline
                    style={styles.resetButton}
                />
            </View>
        );
    }

    const comparedCount = rankings.filter(p => p.isCompared).length;
    const totalCount = rankings.length;

    return (
        <View style={styles.container}>
            {/* Header with Progress */}
            <View style={styles.header}>
                <Text style={styles.title}>Ranking Wizard</Text>
                <Text style={styles.subtitle}>{position} - {scoringType}</Text>
                <Text style={styles.progress}>
                    Compared: {comparedCount} / {totalCount}
                </Text>
            </View>

            {/* Reset Button */}
            <TouchableOpacity
                style={styles.resetButtonTop}
                onPress={handleReset}
                disabled={isResetting || isProcessing}
            >
                <Text style={styles.resetButtonText}>
                    {isResetting ? 'Resetting...' : 'Reset'}
                </Text>
            </TouchableOpacity>

            {/* Comparison UI */}
            <View style={styles.comparisonContainer}>
                {isPromoting ? (
                    <>
                        <Text style={styles.questionText}>Keep Promoting?</Text>
                        <View style={styles.playersContainer}>
                            {comparisonPlayer && (
                                <PlayerCard
                                    player={comparisonPlayer.player}
                                    rank={comparisonPlayer.rank}
                                    onPress={() => handlePromotion(comparisonPlayer.id)}
                                    disabled={isProcessing}
                                    color="gray"
                                />
                            )}
                            <View style={styles.vsContainer}>
                                <Text style={styles.vsText}>VS</Text>
                            </View>
                            {promotingPlayer && (
                                <PlayerCard
                                    player={promotingPlayer.player}
                                    rank={promotingPlayer.rank}
                                    onPress={() => handlePromotion(promotingPlayer.id)}
                                    disabled={isProcessing}
                                    color="yellow"
                                    isPromoting
                                />
                            )}
                        </View>
                    </>
                ) : (
                    <>
                        <Text style={styles.questionText}>Who Ranks Higher?</Text>
                        <View style={styles.playersContainer}>
                            {playerA && (
                                <PlayerCard
                                    player={playerA.player}
                                    rank={playerA.rank}
                                    onPress={() => handleSelection(playerA.id)}
                                    disabled={isProcessing}
                                    color="blue"
                                />
                            )}
                            <View style={styles.vsContainer}>
                                <Text style={styles.vsText}>VS</Text>
                            </View>
                            {playerB && (
                                <PlayerCard
                                    player={playerB.player}
                                    rank={playerB.rank}
                                    onPress={() => handleSelection(playerB.id)}
                                    disabled={isProcessing}
                                    color="green"
                                    isPromoting={playerB.rank > playerA.rank}
                                />
                            )}
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

/**
 * PlayerCard Component
 * Displays a player option in the comparison
 */
function PlayerCard({ player, rank, onPress, disabled, color, isPromoting }) {
    const getColorStyles = () => {
        const colorStyles = {
            blue: { bg: colors.primary, border: colors.primary },
            green: { bg: colors.success, border: colors.success },
            yellow: { bg: '#FFA500', border: '#FFA500' },
            gray: { bg: colors.textSecondary, border: colors.textSecondary }
        };
        return colorStyles[color] || colorStyles.blue;
    };

    const colorStyle = getColorStyles();
    const formatKey = player.scoring_type?.toLowerCase() || 'std';
    const projection = player.projections?.[formatKey] || 0;

    return (
        <TouchableOpacity
            style={[
                styles.playerCard,
                { borderColor: colorStyle.border },
                disabled && styles.playerCardDisabled
            ]}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.7}
        >
            {isPromoting && (
                <View style={[styles.promotingBadge, { backgroundColor: colorStyle.bg }]}>
                    <Text style={styles.promotingText}>↑ CHALLENGING</Text>
                </View>
            )}
            <Text style={styles.playerName}>
                {player.first_name} {player.last_name}
            </Text>
            <Text style={styles.playerInfo}>
                {player.position} - {player.team || 'FA'}
            </Text>
            <Text style={styles.playerRank}>Current Rank: #{rank}</Text>
            <Text style={styles.playerProjection}>{projection.toFixed(1)} pts</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: spacing.m,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: spacing.m,
        fontSize: 16,
        color: colors.textSecondary,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.l,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: spacing.s,
        textAlign: 'center',
    },
    completeContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.l,
    },
    completeTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.success,
        marginBottom: spacing.m,
        textAlign: 'center',
    },
    completeText: {
        fontSize: 16,
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.l,
    },
    resetButton: {
        marginTop: spacing.m,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.l,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginTop: spacing.s,
    },
    progress: {
        fontSize: 14,
        color: colors.primary,
        marginTop: spacing.s,
        fontWeight: '600',
    },
    resetButtonTop: {
        alignSelf: 'center',
        paddingVertical: 8,
        paddingHorizontal: spacing.m,
        backgroundColor: colors.destructive,
        borderRadius: borderRadius.s,
        marginBottom: spacing.l,
    },
    resetButtonText: {
        color: colors.white,
        fontWeight: '600',
        fontSize: 14,
    },
    comparisonContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    questionText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.l,
    },
    playersContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    vsContainer: {
        marginHorizontal: spacing.s,
    },
    vsText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    playerCard: {
        flex: 1,
        padding: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 3,
        backgroundColor: colors.card,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    playerCardDisabled: {
        opacity: 0.6,
    },
    promotingBadge: {
        position: 'absolute',
        top: -8,
        right: -8,
        paddingHorizontal: spacing.s,
        paddingVertical: 4,
        borderRadius: borderRadius.s,
    },
    promotingText: {
        color: colors.white,
        fontSize: 10,
        fontWeight: 'bold',
    },
    playerName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: spacing.s,
        textAlign: 'center',
    },
    playerInfo: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.s,
    },
    playerRank: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 4,
    },
    playerProjection: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        textAlign: 'center',
    },
});
