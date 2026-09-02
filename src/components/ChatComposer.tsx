import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SoftPressable } from '@/components/SoftPressable';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type ChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onOpenGallery: () => void;
  onOpenCamera: () => void;
  onOpenDocument?: () => void;
  onVoiceNote?: () => void;
  sending?: boolean;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onOpenGallery,
  onOpenCamera,
  onOpenDocument,
  onVoiceNote,
  sending = false,
  placeholder = 'Message',
}: ChatComposerProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [attachOpen, setAttachOpen] = useState(false);
  const hasText = value.trim().length > 0;

  const closeAttach = () => setAttachOpen(false);

  const runAttachment = (action: () => void) => {
    closeAttach();
    action();
  };

  const attachmentOptions = [
    {
      id: 'gallery',
      label: 'Gallery',
      icon: 'images-outline' as const,
      color: '#9B59B6',
      onPress: () => runAttachment(onOpenGallery),
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: 'camera-outline' as const,
      color: '#E74C3C',
      onPress: () => runAttachment(onOpenCamera),
    },
    {
      id: 'document',
      label: 'Document',
      icon: 'document-text-outline' as const,
      color: '#5D6D7E',
      onPress: () => {
        closeAttach();
        onOpenDocument?.();
      },
    },
  ];

  return (
    <View style={styles.wrap}>
      {attachOpen ? (
        <View style={styles.attachTray}>
          {attachmentOptions.map((opt) => (
            <SoftPressable
              key={opt.id}
              style={styles.attachItem}
              onPress={opt.onPress}
            >
              <View style={[styles.attachIcon, { backgroundColor: opt.color }]}>
                <Ionicons name={opt.icon} size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>{opt.label}</Text>
            </SoftPressable>
          ))}
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <SoftPressable
          style={styles.attachBtn}
          onPress={() => setAttachOpen((open) => !open)}
          hitSlop={6}
        >
          <Ionicons
            name={attachOpen ? 'close' : 'add'}
            size={attachOpen ? 22 : 26}
            color={colors.muted}
          />
        </SoftPressable>

        <View style={styles.inputShell}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={600}
          />
          <SoftPressable style={styles.emojiBtn} hitSlop={8}>
            <Ionicons name="happy-outline" size={22} color={colors.muted} />
          </SoftPressable>
        </View>

        <SoftPressable
          style={styles.sideBtn}
          onPress={() => runAttachment(onOpenCamera)}
          hitSlop={6}
        >
          <Ionicons name="camera-outline" size={24} color={colors.muted} />
        </SoftPressable>

        {hasText ? (
          <SoftPressable
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            disabled={sending}
            onPress={onSend}
            hitSlop={6}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </SoftPressable>
        ) : (
          <SoftPressable
            style={styles.sideBtn}
            onPress={onVoiceNote}
            hitSlop={6}
          >
            <Ionicons name="mic-outline" size={24} color={colors.muted} />
          </SoftPressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
      backgroundColor: colors.chrome,
      paddingBottom: Space.sm,
    },
    composerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    attachBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    inputShell: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.surface,
      borderRadius: Radius.pill,
      paddingLeft: 14,
      paddingRight: 4,
      paddingVertical: 4,
    },
    input: {
      flex: 1,
      minHeight: 34,
      maxHeight: 112,
      paddingVertical: 6,
      paddingRight: 4,
      color: colors.text,
      fontSize: 16,
      lineHeight: 20,
    },
    emojiBtn: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 1,
    },
    sideBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    sendBtnDisabled: {
      opacity: 0.55,
    },
    attachTray: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: Space.lg,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    attachItem: {
      alignItems: 'center',
      gap: 6,
      minWidth: 72,
    },
    attachIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachLabel: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: '500',
    },
  });
}
