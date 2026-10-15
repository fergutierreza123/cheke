import { connection } from "next/server";
import { reviewerLoginEnabled } from "@/lib/reviewerDemo";
import { LoginScreen } from "./LoginScreen";

export default async function LoginPage() {
  // Read the reviewer env vars per request, not frozen in at build time.
  await connection();
  return <LoginScreen reviewerLoginEnabled={reviewerLoginEnabled()} />;
}
