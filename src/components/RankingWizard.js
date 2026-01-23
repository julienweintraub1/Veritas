import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
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

    // Determine current pair to display
    let leftPlayer, rightPlayer, leftOnPress, rightOnPress, leftIsPromoting, rightIsPromoting;

    if (isPromoting) {
        // In promotion mode: comparisonPlayer (Left/Lower Rank) vs PromotingPlayer (Right/Challenger)
        // Note: Visually, we can place them however. Let's stick to Left vs Right.
        // promotingPlayer is the one moving up (Challenger). comparisonPlayer is the gatekeeper.
        leftPlayer = comparisonPlayer?.player;
        leftOnPress = () => handlePromotion(comparisonPlayer?.id);
        leftIsPromoting = false;

        rightPlayer = promotingPlayer?.player;
        rightOnPress = () => handlePromotion(promotingPlayer?.id);
        rightIsPromoting = true;
    } else {
        // Standard comparison
        leftPlayer = playerA?.player;
        leftOnPress = () => handleSelection(playerA?.id);
        leftIsPromoting = false;

        rightPlayer = playerB?.player;
        rightOnPress = () => handleSelection(playerB?.id);
        rightIsPromoting = false;
    }

    return (
        <View style={styles.container}>
            {/* Split Screen Comparison */}
            <View style={styles.comparisonContainer}>
                {/* Left Player */}
                {leftPlayer && (
                    <PlayerCard
                        player={leftPlayer}
                        rank={isPromoting && comparisonPlayer ? comparisonPlayer.rank : (playerA ? playerA.rank : null)}
                        onPress={leftOnPress}
                        disabled={isProcessing}
                        isPromoting={leftIsPromoting}
                    />
                )}

                {/* Right Player */}
                {rightPlayer && (
                    <PlayerCard
                        player={rightPlayer}
                        rank={isPromoting && promotingPlayer ? promotingPlayer.rank : (playerB ? playerB.rank : null)}
                        onPress={rightOnPress}
                        disabled={isProcessing}
                        isPromoting={rightIsPromoting}
                    />
                )}
            </View>

            {/* Floating Overlay Controls */}
            <View style={styles.floatingOverlay} pointerEvents="box-none">
                {/* Top Info Bar: Format & Stats */}
                <View style={styles.topBar}>
                    <View style={styles.infoBadge}>
                        <Text style={styles.infoText}>{position} • {scoringType}</Text>
                    </View>
                    <View style={styles.infoBadge}>
                        <Text style={styles.infoText}>{comparedCount}/{totalCount}</Text>
                    </View>
                </View>

                {/* Reset Button (Bottom Center or Top Right? User said floating) */}
                {/* Let's put reset at top center or standard top position, but styled minimally */}
                <TouchableOpacity
                    style={styles.floatingResetBtn}
                    onPress={handleReset}
                    disabled={isResetting || isProcessing}
                >
                    <Text style={styles.resetButtonText}>↺</Text>
                </TouchableOpacity>

                {/* Promotion Banner */}
                {isPromoting && (
                    <View style={styles.promotionBanner}>
                        <Text style={styles.promotionText}>CHALLENGE MODE</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

/**
 * PlayerCard Component
 * Displays a full-height player image with overlay details
 */


function PlayerCard({ player, rank, onPress, disabled, isPromoting }) {
    const formatKey = player.scoring_type?.toLowerCase() || 'std';
    const projection = player.projections?.[formatKey] || 0;

    // Sleeper Image URL
    // Fallback? We can use a default image or handle error. 
    // Using a simple uri first.
    const imageUrl = `https://sleepercdn.com/content/nfl/players/${player.id}.jpg`;

    return (
        <TouchableOpacity
            style={styles.playerCard}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
        >
            <Image
                source={{ uri: imageUrl }}
                style={styles.playerImage}
                resizeMode="cover"
            />

            <View style={styles.cardOverlay}>
                {/* Text Content */}
                <View style={styles.textContainer}>
                    <Text style={styles.playerName}>{player.first_name}</Text>
                    <Text style={styles.playerNameLast}>{player.last_name}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.playerInfo}>{player.position} - {player.team || 'FA'}</Text>
                        <Text style={styles.opponentText}>{player.opponent ? ` @${player.opponent}` : ''}</Text>
                    </View>
                    <Text style={styles.playerProjection}>{projection.toFixed(1)} pts</Text>
                    {rank && <Text style={styles.playerRank}>Rank #{rank}</Text>}
                </View>
            </View>

            {isPromoting && (
                <View style={styles.challengingBadge}>
                    <Text style={styles.challengingText}>CHALLENGER</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // Dark background for photos
    },
    comparisonContainer: {
        flex: 1,
        flexDirection: 'row',
    },

    // Player Card
    playerCard: {
        flex: 1,
        height: '100%',
        position: 'relative',
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.5)',
    },
    playerImage: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2c2c2e', // Dark gray placeholder
    },
    cardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingVertical: spacing.m,
        paddingHorizontal: spacing.s,
    },
    textContainer: {
        alignItems: 'center',
    },
    playerName: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    playerNameLast: {
        color: colors.white,
        fontSize: 20,
        fontWeight: '900', // Heavy bold
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    playerInfo: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    opponentText: {
        color: colors.primary, // Pop color for opponent
        fontSize: 12,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    playerProjection: {
        color: colors.primary, // Pop color
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 2,
    },
    playerRank: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        marginTop: 2,
    },

    // Badges
    challengingBadge: {
        position: 'absolute',
        top: 60, // Clear header space if needed
        right: 10,
        backgroundColor: '#FFA500',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    challengingText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Floating UI
    floatingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        paddingTop: 10, // Safe area handled by parent
        paddingBottom: 20,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginTop: 10,
    },
    infoBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    infoText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    floatingResetBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        zIndex: 999,
    },
    resetButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    promotionBanner: {
        position: 'absolute',
        top: '50%',
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 165, 0, 0.9)',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 30,
        marginTop: -20, // Center vertically
    },
    promotionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        letterSpacing: 1,
    },

    // Loading / Empty / Complete
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
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
        backgroundColor: colors.background,
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
        backgroundColor: colors.background,
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
});
