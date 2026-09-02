import { resolveCallGlare } from '@/lib/net/callGlare';
import {
  removeDiscoveredPeer,
  upsertDiscoveredPeer,
} from '@/lib/net/mergePeers';
import type { DiscoveredPeer } from '@/lib/net/types';

const wifiPk = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const blePrefix = wifiPk.slice(0, 32);

function peer(partial: Partial<DiscoveredPeer> & Pick<DiscoveredPeer, 'publicKey'>): DiscoveredPeer {
  return {
    displayName: 'Ada',
    host: '',
    port: 47338,
    lastSeenAt: 1000,
    sources: ['wifi'],
    rssi: null,
    blePrefix: null,
    ...partial,
  };
}

describe('upsertDiscoveredPeer', () => {
  it('adds a new peer', () => {
    const next = upsertDiscoveredPeer([], peer({ publicKey: wifiPk, host: '10.0.0.2' }));
    expect(next).toHaveLength(1);
    expect(next[0]!.publicKey).toBe(wifiPk);
  });

  it('merges BLE sighting into Wi‑Fi peer and keeps full key', () => {
    const withWifi = upsertDiscoveredPeer(
      [],
      peer({
        publicKey: wifiPk,
        host: '10.0.0.2',
        sources: ['wifi'],
        lastSeenAt: 1000,
      }),
    );
    const next = upsertDiscoveredPeer(
      withWifi,
      peer({
        publicKey: `ble:${blePrefix}`,
        host: '',
        sources: ['ble'],
        rssi: -62,
        blePrefix,
        lastSeenAt: 2000,
        displayName: 'Ada BLE',
      }),
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.publicKey).toBe(wifiPk);
    expect(next[0]!.sources).toEqual(expect.arrayContaining(['wifi', 'ble']));
    expect(next[0]!.rssi).toBe(-62);
    expect(next[0]!.lastSeenAt).toBe(2000);
    expect(next[0]!.host).toBe('10.0.0.2');
  });

  it('upgrades ble: stub when Wi‑Fi announce arrives', () => {
    const withBle = upsertDiscoveredPeer(
      [],
      peer({
        publicKey: `ble:${blePrefix}`,
        sources: ['ble'],
        blePrefix,
        rssi: -70,
      }),
    );
    const next = upsertDiscoveredPeer(
      withBle,
      peer({
        publicKey: wifiPk,
        host: '10.0.0.5',
        sources: ['wifi'],
        lastSeenAt: 3000,
      }),
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.publicKey).toBe(wifiPk);
    expect(next[0]!.host).toBe('10.0.0.5');
    expect(next[0]!.sources).toEqual(expect.arrayContaining(['wifi', 'ble']));
    expect(next[0]!.blePrefix).toBe(blePrefix);
  });

  it('removes by public key', () => {
    const list = [
      peer({ publicKey: wifiPk }),
      peer({ publicKey: 'bb'.repeat(32), displayName: 'Bob' }),
    ];
    expect(removeDiscoveredPeer(list, wifiPk)).toHaveLength(1);
  });
});

describe('resolveCallGlare', () => {
  it('keeps the lower callId as winner (remote adopts when remote is lower)', () => {
    expect(resolveCallGlare('b-call', 'a-call')).toBe('adopt-remote');
    expect(resolveCallGlare('a-call', 'b-call')).toBe('keep-local');
  });
});
