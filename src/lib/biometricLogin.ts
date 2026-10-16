import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";

// "Entrar con Face ID" (iPhone) / "Entrar con huella / rostro" (Android):
// an opt-in shortcut inside the installed app (GitHub issue #44). Built on
// the code login from issue #12, it never replaces it.
//
// How it works:
// - Turning it on (Mi cuenta) saves this phone's Supabase *refresh token*
//   in the iOS Keychain / Android Keystore, locked so that only a Face ID /
//   Touch ID / fingerprint check can read it back. Codes and passwords are
//   never stored.
// - Supabase gives out a new refresh token every time the session renews
//   (and the old one stops working), so BiometricSessionSync rewrites the
//   saved one whenever that happens. Writing never shows a prompt; only
//   reading does.
// - When the app opens without a session (the login screen), the phone asks
//   for Face ID / fingerprint, the saved token becomes a fresh session and
//   the person goes straight to Chat. Cancelled or failed: the normal code
//   login is right there.
// - Cerrar sesión, Eliminar mi cuenta and turning it off delete the token.
//
// Plugin: @capgo/capacitor-native-biometric (Capacitor 8). Loaded lazily so
// the web bundle never pulls it in; every function here is a no-op in a
// normal browser.

const STORAGE_KEY = "cheke.session.refresh";

// The last token written, to skip rewriting the same one.
let lastSaved: string | null = null;

export type BiometricKind = "faceId" | "touchId" | "android";

// The toggle's name in Mi cuenta and the button on the login screen.
export function biometricLabel(kind: BiometricKind): string {
  if (kind === "faceId") return "Entrar con Face ID";
  if (kind === "touchId") return "Entrar con Touch ID";
  return "Entrar con huella / rostro";
}

// Texts of the system prompt. Face ID shows none of these (it uses the
// NSFaceIDUsageDescription from Info.plist the first time); Touch ID shows
// `reason`; Android shows title/subtitle and the cancel button.
const PROMPT = {
  reason: "Entra a cheke",
  title: "Entrar a cheke",
  subtitle: "Usa tu huella o tu rostro",
  negativeButtonText: "Usar código",
  // iPhone: the second button after a failed try. Tapping it cancels and
  // the code login is shown, instead of asking for the phone's passcode.
  fallbackTitle: "Usar código",
} as const;

// Plugin error codes we act on (README "Biometric Auth Errors").
const NO_SAVED_DATA = 21;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function plugin() {
  return import("@capgo/capacitor-native-biometric");
}

function errorCode(err: unknown): number | null {
  const code = (err as { code?: unknown } | null)?.code;
  const n = typeof code === "number" ? code : Number(code);
  return Number.isFinite(n) ? n : null;
}

// Which kind of biometrics this phone can use for the shortcut, or null
// when it can't (normal browser, no Face ID / fingerprint set up, or an
// Android phone whose face unlock isn't secure enough to protect a key).
export async function getBiometricKind(): Promise<BiometricKind | null> {
  if (!isNative()) return null;
  try {
    const { NativeBiometric, BiometryType } = await plugin();
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    // The saved token is protected by a hardware key, which only "strong"
    // biometrics can unlock (Face ID, Touch ID, most fingerprint readers).
    if (!result.isAvailable || !result.strongBiometryIsAvailable) return null;
    if (Capacitor.getPlatform() === "android") return "android";
    return result.biometryType === BiometryType.TOUCH_ID ? "touchId" : "faceId";
  } catch {
    return null;
  }
}

// Is the shortcut on for this phone? Doesn't show any prompt.
export async function isBiometricLoginOn(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { NativeBiometric } = await plugin();
    return (await NativeBiometric.isDataSaved({ key: STORAGE_KEY })).isSaved;
  } catch {
    return false;
  }
}

async function saveRefreshToken(refreshToken: string): Promise<void> {
  const { NativeBiometric, AccessControl } = await plugin();
  await NativeBiometric.setData({
    key: STORAGE_KEY,
    value: refreshToken,
    // Locked to the faces/fingers enrolled right now: if someone adds a new
    // one, the saved token stops working and the code login is used.
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
  });
}

