export type NearbyErrorKind = 'permission' | 'bluetooth' | 'network' | 'other';

export type ParsedNearbyError = {
  kind: NearbyErrorKind;
  title: string;
  body: string;
  canRetry: boolean;
  canOpenSettings: boolean;
};

/** Turn native transport errors into short, actionable copy. */
export function parseNearbyError(raw: string): ParsedNearbyError {
  const lower = raw.toLowerCase();

  if (
    lower.includes('bluetooth_scan') ||
    lower.includes('bluetooth_advertise') ||
    lower.includes('bluetooth_connect') ||
    lower.includes('location permission') ||
    lower.includes('bluetooth / location')
  ) {
    return {
      kind: 'permission',
      title: 'Bluetooth permission needed',
      body: 'Allow Bluetooth (and location on Android) so Howfana can find people nearby.',
      canRetry: true,
      canOpenSettings: true,
    };
  }

  if (lower.startsWith('ble scan:') || lower.includes('bluetooth:')) {
    return {
      kind: 'bluetooth',
      title: 'Bluetooth discovery paused',
      body: 'Wi‑Fi discovery still works. Grant Bluetooth permission or try again.',
      canRetry: true,
      canOpenSettings: lower.includes('permission'),
    };
  }

  if (lower.includes('native build')) {
    return {
      kind: 'other',
      title: 'Nearby discovery unavailable',
      body: raw,
      canRetry: false,
      canOpenSettings: false,
    };
  }

  return {
    kind: 'other',
    title: 'Nearby discovery issue',
    body: raw.length > 160 ? `${raw.slice(0, 157)}…` : raw,
    canRetry: true,
    canOpenSettings: false,
  };
}
