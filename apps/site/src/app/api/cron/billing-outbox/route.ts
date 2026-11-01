import { and, asc, eq, inArray, lte, lt, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sendSmtpEmail } from "@aphrody/shenron-api/host";
import { siteEmailOutbox } from "@/db/schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyStaticBearer } from "@aphrody/shenron-auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 6;
const LEASE_MS = 5 * 60_000;

export async function POST(request: NextRequest) {
  const token = env.SHENRON_BILLING_OUTBOX_TOKEN;
  if (!token) return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  if (verifyStaticBearer(request.headers, [token], { minLength: 32 }) !== "valid") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.SMTP_PASSWORD) {
    return NextResponse.json({ error: "smtp_not_configured" }, { status: 503 });
  }

  const now = new Date();
  const staleLease = new Date(now.getTime() - LEASE_MS);
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(siteEmailOutbox)
      .where(
        or(
          and(eq(siteEmailOutbox.status, "pending"), lte(siteEmailOutbox.availableAt, now)),
          and(eq(siteEmailOutbox.status, "sending"), lt(siteEmailOutbox.lockedAt, staleLease)),
        ),
      )
      .orderBy(asc(siteEmailOutbox.createdAt))
      .limit(BATCH_SIZE)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    await tx
      .update(siteEmailOutbox)
      .set({ status: "sending", lockedAt: now, attempts: sql`${siteEmailOutbox.attempts} + 1` })
      .where(
        inArray(
          siteEmailOutbox.id,
          rows.map((row) => row.id),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      recipient: row.recipient,
      subject: row.subject,
      textBody: row.textBody,
      attempts: row.attempts + 1,
    }));
  });

  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const message of claimed) {
    try {
      await sendSmtpEmail(
        (name) => {
          if (name === "SMTP_PASSWORD") return env.SMTP_PASSWORD;
          if (name === "SMTP_USER") return env.SMTP_USER;
          if (name === "AUTH_EMAIL_FROM") return env.AUTH_EMAIL_FROM;
          return undefined;
        },
        {
          to: message.recipient,
          subject: message.subject,
          text: message.textBody,
        },
      );
      await db
        .update(siteEmailOutbox)
        .set({ status: "sent", sentAt: new Date(), lockedAt: null, lastErrorCode: null })
        .where(eq(siteEmailOutbox.id, message.id));
      sent++;
    } catch {
      const terminal = message.attempts >= MAX_ATTEMPTS;
      const backoffMs = Math.min(60 * 60_000, 30_000 * 2 ** (message.attempts - 1));
      await db
        .update(siteEmailOutbox)
        .set({
          status: terminal ? "failed" : "pending",
          availableAt: new Date(Date.now() + backoffMs),
          lockedAt: null,
          lastErrorCode: "smtp_delivery_failed",
        })
        .where(eq(siteEmailOutbox.id, message.id));
      if (terminal) failed++;
      else retried++;
    }
  }

  return NextResponse.json(
    { claimed: claimed.length, sent, retried, failed },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
