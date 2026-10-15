import { GRAPH_API_VERSION } from "@/lib/meta";

// Meta's JavaScript SDK in the browser, loaded once and shared by both
// connect buttons in Canales (WhatsApp Embedded Signup, and Instagram +
// Facebook). Each one calls FB.login with its own Facebook Login for
// Business configuration.

type FacebookSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } | null }) => void,
    options: Record<string, unknown>,
  ) => void;
};
declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  return new Promise((resolve) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_API_VERSION });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  });
}
