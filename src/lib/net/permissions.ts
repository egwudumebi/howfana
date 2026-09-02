import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';

export type NearbyPermissionResult = {
  ok: boolean;
  message?: string;
};

/** Bluetooth + location (Android 12+) needed for BLE scan/advertise. */
export async function requestNearbyPermissions(): Promise<NearbyPermissionResult> {
  if (Platform.OS !== 'android') {
    return { ok: true };
  }

  try {
    const api = Platform.Version;
    const wanted: string[] = [];

    if (typeof api === 'number' && api >= 31) {
      wanted.push(
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_ADVERTISE',
        'android.permission.BLUETOOTH_CONNECT',
      );
    } else {
      wanted.push(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
    }

    // Fine location still helps older stacks / Wi‑Fi awareness
    if (PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
      wanted.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const unique = [...new Set(wanted)];
    const result = await PermissionsAndroid.requestMultiple(
      unique as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS][],
    );

    const denied = unique.filter(
      (p) => result[p as keyof typeof result] !== PermissionsAndroid.RESULTS.GRANTED,
    );
    if (denied.length > 0) {
      return {
        ok: false,
        message:
          'Bluetooth / location permission is required for Nearby Discovery.',
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Permission request failed',
    };
  }
}

export async function requestCallPermissions(
  kind: 'audio' | 'video',
): Promise<NearbyPermissionResult> {
  try {
    await requestRecordingPermissionsAsync();
  } catch {
    // continue — WebRTC may still prompt
  }

  if (kind === 'video') {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      return {
        ok: false,
        message: 'Camera permission is required for video calls.',
      };
    }
  }

  if (Platform.OS === 'android') {
    const mic = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
      return {
        ok: false,
        message: 'Microphone permission is required for calls.',
      };
    }
    if (kind === 'video') {
      const cam = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (cam !== PermissionsAndroid.RESULTS.GRANTED) {
        return {
          ok: false,
          message: 'Camera permission is required for video calls.',
        };
      }
    }
  }

  return { ok: true };
}

export async function setCallAudioRoute(speaker: boolean): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: !speaker,
    });
  } catch {
    // ignore
  }
}
