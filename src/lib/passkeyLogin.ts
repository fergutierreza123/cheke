import { createClient } from "@/lib/supabase/client";

// Web: "Entrar con huella o rostro" using a passkey (GitHub issue #44).
// Supabase Auth signs people in with a passkey directly (no code, no
// password): `signInWithPasskey()` / `registerPasskey()`, in beta since
// May 2026. The phone app uses Face ID / fingerprint instead (see
// src/lib/biometricLogin.ts), so none of this runs there.
//
// - Mi cuenta → turn on: the browser/phone saves a passkey for cheke (with
//   Face ID, Touch ID, Windows Hello, fingerprint…). Turn off: every passkey
//   of the account is deleted from Supabase.
// - The login screen only offers the button on a device that turned it on
//   (or already entered with it), so nobody else gets a confusing prompt.
//   That's a plain flag in this browser's storage, not a secret.
// - The codes and long sessions stay exactly as they were.

const DEVICE_FLAG = "cheke_passkey_on_this_device";

function rememberDevice(on: boolean) {
  try {
    if (on) localStorage.setItem(DEVICE_FLAG, "1");
    else localStorage.removeItem(DEVICE_FLAG);
  } catch {
    // Private mode etc.: the button just won't show on the login screen.
  }
}

export function passkeyUsedOnThisDevice(): boolean {
  try {
    return localStorage.getItem(DEVICE_FLAG) === "1";
  } catch {
    return false;
  }
}

// Does this browser have a built-in way to unlock a passkey (Face ID,
// Touch ID, Windows Hello, fingerprint)?
export async function browserSupportsPasskeys(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function isCancel(error: unknown): boolean {
  const e = error as { name?: string; code?: string; cause?: { name?: string } } | null;
  return (
    e?.code === "ERROR_CEREMONY_ABORTED" ||
    e?.name === "NotAllowedError" ||
    e?.name === "AbortError" ||
    e?.cause?.name === "NotAllowedError"
  );
}

function serverCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

// Mi cuenta: is a passkey saved for this account?
export async function hasPasskey(): Promise<boolean> {
  const { data, error } = await createClient().auth.passkey.list();
  return !error && (data?.length ?? 0) > 0;
}

// Mi cuenta → turn on. An empty error means "cancelled, show nothing".
export async function turnOnPasskey(): Promise<{ error?: string }> {
  const { error } = await createClient().auth.registerPasskey();
  if (!error || serverCode(error) === "webauthn_credential_exists" || serverCode(error) === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    rememberDevice(true);
    return {};
  }
  if (isCancel(error)) return { error: "" };
  if (serverCode(error) === "passkey_disabled") return { error: "Esta opción todavía no está disponible." };
  if (serverCode(error) === "too_many_passkeys") return { error: "Ya activaste esto en muchos dispositivos. Apágalo y vuelve a activarlo." };
  return { error: "No se pudo activar. Inténtalo de nuevo." };
}

// Mi cuenta → turn off: deletes the account's passkeys from cheke. (The
// copy saved in the phone/computer's password manager stays there but no
// longer works; people can delete it from their settings.)
export async function turnOffPasskey(): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.passkey.list();
  if (error) return { error: "No se pudo apagar. Inténtalo de nuevo." };
  for (const passkey of data ?? []) {
    const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId: passkey.id });
    if (deleteError) return { error: "No se pudo apagar. Inténtalo de nuevo." };
  }
  rememberDevice(false);
  return {};
}

// Eliminar mi cuenta: the passkeys go away with the account; just forget
// the flag on this device.
export function forgetPasskeyOnThisDevice() {
  rememberDevice(false);
}

// Login screen. "ok" = session cookies set; an error message otherwise
// (empty when the person just cancelled).
export async function signInWithPasskey(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await createClient().auth.signInWithPasskey();
  if (!error && data?.session) {
    rememberDevice(true);
    return { ok: true };
  }
  if (isCancel(error)) return { ok: false, error: "" };
  // The passkey was turned off or the account no longer exists.
  if (serverCode(error) === "webauthn_verification_failed" || serverCode(error) === "passkey_disabled") {
    rememberDevice(false);
  }
  return { ok: false, error: "No se pudo entrar así. Entra con tu código." };
}
