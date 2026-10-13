import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import Logs from "../src/app/admin/logs/page";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

for (const locale of ["fr", "en", "ja"] as const) {
  test(`process logs render the real ${locale} dictionary without missing interpolation`, () => {
    const messages = { fr, en, ja }[locale];
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["logs", 100], { logs: [], count: 0, source: "process" });
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <NextIntlClientProvider
            locale={locale}
            messages={messages}
            timeZone="Europe/Paris"
            onError={(error) => {
              throw error;
            }}
          >
            <Logs />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
      expect(html).toContain(messages.adminLogs.title);
      expect(html).toContain(messages.adminLogs.lines);
      expect(html).toContain(messages.adminLogs.empty);
      expect(html).not.toContain("adminLogs.");
    } finally {
      client.clear();
    }
  });
}
