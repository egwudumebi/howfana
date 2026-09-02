import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertOptions = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type AlertApi = {
  alert: (title: string, message?: string, buttons?: AlertButton[]) => void;
};

const AlertContext = createContext<AlertApi | null>(null);

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setOptions(null);
  }, []);

  const alert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[]) => {
      setOptions({
        title,
        message,
        buttons: buttons?.length
          ? buttons
          : [{ text: 'OK', style: 'default' }],
      });
      setVisible(true);
    },
    [],
  );

  const value = useMemo(() => ({ alert }), [alert]);
  const buttons = options?.buttons ?? [];
  const stacked = buttons.length > 2;

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{options?.title}</Text>
            {options?.message ? (
              <Text style={styles.message}>{options.message}</Text>
            ) : null}
            <View style={[styles.actions, stacked && styles.actionsStacked]}>
              {buttons.map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isPrimary =
                  !isCancel &&
                  !isDestructive &&
                  (buttons.length === 1 || index === buttons.length - 1);

                return (
                  <Pressable
                    key={`${btn.text}-${index}`}
                    style={[
                      styles.btn,
                      stacked && styles.btnStacked,
                      isPrimary && styles.btnPrimary,
                      isCancel && styles.btnCancel,
                      isDestructive && styles.btnDestructive,
                      !stacked && buttons.length > 1 && styles.btnRow,
                    ]}
                    onPress={() => {
                      dismiss();
                      btn.onPress?.();
                    }}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        isPrimary && styles.btnTextPrimary,
                        isCancel && styles.btnTextCancel,
                        isDestructive && styles.btnTextDestructive,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAppAlert(): AlertApi {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAppAlert must be used within AppAlertProvider');
  }
  return ctx;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(11, 14, 20, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.chrome,
      borderRadius: 16,
      paddingTop: 22,
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.title,
      textAlign: 'center',
    },
    message: {
      fontSize: 15,
      lineHeight: 21,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 4,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    btn: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    btnRow: {
      flex: 1,
    },
    btnStacked: {
      width: '100%',
    },
    btnPrimary: {
      backgroundColor: colors.accent,
    },
    btnCancel: {
      backgroundColor: colors.surface,
    },
    btnDestructive: {
      backgroundColor: colors.accentSoft,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    btnTextPrimary: {
      color: '#fff',
    },
    btnTextCancel: {
      color: colors.muted,
    },
    btnTextDestructive: {
      color: colors.danger,
    },
  });
}
