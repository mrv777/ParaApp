/**
 * KBox API-key storage.
 *
 * The KBox local API requires an X-API-Key header on every request; the
 * owner generates the key in the unit's web UI (Settings → System → API
 * Access) and can regenerate it at any time (instantly revoking the old
 * one). We keep it in expo-secure-store, never in persisted Zustand
 * state.
 *
 * Keyed by IP: unlike Avalon, the KBox API exposes no MAC/serial, so IP
 * is the only stable-ish identity we have. Consequence: if DHCP
 * reassigns the box a new IP, the stored key is orphaned and the user
 * must re-enter it (the auth sheet hint suggests a static lease).
 * removeMiner clears the key so orphans don't accumulate.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'kbox_api_key_';

function normalizeKey(ip: string): string {
  return KEY_PREFIX + ip.toLowerCase().replace(/[:.]/g, '');
}

export async function getKBoxApiKey(ip: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(normalizeKey(ip));
  } catch {
    return null;
  }
}

export async function setKBoxApiKey(ip: string, apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(normalizeKey(ip), apiKey);
}

export async function clearKBoxApiKey(ip: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(normalizeKey(ip));
  } catch {
    // ignore — already gone
  }
}
