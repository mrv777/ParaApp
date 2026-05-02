/**
 * Avalon admin-password storage.
 *
 * The Avalon web CGIs require an admin password (default `admin`) to
 * apply pool config. We store it in expo-secure-store keyed by the
 * miner's MAC address so a single password survives DHCP IP changes
 * and can be shared across multiple slots if the user re-discovers
 * the same hardware.
 *
 * MAC is normalized to lowercase, no separators (`aabbccddeeff`).
 * Falls back to IP when MAC isn't known yet (e.g. during a manual-add
 * flow before the first stats fetch).
 */

import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'avalon_admin_pw_';

function normalizeKey(macOrIp: string): string {
  return KEY_PREFIX + macOrIp.toLowerCase().replace(/[:.]/g, '');
}

export async function getAvalonPassword(
  macOrIp: string
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(normalizeKey(macOrIp));
  } catch {
    return null;
  }
}

export async function setAvalonPassword(
  macOrIp: string,
  password: string
): Promise<void> {
  await SecureStore.setItemAsync(normalizeKey(macOrIp), password);
}

export async function clearAvalonPassword(macOrIp: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(normalizeKey(macOrIp));
  } catch {
    // ignore — already gone
  }
}
