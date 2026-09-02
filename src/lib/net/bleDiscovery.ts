import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { NetConfig } from '@/lib/constants';
import type { DiscoveredPeer, LocalPeerInfo } from '@/lib/net/types';

/** Stable service UUID for Howfana BLE discovery. */
export const HOWFANA_BLE_SERVICE_UUID = '686f7766-616e-4000-8000-000000000001';
/** Private-use company id for manufacturer data. */
export const HOWFANA_BLE_COMPANY_ID = 0x0fed;

const RETRY_DELAYS_MS = [400, 1200, 3000];
const HEALTH_INTERVAL_MS = 45_000;

export type BleDiscoveryEvent =
  | { kind: 'peer'; peer: DiscoveredPeer }
  | { kind: 'peerLost'; publicKey: string }
  | { kind: 'error'; error: Error };

type BleAdvertiserModule = {
  setCompanyId: (id: number) => void;
  broadcast: (
    uuid: string,
    manufacturerData: number[],
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  stopBroadcast: () => Promise<unknown>;
  scanByService: (
    uuid: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  stopScan: () => Promise<unknown>;
};

function loadAdvertiser(): BleAdvertiserModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-advertiser') as BleAdvertiserModule;
    if (mod && typeof mod.setCompanyId === 'function') return mod;
  } catch {
    // native module missing (web / Expo Go)
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(
  label: string,
  fn: () => Promise<unknown>,
  onFail: (error: Error) => void,
): Promise<boolean> {
  let last: Error | null = null;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      await fn();
      return true;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      if (i < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[i]!);
      }
    }
  }
  if (last) {
    onFail(new Error(`${label}: ${last.message}`));
  }
  return false;
}

