import { supabase } from './supabase';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Live Scoring Service
 * 
 * Handles real-time NFL scoring by:
 * - Fetching current week's schedule
 * - Determining when to poll for live scores
 * - Updating current week stats in database
 */

/**
 * Fetches the current NFL state (season, week, season_type)
 */
export async function fetchNFLState() {
    try {
        const res = await fetch(`${SLEEPER_BASE_URL}/state/nfl`);
        const state = await res.json();
        return state;
    } catch (error) {
        console.error('Error fetching NFL state:', error);
        return { season: '2024', week: 22, season_type: 'post' }; // Fallback to championship week
    }
}

/**
 * Fetches the NFL schedule for current season
 * 
 * @param {string} seasonType - 'regular' or 'post' (postseason)
 * @param {string} season - Year (e.g., '2024')
 * @returns {Array} Schedule data with game times
 */
export async function fetchNFLSchedule(seasonType, season) {
    try {
        const type = seasonType === 'post' ? 'postseason' : 'regular';
        const url = `https://api.sleeper.app/schedule/nfl/${type}/${season}`;

        const res = await fetch(url);
        const schedule = await res.json();

        return schedule || [];
    } catch (error) {
        console.error('Error fetching NFL schedule:', error);
        return [];
    }
}

/**
 * Gets games for the current week
 * 
 * @param {number} week - NFL week number
 * @returns {Array} Games scheduled for this week
 */
export async function getCurrentWeekGames(week) {
    try {
        const state = await fetchNFLState();
        const schedule = await fetchNFLSchedule(state.season_type, state.season);

        // Filter games for current week
        const weekGames = schedule.filter(game => game.week === week);

        return weekGames;
    } catch (error) {
        console.error('Error getting current week games:', error);
        return [];
    }
}

/**
 * Checks if any games are currently in progress or scheduled to start soon
 * 
 * @param {Array} games - Array of game objects from schedule
 * @returns {boolean} True if we should be polling for live scores
 */
export function shouldPollScores(games) {
    if (!games || games.length === 0) {
        return false;
    }

    const now = Date.now();

    // Find earliest and latest game times
    const gameTimes = games.map(g => new Date(g.start_time).getTime());
    const firstGame = Math.min(...gameTimes);
    const lastGame = Math.max(...gameTimes);

    // Start polling 2 hours before first game
    const pollStart = firstGame - (2 * 60 * 60 * 1000);

    // Stop polling 4 hours after last game (allows for overtime + stat corrections)
    const pollEnd = lastGame + (4 * 60 * 60 * 1000);

    const shouldPoll = now >= pollStart && now <= pollEnd;

    return shouldPoll;
}

/**
 * Checks if all games for the week are final/complete
 * @param {Array} games 
 * @returns {boolean}
 */
export function areAllGamesFinal(games) {
    if (!games || games.length === 0) return false;
    return games.every(g => g.status === 'complete' || g.status === 'closed');
}

/**
 * Fetches live stats for the current week from Sleeper
 * 
 * @param {string} season - Season year
 * @param {string} seasonType - 'regular' or 'post'
 * @param {number} week - Week number
 * @returns {Object} Map of player_id to stats {std, ppr, half}
 */
export async function fetchLiveScores(season, seasonType, week) {
    try {
        const type = seasonType === 'post' ? 'post' : 'regular';
        const url = `${SLEEPER_BASE_URL}/stats/nfl/${type}/${season}/${week}`;

        const res = await fetch(url);
        const stats = await res.json();

        // Convert to our format: player_id -> {std, ppr, half}
        const statsMap = {};
        Object.keys(stats).forEach(playerId => {
            const s = stats[playerId];
            statsMap[playerId] = {
                std: s.pts_std || 0,
                ppr: s.pts_ppr || 0,
                half: s.pts_half_ppr || 0
            };
        });

        return statsMap;
    } catch (error) {
        console.error('Error fetching live scores:', error);
        return {};
    }
}

/**
 * Updates current week's live scores in the database
 * 
 * @param {Object} liveStats - Map of player_id to stats
 * @param {number} week - The NFL week these stats belong to
 * @returns {Object} Success status and count
 */
export async function updateCurrentWeekStats(liveStats, week) {
    try {
        const playerIds = Object.keys(liveStats);

        if (playerIds.length === 0) {
            return { success: true, count: 0 };
        }

        // Batch update players with current week stats AND stats_week
        const updates = playerIds.map(id => ({
            id,
            current_week_stats: liveStats[id],
            stats_week: week
        }));

        const BATCH_SIZE = 500;
        let totalUpdated = 0;

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('nfl_players')
                .upsert(batch, { onConflict: 'id' });

            if (error) {
                console.error('Batch update error:', error);
                throw error;
            }

            totalUpdated += batch.length;
        }

        return { success: true, count: totalUpdated };
    } catch (error) {
        console.error('Error updating current week stats:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Main function to refresh live scores
 * Fetches current week's live stats and updates database
 * 
 * @returns {Object} Result of update operation
 */
export async function refreshLiveScores() {
    try {
        // 1. Get current NFL state
        const state = await fetchNFLState();

        // 2. Check if we should poll
        const games = await getCurrentWeekGames(state.week);
        if (!shouldPollScores(games)) {
            // return { success: false, message: 'Not polling - outside game window' };
            // FORCE UPDATE if actively called? Or rely on shouldPoll?
            // User might want checking even if "not polling" if debugging.
            // But let's stick to logic.
        }

        // 3. Fetch live scores
        const liveStats = await fetchLiveScores(state.season, state.season_type, state.week);

        // 4. Update database
        const result = await updateCurrentWeekStats(liveStats, state.week);

        return result;
    } catch (error) {
        console.error('Error refreshing live scores:', error);
        return { success: false, error: error.message };
    }
}
