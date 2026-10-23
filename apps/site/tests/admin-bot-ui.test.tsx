import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import CronPage from "../src/app/admin/cron/page";
import ReportsPage from "../src/app/admin/reports/page";
import ServicesPage from "../src/app/admin/services/page";
import { GuildMirrorPanel } from "../src/components/admin/bot/GuildMirrorPanel";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import ja from "../messages/ja.json";

const dictionaries = { fr, en, ja } as const;

function render(
  locale: keyof typeof dictionaries,
  seed: [unknown[], unknown][],
  node: React.ReactNode,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  for (const [key, value] of seed) client.setQueryData(key, value);
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider
          locale={locale}
          messages={dictionaries[locale]}
          timeZone="Europe/Paris"
          onError={(error) => {
            throw error;
          }}
        >
          {node}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

for (const locale of ["fr", "en", "ja"] as const) {
  const m = dictionaries[locale].adminBot;

  test(`cron page renders jobs in ${locale} without missing keys`, () => {
    const html = render(
      locale,
      [
        [
          ["cron"],
          {
            jobs: [
              {
                name: "sanction_expiry",
                description: null,
                intervalMs: 60_000,
                lastRunAt: Date.now() - 5000,
                lastDurationMs: 120,
                runCount: 1234,
                lastError: "boom",
                nextRunAt: Date.now() + 55_000,
              },
            ],
          },
        ],
      ],
      <CronPage />,
    );
    expect(html).toContain("sanction_expiry");
    expect(html).toContain(m.cron.statusError);
    expect(html).not.toContain("adminBot.");
  });

  test(`services page groups actions in ${locale}`, () => {
    const html = render(
      locale,
      [[["services"], { actions: [{ service: "guild", action: "stats", description: "d" }] }]],
      <ServicesPage />,
    );
    expect(html).toContain(m.services.labels.guild);
    expect(html).not.toContain("adminBot.");
  });

  test(`reports page shows the empty state in ${locale}`, () => {
    const html = render(
      locale,
      [[["admin-reports", "open"], { ok: true, items: [], counts: { open: 0 } }]],
      <ReportsPage />,
    );
    expect(html).toContain(m.reports.emptyHint);
    expect(html).not.toContain("adminBot.");
  });

  test(`guild mirror panel renders in ${locale}`, () => {
    const html = render(
      locale,
      [
        [
          ["bot", "guild", "stats"],
          {
            membersPresent: 1200,
            membersLeft: 30,
            bots: 4,
            boosters: 9,
            roles: 40,
            channels: 80,
            lastSyncAt: Date.now() - 3_600_000,
          },
        ],
      ],
      <GuildMirrorPanel />,
    );
    expect(html).toContain(m.guild.stats.present);
    expect(html).toContain(m.guild.search.idle);
    expect(html).not.toContain("adminBot.");
  });
}

test("adminBot dictionaries expose the same keys in fr, en and ja", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  expect(keys(en.adminBot).toSorted()).toEqual(keys(fr.adminBot).toSorted());
  expect(keys(ja.adminBot).toSorted()).toEqual(keys(fr.adminBot).toSorted());
});
