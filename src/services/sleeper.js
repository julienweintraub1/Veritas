import { supabase } from './supabase';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';
const PROJECTIONS_API_URL = 'https://projections-api.vercel.app/api/projections';

/**
 * Fetches the current NFL state (season and week)
 */
const fetchNFLState = async () => {
    try {
        const res = await fetch(`${SLEEPER_BASE_URL}/state/nfl`);
        return await res.json();
    } catch (error) {
        console.error('Error fetching NFL state:', error);
        return { season: '2024', week: 1 }; // Fallback
    }
};

/**
 * Fetches actual weekly stats from Sleeper
 */
const fetchWeeklyStats = async (season, week, onProgress) => {
    try {
        if (onProgress) onProgress(`Fetching stats for ${season} Week ${week}...`);
        const res = await fetch(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}/${week}`);
        const stats = await res.json();

        // Map: SleeperID -> { std, ppr, half }
        const statsMap = {};
        Object.keys(stats).forEach(id => {
            const s = stats[id];
            statsMap[id] = {
                std: s.pts_std || 0,
                ppr: s.pts_ppr || 0,
                half: s.pts_half_ppr || 0
            };
        });
        return statsMap;
    } catch (error) {
        console.error('Error fetching stats:', error);
        return {};
    }
};

/**
 * Fetches real projections from our Vercel API
 */
const fetchRealProjections = async (onProgress) => {
    try {
        if (onProgress) onProgress('Fetching real projections from API...');
        const response = await fetch(PROJECTIONS_API_URL);
        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'API failed');

        const projMap = {};
        data.projections.forEach(p => {
            const nameKey = p.name.toLowerCase();
            projMap[nameKey] = p.projections;
        });

        return projMap;
    } catch (error) {
        console.error('Projections API error:', error);
        if (onProgress) onProgress(`API Error: ${error.message}`);
        return null;
    }
};

/**
 * Main sync function: Fetches players, projections, and actual stats
 */
export const syncPlayersToSupabase = async (onProgress) => {
    try {
        const nflState = await fetchNFLState();

        // 1. Fetch Players from Sleeper
        if (onProgress) onProgress('Fetching player list from Sleeper...');
        const playersRes = await fetch(`${SLEEPER_BASE_URL}/players/nfl`);
        const allPlayers = await playersRes.json();

        // 2. Fetch Projections
        const projMap = await fetchRealProjections(onProgress);

        // 3. Fetch Actual Stats
        const statsMap = await fetchWeeklyStats(nflState.season, nflState.week, onProgress);

        if (onProgress) onProgress('Processing data...');

        const RELEVANT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

        const playersToInsert = Object.values(allPlayers)
            .filter(p =>
                p.active &&
                RELEVANT_POSITIONS.includes(p.position) &&
                (p.team || p.position === 'DEF')
            )
            .map(p => {
                let fullName = `${p.first_name} ${p.last_name}`.trim().toLowerCase();
                if (p.position === 'DEF') fullName = p.first_name.toLowerCase();

                const proj = projMap?.[fullName] || { std: 0, ppr: 0, half: 0 };
                const actual = statsMap[p.player_id] || { std: 0, ppr: 0, half: 0 };

                return {
                    id: p.player_id,
                    first_name: p.first_name,
                    last_name: p.last_name,
                    position: p.position,
                    team: p.team || 'FA',
                    active: p.active,
                    projections: proj,
                    stats: actual, // Keep for legacy if needed
                    current_week_stats: actual, // CORRECT column for RankingsScreen
                    stats_week: nflState.week // CORRECT column for validation
                };
            });

        const total = playersToInsert.length;
        if (onProgress) onProgress(`Updating ${total} players with Live Scores...`);

        const BATCH_SIZE = 500;
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = playersToInsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('nfl_players')
                .upsert(batch, { onConflict: 'id' });

            if (error) throw error;
            if (onProgress) onProgress(`Uploaded ${Math.min(i + BATCH_SIZE, total)} / ${total}`);
        }

        if (onProgress) onProgress('Done! Live Scores & Projections updated.');
        return { success: true, count: total };

    } catch (error) {
        console.error('Sync error:', error);
        if (onProgress) onProgress(`Error: ${error.message}`);
        return { success: false, error };
    }
};
