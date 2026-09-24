import type { SQLiteDatabase } from 'expo-sqlite';

import { getMediaObject } from '@/lib/media/store';

export type ProfileAbout = {
  bio: string;
  education: string;
  dateOfBirth: string;
  stateOfOrigin: string;
  skills: string;
  jobs: string;
};

export type Profile = {
  publicKey: string;
  displayName: string;
  avatarUri: string | null;
  avatarCid: string | null;
  updatedAt: number;
  about: ProfileAbout;
};

export const EMPTY_ABOUT: ProfileAbout = {
  bio: '',
  education: '',
  dateOfBirth: '',
  stateOfOrigin: '',
  skills: '',
  jobs: '',
};

export function normalizeAbout(raw: unknown): ProfileAbout {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ABOUT };
  const o = raw as Record<string, unknown>;
  return {
    bio: typeof o.bio === 'string' ? o.bio : '',
    education: typeof o.education === 'string' ? o.education : '',
    dateOfBirth: typeof o.dateOfBirth === 'string' ? o.dateOfBirth : '',
    stateOfOrigin: typeof o.stateOfOrigin === 'string' ? o.stateOfOrigin : '',
    skills: typeof o.skills === 'string' ? o.skills : '',
    jobs: typeof o.jobs === 'string' ? o.jobs : '',
  };
}

export function parseAboutJson(raw: string | null | undefined): ProfileAbout {
  if (!raw) return { ...EMPTY_ABOUT };
  try {
    return normalizeAbout(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY_ABOUT };
  }
}

export type ProfileFields = {
  displayName?: string;
  avatarUri?: string | null;
  avatarCid?: string | null;
  about?: Partial<ProfileAbout>;
};

/** Resolve a displayable avatar URI from local path and/or mesh CID. */
export async function resolveAvatarUri(
  db: SQLiteDatabase,
  avatarUri: string | null | undefined,
  avatarCid: string | null | undefined,
): Promise<string | null> {
  if (avatarUri?.includes('howfana-media')) {
    return avatarUri;
  }
  if (avatarCid) {
    const media = await getMediaObject(db, avatarCid);
    if (media?.status === 'complete' && media.localUri) {
      return media.localUri;
    }
    return null;
  }
  if (avatarUri && !avatarUri.startsWith('content://')) {
    return avatarUri;
  }
  return null;
}

export async function applyAvatarMediaReady(
  db: SQLiteDatabase,
  cid: string,
  localUri: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE profiles SET avatar_uri = ? WHERE avatar_cid = ?',
    [localUri, cid],
  );
}

export async function upsertLocalIdentity(
  db: SQLiteDatabase,
  publicKey: string,
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO identities (public_key, created_at, is_local)
     VALUES (?, ?, 1)
     ON CONFLICT(public_key) DO UPDATE SET is_local = 1`,
    [publicKey, now],
  );

  await db.runAsync(
    `INSERT INTO profiles (public_key, display_name, avatar_uri, updated_at, about_json)
     VALUES (?, '', NULL, ?, ?)
     ON CONFLICT(public_key) DO NOTHING`,
    [publicKey, now, JSON.stringify(EMPTY_ABOUT)],
  );
}

export async function getProfile(
  db: SQLiteDatabase,
  publicKey: string,
): Promise<Profile | null> {
  const row = await db.getFirstAsync<{
    public_key: string;
    display_name: string;
    avatar_uri: string | null;
    avatar_cid: string | null;
    updated_at: number;
    about_json: string | null;
  }>(
    `SELECT public_key, display_name, avatar_uri, avatar_cid, updated_at, about_json
     FROM profiles WHERE public_key = ?`,
    [publicKey],
  );

  if (!row) {
    return null;
  }

  const avatarUri = await resolveAvatarUri(
    db,
    row.avatar_uri,
    row.avatar_cid,
  );

  return {
    publicKey: row.public_key,
    displayName: row.display_name,
    avatarUri,
    avatarCid: row.avatar_cid,
    updatedAt: row.updated_at,
    about: parseAboutJson(row.about_json),
  };
}

export async function updateProfile(
  db: SQLiteDatabase,
  publicKey: string,
  fields: ProfileFields,
): Promise<Profile> {
  const current = await getProfile(db, publicKey);
  if (!current) {
    throw new Error(`Profile not found for ${publicKey}`);
  }

  const displayName = fields.displayName ?? current.displayName;
  const avatarUri =
    fields.avatarUri === undefined ? current.avatarUri : fields.avatarUri;
  const avatarCid =
    fields.avatarCid === undefined ? current.avatarCid : fields.avatarCid;
  const about = fields.about
    ? normalizeAbout({ ...current.about, ...fields.about })
    : current.about;
  const updatedAt = Date.now();

  await db.runAsync(
    `UPDATE profiles
     SET display_name = ?, avatar_uri = ?, avatar_cid = ?, updated_at = ?, about_json = ?
     WHERE public_key = ?`,
    [
      displayName,
      avatarUri,
      avatarCid,
      updatedAt,
      JSON.stringify(about),
      publicKey,
    ],
  );

  const resolvedAvatarUri = await resolveAvatarUri(db, avatarUri, avatarCid);

  return {
    publicKey,
    displayName,
    avatarUri: resolvedAvatarUri,
    avatarCid,
    updatedAt,
    about,
  };
}

export async function upsertRemotePeer(
  db: SQLiteDatabase,
  publicKey: string,
  fields: {
    displayName: string;
    avatarUri?: string | null;
    avatarCid?: string | null;
    about?: ProfileAbout | null;
  },
): Promise<Profile> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO identities (public_key, created_at, is_local)
     VALUES (?, ?, 0)
     ON CONFLICT(public_key) DO NOTHING`,
    [publicKey, now],
  );

  const existing = await getProfile(db, publicKey);
  const about = fields.about
    ? normalizeAbout(fields.about)
    : existing?.about ?? { ...EMPTY_ABOUT };

  if (!existing) {
    await db.runAsync(
      `INSERT INTO profiles (public_key, display_name, avatar_uri, avatar_cid, updated_at, about_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        publicKey,
        fields.displayName,
        fields.avatarUri ?? null,
        fields.avatarCid ?? null,
        now,
        JSON.stringify(about),
      ],
    );
  } else {
    await db.runAsync(
      `UPDATE profiles
       SET display_name = ?, avatar_uri = ?, avatar_cid = ?, updated_at = ?, about_json = ?
       WHERE public_key = ?`,
      [
        fields.displayName,
        fields.avatarUri === undefined ? existing.avatarUri : fields.avatarUri,
        fields.avatarCid === undefined ? existing.avatarCid : fields.avatarCid,
        now,
        JSON.stringify(fields.about ? about : existing.about),
        publicKey,
      ],
    );
  }

  const profile = await getProfile(db, publicKey);
  if (!profile) {
    throw new Error('Failed to upsert remote peer profile');
  }
  return profile;
}