function pkPrefixBytes(publicKey: string): number[] {
  const hex = publicKey.toLowerCase().replace(/[^0-9a-f]/g, '');
  const out: number[] = [];
  for (let i = 0; i < 32 && i + 1 < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  while (out.length < 16) out.push(0);
  return out.slice(0, 16);
}

function encodeManufacturerData(publicKey: string, displayName: string): number[] {
  const nameBytes = Array.from(
    new TextEncoder().encode(displayName.trim().slice(0, 12)),
  );
  return [1, ...pkPrefixBytes(publicKey), ...nameBytes];
}

function decodeManufacturerData(
  data: number[] | undefined,
): { prefixHex: string; displayName: string } | null {
  if (!data || data.length < 17 || data[0] !== 1) return null;
  const prefix = data.slice(1, 17);
  const prefixHex = prefix.map((b) => b.toString(16).padStart(2, '0')).join('');
  let displayName = 'Nearby';
  try {
    displayName =
      new TextDecoder().decode(Uint8Array.from(data.slice(17))).trim() ||
      'Nearby';
  } catch {
    // ignore
  }
  return { prefixHex, displayName };
}

/**
 * BLE advertise + scan for nearby Howfana peers.
 * Identity in ads is a 16-byte pk prefix (`ble:<prefix>`) until Wi‑Fi hello upgrades it.
 */
export class BleDiscovery {
  private advertiser = loadAdvertiser();
  private handlers = new Set<(event: BleDiscoveryEvent) => void>();
  private local: LocalPeerInfo | null = null;
  private announcing = true;
  private running = false;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, DiscoveredPeer>();
  private sub: { remove: () => void } | null = null;

  get available(): boolean {
    return this.advertiser != null && Platform.OS !== 'web';
  }

  subscribe(handler: (event: BleDiscoveryEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: BleDiscoveryEvent): void {
    for (const h of this.handlers) h(event);
  }

  async start(local: LocalPeerInfo): Promise<void> {
    if (!this.advertiser) {
      throw new Error(
        'Bluetooth discovery requires a native rebuild with react-native-ble-advertiser',
      );
    }
    await this.stop();
    this.local = local;
    this.running = true;
    this.advertiser.setCompanyId(HOWFANA_BLE_COMPANY_ID);

    const emitter = new NativeEventEmitter(
      NativeModules.BLEAdvertiser ?? NativeModules.BleAdvertiser,
    );
    this.sub = emitter.addListener(
      'onDeviceFound',
      (deviceData: {
        manuData?: number[];
        manufacturerData?: number[];
        rssi?: number;
        serviceUuids?: string[];
      }) => {
        const manu = deviceData.manuData ?? deviceData.manufacturerData;
        const decoded = decodeManufacturerData(manu);
        if (!decoded) return;
        if (
          this.local &&
          this.local.publicKey.toLowerCase().startsWith(decoded.prefixHex)
        ) {
          return;
        }
        const publicKey = `ble:${decoded.prefixHex}`;
        const peer: DiscoveredPeer = {
          publicKey,
          displayName: decoded.displayName,
          host: '',
          port: NetConfig.tcpPort,
          lastSeenAt: Date.now(),
          sources: ['ble'],
          rssi: typeof deviceData.rssi === 'number' ? deviceData.rssi : null,
          blePrefix: decoded.prefixHex,
        };
        this.peers.set(publicKey, peer);
        this.emit({ kind: 'peer', peer });
      },
    );

    await this.startScan();
    if (this.announcing) {
      await this.startBroadcast();
    }

    this.pruneTimer = setInterval(() => this.prune(), NetConfig.announceIntervalMs);
    this.healthTimer = setInterval(() => {
      void this.healthCheck();
    }, HEALTH_INTERVAL_MS);
  }

  private async startScan(): Promise<void> {
    if (!this.advertiser || !this.running) return;
    await withRetries(
      'BLE scan',
      () => this.advertiser!.scanByService(HOWFANA_BLE_SERVICE_UUID, {}),
      (error) => this.emit({ kind: 'error', error }),
    );
  }

  private async startBroadcast(): Promise<void> {
    if (!this.advertiser || !this.local || !this.announcing || !this.running) {
      return;
    }
    const data = encodeManufacturerData(
      this.local.publicKey,
      this.local.displayName || 'Howfana',
    );
    await withRetries(
      'BLE advertise',
      () =>
        this.advertiser!.broadcast(HOWFANA_BLE_SERVICE_UUID, data, {
          connectable: false,
          includeDeviceName: false,
        }),
      (error) => this.emit({ kind: 'error', error }),
    );
  }

  private async healthCheck(): Promise<void> {
    if (!this.running || !this.advertiser) return;
    try {
      await this.advertiser.stopScan().catch(() => undefined);
      await this.startScan();
      if (this.announcing) {
        await this.advertiser.stopBroadcast().catch(() => undefined);
        await this.startBroadcast();
      }
    } catch (err) {
      this.emit({
        kind: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  setAnnouncing(enabled: boolean): void {
    this.announcing = enabled;
    if (!this.running || !this.advertiser) return;
    if (enabled) {
      void this.startBroadcast();
    } else {
      void this.advertiser.stopBroadcast().catch(() => undefined);
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, peer] of this.peers) {
      if (now - peer.lastSeenAt > NetConfig.peerTtlMs * 2) {
        this.peers.delete(key);
        this.emit({ kind: 'peerLost', publicKey: key });
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.sub?.remove();
    this.sub = null;
    this.peers.clear();
    if (this.advertiser) {
      await Promise.allSettled([
        this.advertiser.stopScan(),
        this.advertiser.stopBroadcast(),
      ]);
    }
  }
}

export function isBleDiscoveryAvailable(): boolean {
  return loadAdvertiser() != null && Platform.OS !== 'web';
}

/** True if `fullPk` matches a BLE prefix key or blePrefix field. */
export function bleMatchesPublicKey(
  bleKeyOrPrefix: string,
  fullPublicKey: string,
): boolean {
  const prefix = bleKeyOrPrefix.startsWith('ble:')
    ? bleKeyOrPrefix.slice(4)
    : bleKeyOrPrefix;
  return fullPublicKey.toLowerCase().startsWith(prefix.toLowerCase());
}
