/* oxlint-disable jsx-a11y/prefer-tag-over-role -- reviewed: admin-only private tooling, behavior preserved */
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createTranslator } from "next-intl";
import {
  Dbxv2Audio,
  Dbxv2Image,
  Dbxv2ModelViewer,
  Dbxv2UiProvider,
  Dbxv2Video,
} from "@aphrody/shenron-ui/dbxv2";
import "@aphrody/shenron-ui/dbxv2.css";
import { requireAdmin } from "@/lib/session";
import { dbxv2Locale, dbxv2Text } from "@/lib/dbxv2-text";
import { loadImmersionPack } from "@/lib/dbxv2-immersion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Immersion",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Owner preview of the immersion slots of Dragon Pixel. The public game never reads this pack: a
 * private page that wants the sounds and textures calls `loadImmersionPack()` after
 * `requireAdmin()`; without the gate or the map it gets nothing and renders as the public page.
 */
export default async function AdminDbxv2ImmersionPage() {
  await requireAdmin();
  const locale = dbxv2Locale(await getLocale());
  const messages = dbxv2Text(locale);
  const t = createTranslator({ locale, messages });
  const pack = await loadImmersionPack();
  const names = Object.keys(pack).toSorted();

  return (
    <main className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">{messages.immersion.title}</h1>
      <p>{messages.immersion.lede}</p>
      <p className="my-2">
        <Link href="/admin/dbxv2" className="underline">
          {messages.title}
        </Link>
      </p>
      <Dbxv2UiProvider labels={messages.viewer}>
        {names.length === 0 ? (
          <p role="status">{messages.immersion.none}</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {names.map((name) => {
              const slot = pack[name]!;
              const label = t("immersion.slot", { name });
              return (
                <li key={name}>
                  <h2 className="text-lg font-semibold">{label}</h2>
                  {slot.kind === "png" && <Dbxv2Image src={slot.url} alt={label} />}
                  {slot.kind === "wav" && <Dbxv2Audio src={slot.url} label={label} />}
                  {slot.kind === "video" && <Dbxv2Video src={slot.url} label={label} />}
                  {slot.kind === "model.glb" && <Dbxv2ModelViewer src={slot.url} title={label} />}
                </li>
              );
            })}
          </ul>
        )}
      </Dbxv2UiProvider>
    </main>
  );
}
