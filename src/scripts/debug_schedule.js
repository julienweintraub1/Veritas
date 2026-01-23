// src/scripts/debug_schedule.js
const { fetchNFLState, getCurrentWeekGames } = require('../services/liveScoring');

// Mock fetch for Node environment if needed, or assume we run in environment with fetch
// Node 18+ has fetch built-in.

async function debug() {
    console.log("--- Debugging Opponent Data ---");

    console.log("1. Fetching NFL State...");
    const state = await fetchNFLState();
    console.log("State:", JSON.stringify(state, null, 2));

    if (!state) {
        console.error("Failed to fetch state.");
        return;
    }

    console.log(`2. Fetching Games for Week ${state.week}...`);
    const games = await getCurrentWeekGames(state.week);
    console.log(`Games found: ${games.length}`);

    if (games.length > 0) {
        console.log("First Game Sample:", JSON.stringify(games[0], null, 2));
    } else {
        console.warn("No games found! This explains why opponents are missing.");
    }
}

debug();
