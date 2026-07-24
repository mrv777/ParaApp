/**
 * Moderation regression check.
 *
 * Guards against the "numbers get blocked" false positives: obscenity's leetspeak
 * transformer folded digits into letters ("455" -> "ass") and `@2toad/profanity`
 * flagged the bare token "5", so innocent mining chatter (hashrates, difficulties,
 * block heights) was rejected with `blocked_content`. `classifyText` now strips
 * digits before matching. This asserts numeric messages pass while real profanity
 * — including symbol-leet and spaced forms — is still caught.
 *
 * Usage:
 *   pnpm test:moderation
 */

import { classifyText } from '../src/chat/moderation';

// Must classify clean (return null). Numbers, leet-looking digit combos, block
// heights, worker ids — all ordinary in a mining chat.
const CLEAN = [
  'I have 455 sats',
  'my hashrate is 455 GH',
  'the 455th block',
  'you are 455',
  'got 5 shares in 3 min',
  'level 5',
  'worker 1337 online',
  'block 840000 just hit',
  'temp is 65C fan at 100',
  '69 nice',
  'a55',
  '4ss',
  'hello world',
];

// Must be blocked (return non-null). Plain profanity, symbol-leet, and spaced.
const BLOCKED = [
  'fuck this',
  'you are a bitch',
  'shit happens',
  '$h!t',
  '@sshole',
  'what the f u c k',
];

let failed = 0;

for (const text of CLEAN) {
  const reason = classifyText(text);
  if (reason !== null) {
    failed++;
    console.error(`FAIL  expected clean, got blocked(${reason}): ${JSON.stringify(text)}`);
  }
}

for (const text of BLOCKED) {
  const reason = classifyText(text);
  if (reason === null) {
    failed++;
    console.error(`FAIL  expected blocked, got clean: ${JSON.stringify(text)}`);
  }
}

const total = CLEAN.length + BLOCKED.length;
if (failed > 0) {
  console.error(`\nmoderation-check: ${failed}/${total} cases failed`);
  process.exit(1);
}
console.log(`moderation-check: all ${total} cases passed`);
