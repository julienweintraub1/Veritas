import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../services/supabase';

import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import FriendsScreen from '../screens/FriendsScreen';
import MatchupScreen from '../screens/MatchupScreen';
import RankingsScreen from '../screens/RankingsScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    const [session, setSession] = useState(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
    }, []);

    return (
        <NavigationContainer>
            <Stack.Navigator>
                {session ? (
                    // User is signed in
                    <>
                        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Veritas Football' }} />
                        <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: 'My Friends' }} />
                        <Stack.Screen name="Matchup" component={MatchupScreen} options={{ title: 'Matchup' }} />
                        <Stack.Screen name="Rankings" component={RankingsScreen} options={{ title: 'My Rankings' }} />
                    </>
                ) : (
                    // User is not signed in
                    <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
