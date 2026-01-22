import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/layout';
import AppButton from '../components/AppButton';

export default function ChatScreen({ route, navigation }) {
    const { friend } = route.params; // Expecting 'friend' object with id and username
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState(null);
    const flatListRef = useRef(null);

    useEffect(() => {
        setupChat();
    }, []);

    const setupChat = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);
        fetchMessages(user.id);

        // Real-time subscription
        const channel = supabase
            .channel('public:messages')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${user.id}`, // Listen for incoming
                },
                (payload) => {
                    if (payload.new.sender_id === friend.id) {
                        setMessages(prev => [payload.new, ...prev]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    };

    const fetchMessages = async (myId) => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        else setMessages(data || []);
        setLoading(false);
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !currentUserId) return;

        const msgContent = newMessage.trim();
        setNewMessage('');

        // Optimistic update
        const tempMsg = {
            id: Math.random().toString(),
            sender_id: currentUserId,
            receiver_id: friend.id,
            content: msgContent,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [tempMsg, ...prev]);

        const { error } = await supabase
            .from('messages')
            .insert({
                sender_id: currentUserId,
                receiver_id: friend.id,
                content: msgContent
            });

        if (error) {
            console.error('Send error:', error);
            // Could remove optimistic update here if needed
        }
    };

    const renderItem = ({ item }) => {
        const isMe = item.sender_id === currentUserId;
        return (
            <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
                <Text style={[styles.msgText, isMe ? styles.myMsgText : styles.theirMsgText]}>
                    {item.content}
                </Text>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
            {loading ? (
                <View style={styles.center}><ActivityIndicator /></View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    inverted
                    contentContainerStyle={styles.listContent}
                />
            )}

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textSecondary}
                />
                <AppButton
                    title="Send"
                    onPress={sendMessage}
                    style={styles.sendBtn}
                    disabled={!newMessage.trim()}
                />
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: spacing.m,
    },
    bubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
        marginBottom: 8,
    },
    myBubble: {
        alignSelf: 'flex-end',
        backgroundColor: colors.primary,
        borderBottomRightRadius: 2,
    },
    theirBubble: {
        alignSelf: 'flex-start',
        backgroundColor: '#E0E0E0',
        borderBottomLeftRadius: 2,
    },
    msgText: {
        fontSize: 16,
    },
    myMsgText: {
        color: colors.white,
    },
    theirMsgText: {
        color: colors.text,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: spacing.s,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
    },
    input: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: 20,
        paddingHorizontal: spacing.m,
        paddingVertical: 10,
        marginRight: spacing.s,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sendBtn: {
        width: 70,
        height: 'auto',
        paddingVertical: 10,
    }
});
