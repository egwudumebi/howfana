import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  darkColors,
  lightColors,
  THEME_PREF_KEY,
  type ThemeColors,
  type ThemePreference,
} from '@/theme/colors';

type ThemeContextValue = {
  colors: ThemeColors;
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const webMemory = new Map<string, string>();

function asThemePreference(value: string | null | undefined): ThemePreference | null {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }
  return null;
}

async function readPref(): Promise<ThemePreference | null> {
  try {
    if (Platform.OS === 'web') {
      return asThemePreference(
        globalThis.localStorage?.getItem(THEME_PREF_KEY) ??
          webMemory.get(THEME_PREF_KEY) ??
          null,
      );
    }
    return asThemePreference(await SecureStore.getItemAsync(THEME_PREF_KEY));
  } catch {
    return null;
  }
}

async function writePref(pref: ThemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(THEME_PREF_KEY, pref);
      } catch {
        webMemory.set(THEME_PREF_KEY, pref);
      }
      return;
    }
    await SecureStore.setItemAsync(THEME_PREF_KEY, pref);
  } catch {
    // ignore persistence failures
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void readPref().then((stored) => {
      if (stored === 'system' || stored === 'light' || stored === 'dark') {
        setPreferenceState(stored);
      }
      setHydrated(true);
    });
  }, []);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    void writePref(pref);
  };

  const resolved: 'light' | 'dark' =
    preference === 'system'
      ? system === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  const colors = resolved === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({
      colors,
      preference: hydrated ? preference : 'system',
      resolved,
      setPreference,
    }),
    [colors, preference, resolved, hydrated],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}
