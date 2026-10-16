import { timingSafeEqual } from "node:crypto";

// Vercel Cron calls our /api/cron/* routes with
// "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET environment
// variable is set in the project. Anything else is refused, and without the
// variable the routes never run.
export function isCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
