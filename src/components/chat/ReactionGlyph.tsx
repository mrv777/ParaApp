/**
 * Renders a chat reaction as a monochrome vector icon.
 *
 * The reaction wire-protocol keys are emoji strings ('👍','🔥','⚡','🎉'), but we
 * do NOT render the emoji glyphs directly: color emoji don't render reliably
 * across devices/simulators (tofu on many Android/AOSP images) and would clash
 * with the app's monochrome terminal theme. We map each protocol key to a vector
 * icon instead — display is decoupled from the wire format.
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import type { ReactionEmoji } from '@/constants/chat';

type IonName = keyof typeof Ionicons.glyphMap;
type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

const ION_MAP: Partial<Record<ReactionEmoji, IonName>> = {
  '👍': 'thumbs-up',
  '🔥': 'flame',
  '⚡': 'flash',
};
const MCI_MAP: Partial<Record<ReactionEmoji, MciName>> = {
  '🎉': 'party-popper',
};

interface ReactionGlyphProps {
  emoji: ReactionEmoji;
  size: number;
  color: string;
}

export function ReactionGlyph({ emoji, size, color }: ReactionGlyphProps) {
  const mci = MCI_MAP[emoji];
  if (mci) return <MaterialCommunityIcons name={mci} size={size} color={color} />;
  const ion = ION_MAP[emoji] ?? 'help-circle';
  return <Ionicons name={ion} size={size} color={color} />;
}
