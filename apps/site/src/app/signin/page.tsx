import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { env } from "@/lib/env";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

/** Metadata stays in the reference language, like the cached HTML (see `components/T.tsx`). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "fr", namespace: "auth.signin" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default function SignInPage() {
  return (
    <PageShell rhythm="default">
      <SignInForm
        googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
        emailSendingEnabled={Boolean(
          env.SMTP_PASSWORD || (env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
        )}
      />
    </PageShell>
  );
}
