import { supabase } from './supabase';

/**
 * Wizard Service
 * 
 * Implements pairwise comparison algorithm for player rankings.
 * Adapted from Dynasty Wizard's proven logic for Veritas Football structure.
 */

/**
 * Finds the next two players to compare based on current ranking state
 * 
 * Algorithm:
 * 1. Find lowest-ranked uncompared player
 * 2. If rank === 1, compare with rank 2
 * 3. Otherwise, compare with player ranked one position higher
 * 
 * @param {Array} rankings - Array of player objects with { id, rank, isCompared }
 * @returns {Object|null} { playerA, playerB } or null if all compared
 */
export function findNextComparison(rankings) {
    if (!rankings || rankings.length < 2) {
        return null;
    }

    // Find lowest-ranked player who hasn't been compared yet
    const lowestUncompared = rankings.find(p => p.isCompared === false);

    if (!lowestUncompared) {
        // All players have been compared
        return null;
    }

    const uncomparedRank = lowestUncompared.rank;
    let playerA, playerB;

    if (uncomparedRank === 1) {
        // Comparing rank 1 vs rank 2
        playerA = lowestUncompared;
        playerB = rankings.find(p => p.rank === 2);

        if (!playerB) {
            // Edge case: only 1 player exists
            return null;
        }
    } else {
        // Compare with player ranked one position higher
        playerA = rankings.find(p => p.rank === uncomparedRank - 1);
        playerB = lowestUncompared;

        if (!playerA) {
            console.error(`Logic error: Unable to find player at rank ${uncomparedRank - 1}`);
            return null;
        }
    }

    return { playerA, playerB };
}

/**
 * Processes a comparison selection and updates rankings accordingly
 * 
 * @param {Array} rankings - Current rankings array
 * @param {string} winnerId - ID of the player selected as higher-ranked
 * @param {string} loserId - ID of the player not selected
 * @returns {Object} { rankings, shouldPromote, promotedPlayerId }
 */
export function processSelection(rankings, winnerId, loserId) {
    const winner = rankings.find(p => p.id === winnerId);
    const loser = rankings.find(p => p.id === loserId);

    if (!winner || !loser) {
        throw new Error('Invalid player IDs in selection');
    }

    // Special case: Rank 1 vs Rank 2, and Rank 2 wins
    if (loser.rank === 1 && winner.rank === 2) {
        // Swap ranks and mark both as compared
        const updatedRankings = rankings.map(p => {
            if (p.id === winnerId) return { ...p, rank: 1, isCompared: true };
            if (p.id === loserId) return { ...p, rank: 2, isCompared: true };
            return p;
        }).sort((a, b) => a.rank - b.rank);

        return {
            rankings: updatedRankings,
            shouldPromote: false,
            promotedPlayerId: null
        };
    }

    // Lower-ranked player wins → Start promotion cycle
    if (winner.rank > loser.rank) {
        return {
            rankings: rankings,
            shouldPromote: true,
            promotedPlayerId: winnerId
        };
    }

    // Higher-ranked player wins → Just mark both as compared
    const updatedRankings = rankings.map(p => {
        if (p.id === winnerId || p.id === loserId) {
            return { ...p, isCompared: true };
        }
        return p;
    });

    return {
        rankings: updatedRankings,
        shouldPromote: false,
        promotedPlayerId: null
    };
}

/**
 * Handles a comparison during a "Promotion Cycle".
 * 
 * A promotion cycle occurs when a lower-ranked player beats a higher-ranked player.
 * The winner (promotedPlayer) acts as a "bubble" moving up the list until they lose.
 * 
 * Logic:
 * - Compare Promoted Player vs Player at `currentPromotionIndex`.
 * - If Promoted Player Wins: They continue moving up (index - 1).
 * - If Promoted Player Loses: They settle at `currentPromotionIndex + 1` (immediately below the player they just lost to).
 * 
 * @param {Array} rankings - Current rankings
 * @param {string} promotedPlayerId - ID of player being promoted
 * @param {number} currentPromotionIndex - Current index in promotion cycle
 * @param {string} selectedPlayerId - ID of player selected in this comparison
 * @returns {Object} { rankings, continuePromotion, newPromotionIndex }
 */
