// WhatsApp stamps messages to the second. A customer who sends a photo, a
// voice note and "¿cuánto?" in one go gives three messages with the same
// second, and Postgres returns ties in any order, so Chat could show them
// shuffled. One clock per webhook call gives each message its own instant:
//   - a message arriving live (within its second) keeps the arrival time,
//     so it also sorts correctly against what the business just sent;
//   - a late one (phone was offline, retries) keeps Meta's second;
//   - ties inside the same second are broken by arrival order (+1 ms).
export function createMessageClock() {
  let last = 0;
  return function instant(timestampSeconds: string | number | undefined, nowMs: number): string {
    const stamped = Number(timestampSeconds) * 1000;
    let at = !Number.isFinite(stamped) || stamped <= 0 ? nowMs : nowMs >= stamped && nowMs < stamped + 1000 ? nowMs : stamped;
    // Same second as the previous message, not after it: just after it.
    if (at <= last && Math.floor((last + 1) / 1000) === Math.floor(at / 1000)) at = last + 1;
    last = Math.max(last, at);
    return new Date(at).toISOString();
  };
}
