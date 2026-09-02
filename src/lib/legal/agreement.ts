import * as SecureStore from 'expo-secure-store';

import {
  LEGAL_AGREEMENT_KEY,
  LEGAL_AGREEMENT_VERSION,
} from '@/lib/constants';

export type PolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const TERMS_SECTIONS: PolicySection[] = [
  {
    id: 'intro',
    title: 'Welcome to Howfana',
    paragraphs: [
      'Howfana is an offline-first social app. Your cryptographic identity and most of your data stay on your device. By creating an account or using Howfana, you agree to these Terms of Service.',
    ],
  },
  {
    id: 'account',
    title: 'Your account & recovery key',
    paragraphs: [
      'You are responsible for your device and recovery key. Howfana does not store your private keys on a central server. If you lose your recovery key and device access, we cannot restore your account.',
    ],
    bullets: [
      'Choose a display name that does not impersonate others.',
      'Do not share your recovery key with anyone.',
      'You must be at least 13 years old to use Howfana.',
    ],
  },
  {
    id: 'mesh',
    title: 'Nearby & mesh networking',
    paragraphs: [
      'Howfana discovers and connects to other users over local Wi‑Fi and Bluetooth when you enable Nearby Discovery. Messages and posts sync directly between devices and may relay through nearby peers.',
    ],
    bullets: [
      'You control discovery in Settings (including Invisible Mode).',
      'Other users nearby may see your display name and public key when you are discoverable.',
      'Mesh delivery depends on proximity and connections — not all content reaches all users instantly.',
    ],
  },
  {
    id: 'content',
    title: 'Your content & conduct',
    paragraphs: [
      'You keep ownership of content you post. You grant other Howfana users a license to receive and display that content through normal app sync.',
    ],
    bullets: [
      'No harassment, hate speech, illegal content, or spam.',
      'No content that violates others’ privacy or intellectual property.',
      'We may limit features or remove access for abuse (where technically feasible on-device).',
    ],
  },
  {
    id: 'premium',
    title: 'Premium & payments',
    paragraphs: [
      'Premium subscriptions are processed by Paystack. Prices shown in the app apply at checkout. Premium features (extra pins, edit window, scheduling, etc.) are entitlements on your device unless otherwise stated.',
    ],
  },
  {
    id: 'ads',
    title: 'Advertising',
    paragraphs: [
      'Howfana may show sponsored content in feeds. Premium users may still see ads, as described in the app.',
    ],
  },
  {
    id: 'disclaimer',
    title: 'Disclaimer',
    paragraphs: [
      'Howfana is provided “as is” without warranties. We are not liable for indirect damages, data loss, or content posted by users. These terms may be updated; continued use after an update means you accept the revised terms.',
    ],
  },
];

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    id: 'overview',
    title: 'Privacy overview',
    paragraphs: [
      'Howfana is designed to minimize centralized data collection. Your identity keys are generated and stored on your device. There is no traditional username/password login stored on our servers because Howfana does not require a central account database for core features.',
    ],
  },
  {
    id: 'local',
    title: 'Data on your device',
    paragraphs: [
      'The app stores profiles, posts, messages, media, and preferences locally in app storage and SQLite.',
    ],
    bullets: [
      'Secret keys are kept in secure storage on your device.',
      'Your recovery key is shown to you once — save it privately.',
      'Deleting the app removes local data unless you have synced copies on other devices.',
    ],
  },
  {
    id: 'shared',
    title: 'Data shared with other users',
    paragraphs: [
      'When you use Howfana, signed events (profile, posts, messages, reactions, etc.) are exchanged with connected peers over local mesh sync and may relay through nearby devices.',
    ],
    bullets: [
      'Your public key and display name are visible to peers you connect with or who discover you nearby.',
      'Posts, stories, reels, and messages you send are replicated to recipients and may persist on their devices.',
      'Voice/video calls use peer connections when available; permissions are requested on device.',
    ],
  },
  {
    id: 'discovery',
    title: 'Nearby discovery',
    paragraphs: [
      'If Nearby Discovery is enabled, your device broadcasts presence on local Wi‑Fi and/or Bluetooth so others can find you on the same network. Invisible Mode stops announcing but does not erase data already synced elsewhere.',
    ],
  },
  {
    id: 'payments',
    title: 'Payment data',
    paragraphs: [
      'Premium checkout uses Paystack. Payment card details are handled by Paystack, not stored in Howfana. We may store subscription status locally on your device after a successful checkout.',
    ],
  },
  {
    id: 'permissions',
    title: 'Device permissions',
    paragraphs: [
      'Howfana may request camera, microphone, photo library, Bluetooth, and location permissions (Android) to support posts, calls, reels, and nearby discovery. You can deny permissions and disable features in Settings.',
    ],
  },
  {
    id: 'choices',
    title: 'Your choices',
    paragraphs: [
      'You can turn off Nearby Discovery, use Invisible Mode, cancel Premium, and uninstall the app to stop further local use. Because data may already exist on peers’ devices, deletion across the mesh is not guaranteed.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [
      'Questions about these policies: contact the Howfana team through your project support channel. Policy version 1.0 — effective upon first use of the app.',
    ],
  },
];

export async function getAcceptedAgreementVersion(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(LEGAL_AGREEMENT_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export async function hasAcceptedAgreement(): Promise<boolean> {
  const accepted = await getAcceptedAgreementVersion();
  return accepted === LEGAL_AGREEMENT_VERSION;
}

export async function acceptAgreement(): Promise<void> {
  await SecureStore.setItemAsync(
    LEGAL_AGREEMENT_KEY,
    LEGAL_AGREEMENT_VERSION,
  );
}
