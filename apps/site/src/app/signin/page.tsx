import { env } from "@/lib/env";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <SignInForm
      googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
      emailSendingEnabled={Boolean(
        env.SMTP_PASSWORD || (env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
      )}
    />
  );
}
