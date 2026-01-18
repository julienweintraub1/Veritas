import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';

/**
 * A reusable button component with consistent styling.
 * 
 * @param {string} title - The text to display on the button.
 * @param {function} onPress - The function to call when pressed.
 * @param {object} style - Additional styles for the button container.
 * @param {boolean} outline - If true, renders an outlined button instead of filled.
 */
export default function AppButton({ title, onPress, style, outline = false }) {
    return (
        <TouchableOpacity
            style={[
                styles.button,
                outline ? styles.outlineButton : styles.filledButton,
                style
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[
                styles.text,
                outline ? styles.outlineText : styles.filledText
            ]}>
                {title}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        paddingVertical: 12,
        paddingHorizontal: spacing.l,
        borderRadius: borderRadius.m,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    filledButton: {
        backgroundColor: colors.primary,
    },
    outlineButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.primary,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
    filledText: {
        color: colors.white,
    },
    outlineText: {
        color: colors.primary,
    },
});
