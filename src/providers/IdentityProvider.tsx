import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { EventType } from '@/lib/constants';
import { createSignedEvent } from '@/lib/crypto/events';
import { appendEvent, DuplicateEventError } from '@/lib/db/events';
import {
  getProfile,
  updateProfile,
  upsertLocalIdentity,
  type Profile,
  type ProfileFields,
} from '@/lib/db/profiles';
import { importAvatarImage } from '@/lib/media/store';
import {
  broadcastProfileUpdate,
  type ProfileMediaOffer,
} from '@/lib/profile/sync';
import {
  createIdentity as createIdentityKeys,
  formatRecoveryKey,
  loadIdentity,
  restoreIdentity as restoreIdentityKeys,
} from '@/lib/identity/store';
import type { KeyPair } from '@/lib/crypto/identity';

type IdentityState = {
  ready: boolean;
  /** True when a keypair exists locally (may still need a display name). */
  hasKeys: boolean;
  /** True when keys + display name are ready for the main app. */
  isAuthenticated: boolean;
  publicKey: string | null;
  recoveryKeyFormatted: string | null;
  profile: Profile | null;
  error: string | null;
  refresh: () => Promise<void>;
  register: (displayName: string) => Promise<{ recoveryKey: string }>;
  login: (recoveryKey: string) => Promise<{ needsProfile: boolean }>;
  completeProfile: (displayName: string) => Promise<void>;
  saveProfile: (fields: ProfileFields) => Promise<void>;
};

const IdentityContext = createContext<IdentityState | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyIdentity = useCallback(
    async (identity: KeyPair) => {
      await upsertLocalIdentity(db, identity.publicKey);
      const loadedProfile = await getProfile(db, identity.publicKey);
      setPublicKey(identity.publicKey);
      setSecretKey(identity.secretKey);
      setProfile(loadedProfile);
      setError(null);
    },
    [db],
  );

  const refresh = useCallback(async () => {
    try {
      const identity = await loadIdentity();
      if (!identity) {
        setPublicKey(null);
        setSecretKey(null);
        setProfile(null);
        setError(null);
        setReady(true);
        return;
      }
      await applyIdentity(identity);
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load identity');
      setReady(true);
    }
  }, [applyIdentity]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveProfile = useCallback(
    async (fields: ProfileFields) => {
      if (!publicKey || !secretKey) {
        throw new Error('Identity not ready');
      }

      const current = await getProfile(db, publicKey);
      if (!current) {
        throw new Error('Profile not found');
      }

      let avatarUri = fields.avatarUri;
      let avatarCid = fields.avatarCid;
      let mediaOffer: ProfileMediaOffer | null = null;

      if (fields.avatarUri !== undefined) {
        if (fields.avatarUri === null) {
          avatarCid = null;
        } else if (
          fields.avatarUri !== current.avatarUri ||
          !fields.avatarUri.includes('howfana-media')
        ) {
          const imported = await importAvatarImage(db, fields.avatarUri);
          avatarUri = imported.localUri;
          avatarCid = imported.cid;
          mediaOffer = {
            cid: imported.cid,
            size: imported.size,
            mime: imported.mime,
            chunkSize: imported.chunkSize,
            chunkCount: imported.chunkCount,
          };
        }
      }

      const updated = await updateProfile(db, publicKey, {
        ...fields,
        avatarUri,
        avatarCid,
      });
      const event = await createSignedEvent(
        {
          type: EventType.ProfileUpdate,
          author: publicKey,
          timestamp: updated.updatedAt,
          payload: {
            displayName: updated.displayName,
            avatarUri: updated.avatarCid ? null : updated.avatarUri,
            avatarCid: updated.avatarCid,
            about: updated.about,
          },
        },
        secretKey,
      );

      try {
        await appendEvent(db, event);
      } catch (err) {
        if (!(err instanceof DuplicateEventError)) {
          throw err;
        }
      }

      await broadcastProfileUpdate(event, mediaOffer);
      setProfile(updated);
    },
    [db, publicKey, secretKey],
  );

  const register = useCallback(
    async (displayName: string) => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        throw new Error('Display name required');
      }

      let identity = await loadIdentity();
      if (!identity) {
        identity = await createIdentityKeys();
      }
      await applyIdentity(identity);

      const updated = await updateProfile(db, identity.publicKey, {
        displayName: trimmed,
      });
      const event = await createSignedEvent(
        {
          type: EventType.ProfileUpdate,
          author: identity.publicKey,
          timestamp: updated.updatedAt,
          payload: {
            displayName: updated.displayName,
            avatarUri: updated.avatarUri,
            about: updated.about,
          },
        },
        identity.secretKey,
      );
      try {
        await appendEvent(db, event);
      } catch (err) {
        if (!(err instanceof DuplicateEventError)) {
          throw err;
        }
      }
      setProfile(updated);

      return { recoveryKey: formatRecoveryKey(identity.secretKey) };
    },
    [applyIdentity, db],
  );

  const login = useCallback(
    async (recoveryKey: string) => {
      const identity = await restoreIdentityKeys(recoveryKey);
      await applyIdentity(identity);
      const loaded = await getProfile(db, identity.publicKey);
      return { needsProfile: !loaded?.displayName?.trim() };
    },
    [applyIdentity, db],
  );

  const completeProfile = useCallback(
    async (displayName: string) => {
      await saveProfile({ displayName: displayName.trim() });
    },
    [saveProfile],
  );

  const hasKeys = Boolean(publicKey && secretKey);
  const isAuthenticated = Boolean(hasKeys && profile?.displayName?.trim());

  const value = useMemo(
    () => ({
      ready,
      hasKeys,
      isAuthenticated,
      publicKey,
      recoveryKeyFormatted: secretKey ? formatRecoveryKey(secretKey) : null,
      profile,
      error,
      refresh,
      register,
      login,
      completeProfile,
      saveProfile,
    }),
    [
      ready,
      hasKeys,
      isAuthenticated,
      publicKey,
      secretKey,
      profile,
      error,
      refresh,
      register,
      login,
      completeProfile,
      saveProfile,
    ],
  );

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityState {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentity must be used within IdentityProvider');
  }
  return ctx;
}
