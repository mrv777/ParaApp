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

/** Synchronous inline check. Returns true when the text is acceptable. */
export function isClean(text: string): boolean {
  if (englishMatcher.hasMatch(text)) return false;
  if (multilingual.exists(text)) return false;
  return true;
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
