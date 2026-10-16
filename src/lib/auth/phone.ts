// Honduran cell numbers for the SMS login. Safe to import anywhere (server
// or client); it reads nothing.
//
// SMS codes only go to +504 numbers at launch (protection against "SMS
// pumping" fraud, see GitHub issue #12). Anyone else signs in with an email
// code instead.

export const HN_PREFIX = "+504";
export const HN_DIGITS = 8;

// The 8 local digits from whatever the person typed or pasted
// ("9999-9999", "+504 9999 9999", "50499999999"). Null when it isn't a
// complete Honduran number.
export function localDigits(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === HN_DIGITS + 3 && digits.startsWith("504")) digits = digits.slice(3);
  return digits.length === HN_DIGITS ? digits : null;
}

// True when the input clearly is another country's number (a "+" prefix
// other than +504, or too many digits), so the screen can point the person
// to email instead of just saying "incomplete".
export function isForeignNumber(input: string): boolean {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length > 0 && !digits.startsWith("504")) return true;
  return digits.length > HN_DIGITS && !(digits.length === HN_DIGITS + 3 && digits.startsWith("504"));
}

// "+50499999999", the form Supabase and Twilio expect.
export function toE164(local: string): string {
  return `${HN_PREFIX}${local}`;
}

// The server's check before asking Supabase for an SMS: exactly +504 and 8
// digits.
export function isHondurasE164(phone: string): boolean {
  return /^\+504\d{8}$/.test(phone);
}

// As people write it: "9999-9999" (partial input stays as typed).
export function formatLocal(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, HN_DIGITS);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

// "+504 9999-9999" for display. Supabase stores phones without the "+"
// ("50499999999"), so both forms are accepted; anything else is shown as is.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === HN_DIGITS + 3 && digits.startsWith("504")) {
    return `${HN_PREFIX} ${formatLocal(digits.slice(3))}`;
  }
  return phone.startsWith("+") ? phone : `+${phone}`;
}

export const CODE_LENGTH = 6;
// Supabase allows one code per minute per number/email.
export const RESEND_SECONDS = 60;
