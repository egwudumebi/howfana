import { NativeModules } from 'react-native';

type PaystackModule = typeof import('react-native-paystack-webview');

let cachedModule: PaystackModule | null | undefined;

/** True when react-native-webview is compiled into the dev client. */
export function isPaystackNativeAvailable(): boolean {
  return Boolean(NativeModules.RNCWebViewModule);
}

export function getPaystackModule(): PaystackModule | null {
  if (!isPaystackNativeAvailable()) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require('react-native-paystack-webview') as PaystackModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export type PaystackClient = NonNullable<
  ReturnType<PaystackModule['usePaystack']>
>;