export function handlePromotionChoice(rankings, promotedPlayerId, currentPromotionIndex, selectedPlayerId) {
    const promotedPlayer = rankings.find(p => p.id === promotedPlayerId);
    const comparisonPlayer = rankings[currentPromotionIndex - 1];

    if (!promotedPlayer || !comparisonPlayer) {
        throw new Error('Invalid promotion state');
    }

    // Promoted player keeps winning
    if (selectedPlayerId === promotedPlayerId) {
        const nextPromotionIndex = currentPromotionIndex - 1;

        // Reached the top!
        if (nextPromotionIndex <= 0) {
            // Move promoted player to rank 1, shift others down
            const updatedRankings = movePlayerToRank(rankings, promotedPlayerId, 1);
            return {
                rankings: updatedRankings,
                continuePromotion: false,
                newPromotionIndex: null
            };
        }

        // Continue promotion cycle
        return {
            rankings: rankings,
            continuePromotion: true,
            newPromotionIndex: nextPromotionIndex
        };
    }

    // Promoted player lost → End promotion at current position
    // (The comparison player at currentPromotionIndex won, so we go below them)
    const updatedRankings = movePlayerToRank(rankings, promotedPlayerId, currentPromotionIndex + 1);
    return {
        rankings: updatedRankings,
        continuePromotion: false,
        newPromotionIndex: null
    };
}

/**
 * Moves a player to a new rank and adjusts all other ranks accordingly
 * 
 * @param {Array} rankings - Current rankings
 * @param {string} playerId - ID of player to move
 * @param {number} newRank - Target rank (1-indexed)
 * @returns {Array} Updated rankings array
 */
function movePlayerToRank(rankings, playerId, newRank) {
    const playerIndex = rankings.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return rankings;

    // Remove player from current position
    const [player] = rankings.splice(playerIndex, 1);

    // Insert at new position (newRank is 1-indexed, array is 0-indexed)
    rankings.splice(newRank - 1, 0, player);

    // Re-assign ranks to all players
    const updatedRankings = rankings.map((p, index) => ({
        ...p,
        rank: index + 1
    }));

    return updatedRankings;
}

/**
 * Saves wizard state to Supabase
 * 
 * @param {string} userId - User ID
 * @param {string} position - Position (QB, RB, etc.)
 * @param {string} scoringType - Scoring format (STD, PPR, HALF)
 * @param {Array} rankings - Rankings array with comparison state
 */
export async function saveWizardState(userId, position, scoringType, rankings) {
    try {
        // Extract just the IDs in order for ranked_ids
        const rankedIds = rankings
            .sort((a, b) => a.rank - b.rank)
            .map(p => p.id);

        // Build comparison_state object
        const comparisonState = {};
        rankings.forEach(p => {
            comparisonState[p.id] = {
                rank: p.rank,
                isCompared: p.isCompared
            };
        });

        // Upsert to user_rankings table
        const { error } = await supabase
            .from('user_rankings')
            .upsert({
                user_id: userId,
                position: position,
                scoring_type: scoringType,
                ranked_ids: rankedIds,
                comparison_state: comparisonState,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,position,scoring_type'
            });

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error saving wizard state:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Loads wizard state from Supabase
 * 
 * @param {string} userId - User ID
 * @param {string} position - Position
 * @param {string} scoringType - Scoring format
 * @returns {Object|null} Wizard state or null if none exists
 */
export async function loadWizardState(userId, position, scoringType) {
    try {
        const { data, error } = await supabase
            .from('user_rankings')
            .select('ranked_ids, comparison_state')
            .eq('user_id', userId)
            .eq('position', position)
            .eq('scoring_type', scoringType)
            .single();

        if (error) {
            // No existing state found
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }

        return {
            rankedIds: data.ranked_ids || [],
            comparisonState: data.comparison_state || {}
        };
    } catch (error) {
        console.error('Error loading wizard state:', error);
        return null;
    }
}

/**
 * Resets wizard state for a specific position/format
 * 
 * @param {string} userId - User ID
 * @param {string} position - Position
 * @param {string} scoringType - Scoring format
 */
export async function resetWizardState(userId, position, scoringType) {
    try {
        const { error } = await supabase
            .from('user_rankings')
            .update({
                comparison_state: {},
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('position', position)
            .eq('scoring_type', scoringType);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error resetting wizard state:', error);
        return { success: false, error: error.message };
    }
}
