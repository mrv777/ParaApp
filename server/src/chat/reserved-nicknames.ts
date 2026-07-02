/**
 * Reserved nicknames — block impersonation of authority / system identities and
 * known handles.
 *
 * Matching normalizes case, whitespace/punctuation, and common leetspeak so
 * "adm1n", "A D M I N", "@dmin" all collapse to "admin". We compare the
 * normalized WHOLE nickname against the set (not substrings) to avoid false
 * positives like "modest" → "mod". Extend RESERVED as needed.
 */

const RESERVED = new Set<string>([
  // Authority / system
  'admin',
  'admins',
  'administrator',
  'mod',
  'mods',
  'moderator',
  'moderators',
  'staff',
  'team',
  'official',
  'system',
  'support',
  'help',
  'owner',
  'root',
  'bot',
  'server',
  // Self / generic (would be confusing in the UI)
  'you',
  'me',
  'null',
  'undefined',
  'deleted',
  'anonymous',
  'anon',
  'everyone',
  'here',
  // Brand / known handles
  'parasite',
  'parasitepool',
  'parasitespace',
  'zkshark',
]);

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[0134579@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, ''); // drop spaces, punctuation, emoji (digits handled above)
}

export function isReservedNickname(name: string): boolean {
  const normalized = normalize(name);
  if (!normalized) return false;
  return RESERVED.has(normalized);
}
