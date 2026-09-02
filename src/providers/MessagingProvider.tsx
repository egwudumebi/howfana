import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { EventType } from '@/lib/constants';
import { createSignedEvent, type MeshEvent } from '@/lib/crypto/events';
import { computeConversationId } from '@/lib/db/messages';
import { ingestEvent } from '@/lib/db/applyEvent';
import { loadOrCreateIdentity } from '@/lib/identity/store';
import { usePeers } from '@/providers/PeerProvider';
import { useRelay } from '@/providers/RelayProvider';
import type { ReactNode } from 'react';

type MessagingState = {
  sending: boolean;
  sendMessage: (recipientPublicKey: string, body: string) => Promise<string>;
};

const MessagingContext = createContext<MessagingState | null>(null);

export function MessagingProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { broadcastFrame } = usePeers();
  const { floodEvent } = useRelay();
  const [sending, setSending] = useState(false);

  const sendMessage = useCallback(
    async (recipientPublicKey: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Message cannot be empty');

      setSending(true);
      try {
        const identity = await loadOrCreateIdentity();
        const recipient = recipientPublicKey.toLowerCase();
        const conversationId = computeConversationId(
          identity.publicKey,
          recipient,
        );

        const event = await createSignedEvent(
          {
            type: EventType.MessageCreate,
            author: identity.publicKey,
            timestamp: Date.now(),
            payload: { conversationId, recipient, body: trimmed },
          },
          identity.secretKey,
        );

        await ingestEvent(db, event);
        await broadcastFrame({ type: 'sync_batch', events: [event] });
        await floodEvent(event);
        return event.id;
      } finally {
        setSending(false);
      }
    },
    [db, broadcastFrame, floodEvent],
  );

  const value = useMemo(
    () => ({
      sending,
      sendMessage,
    }),
    [sending, sendMessage],
  );

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging(): MessagingState {
  const ctx = useContext(MessagingContext);
  if (!ctx) {
    throw new Error('useMessaging must be used within MessagingProvider');
  }
  return ctx;
}

