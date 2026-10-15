import { headers } from "next/headers";
import { isNativeAppUserAgent } from "@/lib/nativeApp";

// Server Components / Server Actions: is this request coming from the
// installed iPhone/Android app? Reads the request headers, so the page that
// calls it is rendered per request (fine for signed-in pages, which already
// are). A missing marker means "normal browser".
export async function isNativeAppRequest(): Promise<boolean> {
  return isNativeAppUserAgent((await headers()).get("user-agent"));
}
