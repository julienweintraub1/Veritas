import { supabase } from './supabase';
import { fetchNFLState } from './liveScoring';

/**
 * Distribution Service - Veritas Football
 * 
 * Uses pairwise comparison logic from Dynasty Wizard adapted for position-specific rankings.
 * Each slot compares top player from User A's position list vs User B's position list.
 */

/**
 * Distributes players for a specific position's slots using pairwise logic.
 * 
 * Logic:
 * - Compares the best available player from each user (top of their remaining list).
 * - If a Conflict occurs (both want the same player):
 *   - The player is "burned" (removed from both pools).
 *   - The slot is NOT filled; we loop again to fill the current slot with the next best players.
 *   - This ensures slots are filled with valid, non-conflicting players.
 * 
 * @param {Array} user1Rankings - User 1's ranked player IDs for this position
 * @param {Array} user2Rankings - User 2's ranked player IDs for this position  
 * @param {Object} playerMap - Map of player ID to player object
 * @param {Set} assigned - Set of player IDs already assigned (shared across all slots)
 * @param {number} slotCount - Number of slots to fill for this position
 * @param {string} position - Position name (QB, RB, etc.)
 * @param {string} scoringType - Scoring format
 * @param {number} currentWeek - Current NFL week to validate stats
 * @returns {Object} { slotsA, slotsB } arrays of distributed slots
 */
function distributePosition(user1Rankings, user2Rankings, playerMap, assigned, slotCount, position, scoringType, currentWeek) {
    const slotsA = [];
    const slotsB = [];

    // Create pools of available players (not yet assigned)
    let poolA = user1Rankings.filter(id => !assigned.has(id));
    let poolB = user2Rankings.filter(id => !assigned.has(id));

    const formatKey = scoringType.toLowerCase();

    let filled = 0;
    while (filled < slotCount) {
        const playerAId = poolA[0] || null;
        const playerBId = poolB[0] || null;

        const playerA = playerAId ? playerMap[playerAId] : null;
        const playerB = playerBId ? playerMap[playerBId] : null;

        // If either user has no player available, both get empty slot
        if (!playerA || !playerB) {
            slotsA.push({
                position,
                player: null,
                projected: 0,
                live: 0,
                // conflict: false, // Removed conflict prop
                empty: true
            });
            slotsB.push({
                position,
                player: null,
                projected: 0,
                live: 0,
                // conflict: false,
                empty: true
            });
            filled++;
            continue;
        }

        // If both users have the SAME player (conflict) -> SKIP
        if (playerA.id === playerB.id) {
            assigned.add(playerA.id);
            // Remove from both pools (BURN the player)
            poolA = poolA.filter(id => id !== playerA.id);
            poolB = poolB.filter(id => id !== playerB.id);

            // Do NOT increment 'filled'. We try again for this slot with next players.
            // Future requirement: Store these skipped players for display elsewhere.
            continue;
        }

        // No conflict - each user gets their top player
        assigned.add(playerA.id);
        assigned.add(playerB.id);

        // Remove BOTH assigned players from BOTH pools
        poolA = poolA.filter(id => id !== playerA.id && id !== playerB.id);
        poolB = poolB.filter(id => id !== playerB.id && id !== playerA.id);

        // Calculate Ranks (1-based index from original position list)
        const rankA = user1Rankings.indexOf(playerA.id) + 1;
        const rankB = user2Rankings.indexOf(playerB.id) + 1;

        slotsA.push({
            position,
            player: playerA,
            rank: rankA,
            projected: playerA.projections?.[formatKey] || 0,
            live: (playerA.stats_week === currentWeek) ? (playerA.current_week_stats?.[formatKey] || 0) : 0,
            conflict: false
        });
        slotsB.push({
            position,
            player: playerB,
            rank: rankB,
            projected: playerB.projections?.[formatKey] || 0,
            live: (playerB.stats_week === currentWeek) ? (playerB.current_week_stats?.[formatKey] || 0) : 0,
            conflict: false
        });
        filled++;
    }

    return { slotsA, slotsB };
}

