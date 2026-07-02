/**
 * Text hardening shared by message bodies and nicknames.
 *
 * Two independent concerns:
 *  - stripInvisible(): removes control chars that spoof or hide content, and
 *    caps combining-mark ("zalgo") stacks. Applied to what we STORE/BROADCAST,
 *    so the change is visible to every client. Emoji ZWJ (U+200D) and ZWNJ
 *    (U+200C, needed by Persian/Indic scripts) are preserved.
 *  - foldConfusables(): folds Latin diacritics + common Greek/Cyrillic look-
 *    alikes to ASCII. Used ONLY for reserved-nickname matching, so "Yοu"
 *    (Greek omicron) or Cyrillic "аdmin" can't slip past the blacklist.
 *    Not stored.
 */

// Explicit bidi controls (LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, LRM/RLM/ALM)
// and the two clearly-invisible zero-width chars (ZWSP, ZWNBSP/BOM). NOT
// included: U+200D (emoji ZWJ) and U+200C (ZWNJ) — both have legitimate uses.
const INVISIBLE =
  /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B\uFEFF]/g;

// Keep at most two combining marks per cluster; drop the rest (zalgo).
const ZALGO = /(\p{M}\p{M})\p{M}+/gu;

export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE, '').replace(ZALGO, '$1');
}

// Lowercase Greek/Cyrillic homoglyphs → ASCII. Small on purpose: only the
// letters that appear in reserved words (admin, mod, staff, official, you,
// parasite, …). Extend if a new reserved word needs a new letter.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: 'a', ѕ: 's', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k',
  і: 'i', ԁ: 'd', һ: 'h', м: 'm', т: 't', в: 'v', н: 'n', г: 'r', ѡ: 'w',
  // Greek
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', τ: 't', ι: 'i', κ: 'k', ε: 'e', ϲ: 'c',
  υ: 'u', χ: 'x', β: 'b', η: 'n',
};

export function foldConfusables(s: string): string {
  const ascii = s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return ascii.replace(/[\u0370-\u03FF\u0400-\u04FF]/g, (ch) => CONFUSABLES[ch] ?? ch);
}