async function currentRefreshToken(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.refresh_token ?? null;
}

// Mi cuenta → turn on. Asks for Face ID / fingerprint once (which is also
// when iOS asks permission to use Face ID), then saves the session.
export async function turnOnBiometricLogin(): Promise<{ error?: string }> {
  if (!isNative()) return { error: "Esta opción solo está en la app de cheke." };
  try {
    const { NativeBiometric } = await plugin();
    await NativeBiometric.verifyIdentity({
      reason: "Confirma que eres tú",
      title: "Confirma que eres tú",
      subtitle: "Para entrar a cheke sin esperar un código",
      negativeButtonText: "Cancelar",
    });
  } catch {
    // Cancelled or not recognised: it stays off. An empty error tells the
    // caller there's nothing to show.
    return { error: "" };
  }
  try {
    const token = await currentRefreshToken();
    if (!token) return { error: "Tu sesión terminó. Vuelve a entrar e inténtalo de nuevo." };
    await saveRefreshToken(token);
    return {};
  } catch {
    return { error: "No se pudo activar. Inténtalo de nuevo." };
  }
}

// Mi cuenta → turn off, Cerrar sesión and Eliminar mi cuenta. Never throws.
// Returns whether it was on, so a failed account deletion can put it back.
export async function turnOffBiometricLogin(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const wasOn = await isBiometricLoginOn();
    lastSaved = null;
    const { NativeBiometric } = await plugin();
    await NativeBiometric.deleteData({ key: STORAGE_KEY });
    return wasOn;
  } catch {
    return false;
  }
}

// Puts the login back after turnOffBiometricLogin() when the action that
// needed it off didn't happen (a refused account deletion). No prompt.
export async function resaveBiometricLogin(): Promise<void> {
  if (!isNative()) return;
  try {
    const token = await currentRefreshToken();
    if (token) await saveRefreshToken(token);
  } catch {
    // Stays off; the person can turn it on again in Mi cuenta.
  }
}

// Keeps the saved token equal to the session's current one (see the top of
// this file). Silent: no prompt. Only acts while the shortcut is on.
export async function syncBiometricSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const token = await currentRefreshToken();
    if (!token || token === lastSaved) return;
    if (!(await isBiometricLoginOn())) return;
    await saveRefreshToken(token);
    lastSaved = token;
  } catch {
    // Try again on the next refresh / when the app goes to the background.
  }
}

export type RestoreResult =
  // Signed in; the session cookies are set.
  | "ok"
  // The person cancelled, chose "Usar código" or wasn't recognised.
  | "cancelled"
  // The saved session no longer works (logged out elsewhere, new face or
  // finger enrolled, account removed…). The shortcut was turned off.
  | "expired"
  // Something else (e.g. no internet). The shortcut stays on.
  | "failed";

// Login screen: Face ID / fingerprint → saved token → fresh session.
export async function restoreSessionWithBiometrics(): Promise<RestoreResult> {
  if (!isNative()) return "failed";
  let refreshToken: string;
  try {
    const { NativeBiometric } = await plugin();
    refreshToken = (await NativeBiometric.getSecureData({ key: STORAGE_KEY, ...PROMPT })).value;
  } catch (err) {
    if (errorCode(err) === NO_SAVED_DATA) {
      await turnOffBiometricLogin();
      return "expired";
    }
    return "cancelled";
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    // 4xx from Supabase = the token was revoked or already used. Anything
    // else (offline, server hiccup) may work on the next try.
    const status = (error as { status?: number } | null)?.status ?? 0;
    if (status >= 400 && status < 500) {
      await turnOffBiometricLogin();
      return "expired";
    }
    return "failed";
  }

  // The token just used is now spent; save the new one right away.
  try {
    await saveRefreshToken(data.session.refresh_token);
    lastSaved = data.session.refresh_token;
  } catch {
    // BiometricSessionSync retries once the app is open.
  }
  return "ok";
}
