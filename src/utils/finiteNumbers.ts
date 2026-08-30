/** Generous defense-in-depth ceiling for remote telemetry and option arrays. */
export const MAX_REMOTE_ITEMS = 4096;

export interface FiniteNumberRange {
  min: number;
  max: number;
  sum: number;
  count: number;
}

/** One-pass finite range; avoids variadic Math.min/Math.max argument limits. */
export function finiteNumberRange(
  values: Iterable<number>
): FiniteNumberRange | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    count++;
  }
  return count > 0 ? { min, max, sum, count } : null;
}

export function boundedRemoteItems<T>(values: T[] | undefined): T[] | undefined {
  return values?.slice(0, MAX_REMOTE_ITEMS);
}
