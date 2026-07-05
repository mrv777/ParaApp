/**
 * Chat moderation.
 *
 * v1 ships inline filters only: `obscenity` (strong English matcher with
 * leet/spacing transforms) + `@2toad/profanity` (multilingual EN/ES/DE/FR/PT).
 * The AI layer is present as an interface but disabled behind CHAT_MODERATION_AI;
 * wire OpenAI omni-moderation / Cloudflare Llama Guard here in a later pass.
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';
import { Profanity } from '@2toad/profanity';
import type { Env } from '../types';

const englishMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const multilingual = new Profanity({
  languages: ['en', 'es', 'de', 'fr', 'pt'],
});

// `@2toad/profanity` splits on whitespace AND apostrophes, then matches each
// token exactly. Its non-English lists contain garbage single/short tokens —
// Portuguese lists the bare letter "t", and "dl"/"no"/"sh" appear too. That
// wrecks ordinary English: every "-n't" contraction (didn't, don't, can't,
// won't, isn't...) exposes a bare "t", and the word "no" is flagged outright.
// Whitelist every single letter (a letter is never profanity on its own) plus
// the specific short false positives. The whitelist only exempts these exact
// tokens; real multi-character profanity is unaffected.
const WHITELIST = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'dl',
  'no',
  'sh',
];
multilingual.whitelist.addWords(WHITELIST);

/** Which matcher rejected the text, for logging. `null` means acceptable. */
export type ModerationReason = 'english' | 'multilingual' | null;

/**
 * Classify text against the inline filters. Returns the matcher that rejected
 * it (or `null` when clean) so callers can log *why* a message was blocked.
 */
export function classifyText(text: string): ModerationReason {
  if (englishMatcher.hasMatch(text)) return 'english';
  if (multilingual.exists(text)) return 'multilingual';
  return null;
}

/** Synchronous inline check. Returns true when the text is acceptable. */
export function isClean(text: string): boolean {
  return classifyText(text) === null;
}

/**
 * Async AI moderation hook. Disabled in v1 (returns clean unless the toggle is
 * on). Kept as the single seam for adding OpenAI/Llama-Guard later.
 */
export async function moderateAI(env: Env, text: string): Promise<boolean> {
  if (env.CHAT_MODERATION_AI !== 'on') return true;
  // TODO(v2): call OpenAI omni-moderation-latest or Workers AI llama-guard-3-8b.
  void text;
  return true;
}