/**
 * Fetches rankings and player data for a matchup, then distributes lineups
 * 
 * @param {string} user1Id - First user ID
 * @param {string} user2Id - Second user ID
 * @param {Object} rosterSettings - Matchup roster settings (e.g., {QB: 1, RB: 2, ...})
 * @param {string} scoringType - Scoring format (STD, PPR, HALF)
 * @returns {Object} { lineupA, lineupB, totalA, totalB }
 */
export async function distributeMatchupLineups(user1Id, user2Id, rosterSettings, scoringType = 'STD') {
    try {
        // 0. Fetch current NFL week
        const state = await fetchNFLState();
        const currentWeek = state.week;

        // 1. Fetch both users' rankings for this scoring type
        const { data: user1Rankings, error: error1 } = await supabase
            .from('user_rankings')
            .select('position, ranked_ids')
            .eq('user_id', user1Id)
            .eq('scoring_type', scoringType);

        const { data: user2Rankings, error: error2 } = await supabase
            .from('user_rankings')
            .select('position, ranked_ids')
            .eq('user_id', user2Id)
            .eq('scoring_type', scoringType);

        if (error1) throw error1;
        if (error2) throw error2;

        // 2. Build position-specific ranking maps
        const rankings1 = {};
        const rankings2 = {};

        (user1Rankings || []).forEach(r => {
            rankings1[r.position] = r.ranked_ids || [];
        });

        (user2Rankings || []).forEach(r => {
            rankings2[r.position] = r.ranked_ids || [];
        });

        // 3. Collect all unique player IDs needed
        const allPlayerIds = new Set();

        Object.keys(rosterSettings).forEach(position => {
            (rankings1[position] || []).forEach(id => allPlayerIds.add(id));
            (rankings2[position] || []).forEach(id => allPlayerIds.add(id));
        });

        // 4. Fetch all player data
        if (allPlayerIds.size === 0) {
            console.warn('⚠️ No players to fetch - users may not have rankings yet');
            return {
                lineupA: [],
                lineupB: [],
                totalA: 0,
                totalB: 0,
                success: true
            };
        }

        const { data: players, error: playersError } = await supabase
            .from('nfl_players')
            .select('*')
            .in('id', Array.from(allPlayerIds));

        if (playersError) throw playersError;

        // 5. Create player lookup map
        const playerMap = {};
        (players || []).forEach(player => {
            playerMap[player.id] = player;
        });

        // 6. Distribute using pairwise logic - shared assigned set across all positions
        const assigned = new Set();
        const lineupA = [];
        const lineupB = [];

        // Define standard order to match MatchupScreen
        const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DEF'];

        // Process each position's slots in STRICT ORDER
        POSITIONS.forEach(position => {
            const count = rosterSettings[position] || 0;
            if (count === 0) return;

            const user1Ranks = rankings1[position] || [];
            const user2Ranks = rankings2[position] || [];

            const { slotsA, slotsB } = distributePosition(
                user1Ranks,
                user2Ranks,
                playerMap,
                assigned,
                count,
                position,
                scoringType,
                currentWeek
            );

            lineupA.push(...slotsA);
            lineupB.push(...slotsB);
        });

        // 7. Calculate totals using LIVE scores
        const totalA = lineupA.reduce((sum, slot) => sum + (slot.live || 0), 0);
        const totalB = lineupB.reduce((sum, slot) => sum + (slot.live || 0), 0);

        return {
            lineupA,
            lineupB,
            totalA,
            totalB,
            success: true
        };

    } catch (error) {
        console.error('❌ Distribution error:', error);
        return {
            lineupA: [],
            lineupB: [],
            totalA: 0,
            totalB: 0,
            success: false,
            error: error.message
        };
    }
}
