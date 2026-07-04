/**
 * Square (sharp-cornered) speech-bubble icon for the Chat tab.
 *
 * Ionicons only ships rounded chat bubbles; the Chat design handoff specifies a
 * hard-edged bubble to match the app's terminal/brutalist aesthetic (rounded
 * corners are being removed app-wide). Path is ported from the handoff's active
 * tab glyph. Active = filled; inactive = outline stroke.
 */

import Svg, { Path } from 'react-native-svg';

// Rectangle (4,4)→(20,15) with a tail dropping to (5,19); all sharp corners.
const BUBBLE_PATH = 'M4 4 L20 4 L20 15 L9 15 L5 19 L5 15 L4 15 Z';

interface ChatBubbleIconProps {
  size: number;
  color: string;
  /** Filled when the Chat tab is active; outline stroke when inactive. */
  filled: boolean;
}

export function ChatBubbleIcon({ size, color, filled }: ChatBubbleIconProps) {
  // The path occupies ~(4,4)→(20,19). A tight viewBox centered on it (with a
  // little padding) scales the glyph up to visually match the Ionicons in the
  // other tabs, which fill more of their 24×24 box. Stroke is scaled down to
  // compensate for the smaller viewBox so the outline weight stays ~1.7.
  return (
    <Svg width={size} height={size} viewBox="2 1.5 20 20">
      <Path
        d={BUBBLE_PATH}
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={1.45}
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </Svg>
  );
}
