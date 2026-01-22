import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

/**
 * Fetches the Win/Loss/Tie record for a user
 * @param {string} userId 
 * @returns {Promise<{wins: number, losses: number, ties: number}>}
 */
export async function getUserRecord(userId) {
    try {
        // Fetch record and profile in parallel
        const [recordRes, profileRes] = await Promise.all([
            supabase.rpc('get_user_record', { target_user_id: userId }),
            supabase.from('profiles').select('username').eq('id', userId).single()
        ]);

        if (recordRes.error) throw recordRes.error;

        const record = recordRes.data || { wins: 0, losses: 0, ties: 0 };
        const username = profileRes.data?.username || 'User';

        return { ...record, username };
    } catch (error) {
        console.error('Error fetching user record:', error);
        return { wins: 0, losses: 0, ties: 0, username: 'User' };
    }
}
