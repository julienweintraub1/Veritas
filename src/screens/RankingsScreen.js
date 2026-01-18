import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function RankingsScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Rankings Feature Coming Soon!</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
    },
});
