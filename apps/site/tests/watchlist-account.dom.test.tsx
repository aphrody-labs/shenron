// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { WatchlistClient } from "../src/app/watchlist/WatchlistClient";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previous = environment.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  environment.IS_REACT_ACT_ENVIRONMENT = previous;
  if (typeof window !== "undefined") window.history.replaceState({}, "", "/watchlist");
});

test.skipIf(typeof document === "undefined")(
  "signed-in watchlist lists the account items with derived statuses and honours ?status=",
  async () => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/watchlist?status=watching");
    const calls: string[] = [];
    const spy = spyOn(globalThis, "fetch").mockImplementation(((input: string) => {
      calls.push(String(input));
      if (String(input).startsWith("/api/me"))
        return Promise.resolve(Response.json({ authenticated: true }));
      if (String(input).startsWith("/api/watchlist"))
        return Promise.resolve(
          Response.json({
            total: 2,
            items: [
              {
                kind: "episode",
                id: "5",
                title: "Account episode",
                href: "/wiki/episodes/5",
                image: null,
                caption: null,
                status: "watching",
                seconds: 300,
                duration: 1200,
                percent: 25,
                language: null,
                savedAt: 1,
                watchedAt: 2,
              },
              {
                kind: "movie",
                id: "m",
                title: "Account movie",
                href: "/wiki/movies/m",
                image: null,
                caption: null,
                status: "planned",
                seconds: 0,
                duration: null,
                percent: null,
                language: null,
                savedAt: 1,
                watchedAt: null,
              },
            ],
          }),
        );
      return Promise.resolve(Response.json({ entries: [], favorites: [] }));
    }) as unknown as typeof fetch);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
          <WatchlistClient />
        </NextIntlClientProvider>,
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    spy.mockRestore();
    expect(calls.some((url) => url.startsWith("/api/watchlist"))).toBe(true);
    const text = container.textContent ?? "";
    expect(text).toContain("Account episode");
    expect(text).not.toContain("Account movie");
    expect(text).toContain("En cours");
    expect(text).toContain("Synchronisée avec ton compte");
    const pressed = container.querySelector('button[aria-pressed="true"]');
    expect(pressed?.textContent).toBe("À reprendre");
  },
);
