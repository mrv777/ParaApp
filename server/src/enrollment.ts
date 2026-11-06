/** New installations, reactivations and address moves share a source budget.
 * Public mining addresses are lookup identifiers, never admission identities.
 */
export const ENROLLMENT_WINDOW_SECONDS = 60 * 60;
export const MAX_ENROLLMENTS_PER_WINDOW = 30;

export async function enrollmentSourceKey(
  secret: string,
  connectingIp: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`push-enrollment-v1\n${connectingIp}`)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function claimEnrollment(
  db: D1Database,
  sourceKey: string,
  nowSeconds: number
): Promise<boolean> {
  const windowStart =
    Math.floor(nowSeconds / ENROLLMENT_WINDOW_SECONDS) * ENROLLMENT_WINDOW_SECONDS;
  // Conditional upsert makes concurrent admissions obey the same budget.
  // Failed downstream lookups/writes conservatively consume an attempt too.
  const result = await db.prepare(
    `INSERT INTO push_enrollment_limits (source_key, window_start, attempts)
     VALUES (?, ?, 1)
     ON CONFLICT(source_key, window_start) DO UPDATE SET attempts = attempts + 1
     WHERE attempts < ?`
  ).bind(sourceKey, windowStart, MAX_ENROLLMENTS_PER_WINDOW).run();
  return result.meta.changes > 0;
}

export async function pruneEnrollmentLimits(db: D1Database, nowSeconds: number): Promise<void> {
  await db.prepare('DELETE FROM push_enrollment_limits WHERE window_start < ?')
    .bind(nowSeconds - 2 * ENROLLMENT_WINDOW_SECONDS).run();
}
