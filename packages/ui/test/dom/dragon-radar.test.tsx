// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DragonRadarSearch, type RadarLinkProps } from "../../src/public/DragonRadarSearch";
import { getDragonRadarMessages } from "../../src/public/dragon-radar-messages";
import { createDragonRadarHttpTransport } from "../../src/public/dragon-radar-http";
import {
  useDragonRadar,
  type RadarResults,
  type RadarTransport,
  type RadarVerdict,
} from "../../src/public/use-dragon-radar";

const empty = (): RadarResults => ({
  characters: [],
  techniques: [],
  transformations: [],
  sagas: [],
  episodes: [],
  movies: [],
  mangaChapters: [],
  mangaVolumes: [],
  battles: [],
  tournaments: [],
});
const anchor = ({ children, ...props }: RadarLinkProps) => <a {...props}>{children}</a>;
const base = {
  messages: getDragonRadarMessages("fr"),
  suggestions: ["Broly"],
  Link: anchor,
  GatedLink: anchor,
  assetUrl: (path: string) => path,
};
async function settle() {
  await act(async () => {
    await Bun.sleep(5);
  });
}
afterEach(cleanup);

test("superseded searches are cancelled, and late results never replace the current query", async () => {
  const requests: {
    query: string;
    signal: AbortSignal;
    resolve: (results: RadarResults) => void;
    reject: (error: Error) => void;
  }[] = [];
  const transport: RadarTransport = {
    search: (query, signal) =>
      new Promise((resolve, reject) => requests.push({ query, signal, resolve, reject })),
    canon: async () => null,
  };
  function Probe({ query, source = transport }: { query: string; source?: RadarTransport }) {
    const state = useDragonRadar(query, "all", source);
    return (
      <div>{state.results?.characters[0]?.name ?? (state.isLoading ? "pending" : "empty")}</div>
    );
  }
  const { rerender, unmount } = render(<Probe query="Goku" />);
  await settle();
  rerender(<Probe query="Vegeta" />);
  await settle();
  expect(requests[0]!.signal.aborted).toBe(true);
  await act(async () =>
    requests[1]!.resolve({ ...empty(), characters: [{ id: 2, name: "Vegeta", slug: "vegeta" }] }),
  );
  await act(async () =>
    requests[0]!.resolve({ ...empty(), characters: [{ id: 1, name: "Goku", slug: "goku" }] }),
  );
  expect(screen.getByText("Vegeta")).toBeTruthy();
  expect(screen.queryByText("Goku")).toBeNull();
  rerender(<Probe query="failed" />);
  expect(screen.queryByText("Vegeta")).toBeNull();
  await settle();
  await act(async () => requests[2]!.reject(new Error("Unavailable")));
  expect(screen.getByText("empty")).toBeTruthy();
  const second: RadarTransport = {
    search: async () => ({ ...empty(), characters: [{ id: 3, name: "Trunks", slug: "trunks" }] }),
    canon: async () => null,
  };
  rerender(<Probe query="failed" source={second} />);
  expect(screen.queryByText("empty")).toBeNull();
  await settle();
  expect(screen.getByText("Trunks")).toBeTruthy();
  rerender(<Probe query="pending" />);
  await settle();
  unmount();
  expect(requests[3]!.signal.aborted).toBe(true);
});

test("a non-cooperative request reaches a deadline, clears loading and can be retried", async () => {
  let attempt = 0;
  let signal!: AbortSignal;
  const transport: RadarTransport = {
    search: (_query, requestSignal) => {
      signal = requestSignal;
      return ++attempt === 1
        ? new Promise(() => {})
        : Promise.resolve({ ...empty(), characters: [{ id: 1, name: "Goku", slug: "goku" }] });
    },
    canon: async () => null,
  };
  render(<DragonRadarSearch {...base} transport={transport} initialQuery="Goku" timeoutMs={20} />);
  await act(async () => {
    await Bun.sleep(35);
  });
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText(base.messages.loading)).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(base.messages.error);
  fireEvent.click(screen.getByRole("button", { name: base.messages.retry }));
  await settle();
  expect(screen.getByRole("link", { name: "Goku" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("all ten result families are visible and restored lore links use real destinations", async () => {
  const results: RadarResults = {
    characters: [{ id: 1, name: "Goku", slug: "goku" }],
    techniques: [{ id: 2, name: "Kaioken", slug: "kaioken" }],
    transformations: [{ id: 3, name: "Super Saiyan", character_id: 1 }],
    sagas: [{ id: 4, name: "Freeza saga", slug: "freeza" }],
    episodes: [{ id: 5, episode_number: 10, title: "An episode" }],
    movies: [{ id: 6, title: "A movie" }],
    mangaChapters: [{ id: 7, chapter_number: null, title: "A chapter" }],
    mangaVolumes: [{ id: 8, volume_number: 1, title: "A volume" }],
    battles: [{ id: 9, name: "Goku vs Freeza" }],
    tournaments: [{ id: 10, name: "Tenkaichi" }],
  };
  let canonCalls = 0;
  let searchCalls = 0;
  const transport: RadarTransport = {
    search: async () => {
      searchCalls++;
      return results;
    },
    canon: async () => {
      canonCalls++;
      return null;
    },
  };
  render(<DragonRadarSearch {...base} initialQuery="Goku" transport={transport} />);
  await settle();
  expect(screen.getAllByRole("link")).toHaveLength(10);
  expect(screen.getByRole("link", { name: "Sagas Freeza saga" }).getAttribute("href")).toBe(
    "/wiki/sagas/freeza",
  );
  expect(
    screen.getByRole("link", { name: "Transformations Super Saiyan" }).getAttribute("href"),
  ).toBe("/wiki/characters/1");
  expect(
    screen.getByRole("link", { name: "Combats Goku vs Freeza" }).getAttribute("href"),
  ).toContain("/wiki/events?type=battles&q=Goku%20vs%20Freeza");
  for (const name of [
    base.messages.manga,
    base.messages.anime,
    base.messages.lore,
    base.messages.all,
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
    await settle();
  }
  expect(canonCalls).toBe(0);
  expect(searchCalls).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: base.messages.clear }));
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  await settle();
  expect(searchCalls).toBe(1);
});

test("only the canon filter consults the arbiter; a slow or failed arbiter does not discard search results", async () => {
  let canonSignal!: AbortSignal;
  const transport: RadarTransport = {
    search: async () => ({ ...empty(), characters: [{ id: 1, name: "Goku", slug: "goku" }] }),
    canon: (_query, signal) => {
      canonSignal = signal;
      return new Promise(() => {});
    },
  };
  render(<DragonRadarSearch {...base} initialQuery="Goku" transport={transport} timeoutMs={20} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: base.messages.canon }));
  await act(async () => {
    await Bun.sleep(35);
  });
  expect(canonSignal.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain(base.messages.canonError);
  fireEvent.click(screen.getByRole("button", { name: base.messages.all }));
  await settle();
  expect(screen.getByRole("link", { name: "Goku" })).toBeTruthy();
});

test("empty filtered results and unknown canon verdicts show an explanation; locales share complete labels", async () => {
  const verdict: RadarVerdict = {
    nature: "inconnu",
    verdict: "",
    explanation: "",
    tier: "",
    tierLabel: "",
    score: 0,
    color: "#ffffff",
  };
  const transport: RadarTransport = { search: async () => empty(), canon: async () => verdict };
  for (const locale of ["fr", "en", "ja"]) {
    const messages = getDragonRadarMessages(locale);
    expect(Object.keys(messages).toSorted()).toEqual(Object.keys(base.messages).toSorted());
    const { unmount } = render(
      <DragonRadarSearch {...base} messages={messages} initialQuery="Goku" transport={transport} />,
    );
    await settle();
    expect(screen.getByText(messages.empty.replace("{query}", "Goku"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.canon }));
    await settle();
    expect(screen.getByText(messages.noVerdict.replace("{query}", "Goku"))).toBeTruthy();
    unmount();
  }
});

test("HTTP transport rejects malformed and failed responses and preserves its abort signal", async () => {
  let body: unknown = {
    ...empty(),
    characters: [{ id: 1, name: "Goku", image: null, race: null }],
    episodes: [{ id: 2, number_in_series: 33, title: "An episode", series: "DB" }],
    mangaChapters: [{ id: 1, title: null, chapter_number: null }],
  };
  let status = 200;
  const queries: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      queries.push(new URL(request.url).searchParams.get("q") ?? "");
      return Response.json(body, { status });
    },
  });
  const transport = createDragonRadarHttpTransport(
    new URL("search", server.url).href,
    new URL("canon", server.url).href,
  );
  const controller = new AbortController();
  try {
    const parsed = await transport.search("Goku & Vegeta", controller.signal);
    expect(parsed.mangaChapters[0]?.title).toBeNull();
    expect(parsed.characters[0]?.name).toBe("Goku");
    expect(parsed.episodes[0]?.episode_number).toBe(33);
    expect(queries).toEqual(["Goku & Vegeta"]);
    body = { characters: [] };
    await expect(transport.search("x", controller.signal)).rejects.toThrow(
      "Missing search collection",
    );
    body = { ...empty(), characters: [{ id: 1, name: {}, slug: "goku" }] };
    await expect(transport.search("x", controller.signal)).rejects.toThrow("Invalid search record");
    status = 503;
    await expect(transport.search("x", controller.signal)).rejects.toThrow("Search unavailable");
    status = 200;
    body = { verdict: editorialVerdict, evidenceAssessmentEnabled: true };
    expect((await transport.canon("x", controller.signal))?.evidenceAssessmentEnabled).toBe(true);
    body = { verdict: editorialVerdict, evidenceAssessmentEnabled: "true" };
    await expect(transport.canon("x", controller.signal)).rejects.toThrow(
      "Invalid evidence capability",
    );
    body = { verdict: editorialVerdict };
    expect((await transport.canon("x", controller.signal))?.evidenceAssessmentEnabled).toBe(false);
    body = { verdict: null };
    expect(await transport.canon("x", controller.signal)).toBeNull();
    controller.abort();
    await expect(transport.search("x", controller.signal)).rejects.toThrow();
  } finally {
    server.stop(true);
  }
});

test("evidence HTTP action selects only references in its bounded response", async () => {
  let body: unknown = {
    evidenceDecision: { status: "selected", referenceId: "ref" },
    references: [{ id: "ref", subject: "Interview", source: "Guide", href: "javascript:bad" }],
  };
  const requests: URL[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url));
      return Response.json(body);
    },
  });
  const transport = createDragonRadarHttpTransport(server.url.href, server.url.href + "?locale=fr");
  try {
    expect(await transport.assessEvidence!("Goku & Vegeta", new AbortController().signal)).toEqual({
      status: "selected",
      referenceId: "ref",
      referenceIndex: 0,
      subject: "Interview",
      source: "Guide",
    });
    expect(requests[0]?.searchParams.get("assessEvidence")).toBe("1");
    expect(requests[0]?.searchParams.get("q")).toBe("Goku & Vegeta");
    body = { evidenceDecision: { status: "selected", referenceId: "unknown" }, references: [] };
    await expect(transport.assessEvidence!("Goku", new AbortController().signal)).rejects.toThrow(
      "Unknown evidence reference",
    );
    body = {};
    expect(await transport.assessEvidence!("Goku", new AbortController().signal)).toEqual({
      status: "unavailable",
    });
    const count = requests.length;
    await expect(
      transport.assessEvidence!("x".repeat(401), new AbortController().signal),
    ).rejects.toThrow("Invalid evidence question");
    expect(requests.length).toBe(count);
  } finally {
    server.stop(true);
  }
});
const editorialVerdict: RadarVerdict = {
  nature: "verdict",
  verdict: "Curated verdict",
  explanation: "Curated explanation",
  tier: "A",
  tierLabel: "Canon",
  score: 100,
  color: "#ffffff",
  evidenceAssessmentEnabled: true,
};

test("evidence is explicit, singleflight and cancelled immediately on typing", async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  let finish!: (value: { status: "abstained" }) => void;
  const transport: RadarTransport = {
    search: async () => empty(),
    canon: async () => editorialVerdict,
    assessEvidence: (_query, currentSignal) => {
      calls++;
      signal = currentSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  render(<DragonRadarSearch {...base} initialQuery="Goku" transport={transport} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: base.messages.canon }));
  await settle();
  expect(calls).toBe(0);
  const button = screen.getByRole("button", { name: base.messages.evidenceAction });
  fireEvent.click(button);
  fireEvent.click(button);
  await settle();
  expect(calls).toBe(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Vegeta" } });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish({ status: "abstained" });
  });
  expect(screen.queryByText(base.messages.evidenceAbstained)).toBeNull();
});

test("localized evidence links and abstention preserve the curated verdict", async () => {
  for (const locale of ["fr", "en", "ja"]) {
    const messages = getDragonRadarMessages(locale);
    let selected = true;
    const transport: RadarTransport = {
      search: async () => empty(),
      canon: async () => editorialVerdict,
      assessEvidence: async () =>
        selected
          ? {
              status: "selected",
              referenceId: "ref",
              referenceIndex: 2,
              subject: "Interview",
              source: "Guide",
            }
          : { status: "abstained" },
    };
    const view = render(
      <DragonRadarSearch
        {...base}
        messages={messages}
        initialQuery="Goku & Vegeta"
        transport={transport}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole("button", { name: messages.canon }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: messages.evidenceAction }));
    await settle();
    expect(
      screen
        .getByRole("link", { name: new RegExp(messages.evidenceSelected) })
        .getAttribute("href"),
    ).toBe("/wiki/canon?q=Goku%20%26%20Vegeta#canon-reference-2");
    selected = false;
    fireEvent.click(screen.getByRole("button", { name: messages.evidenceAction }));
    await settle();
    expect(screen.getByText(messages.evidenceAbstained)).toBeTruthy();
    expect(screen.getByText("Curated verdict")).toBeTruthy();
    view.unmount();
  }
});

test("unsupported capability hides action and unresponsive inference times out", async () => {
  let enabled = false;
  const transport: RadarTransport = {
    search: async () => empty(),
    canon: async () => ({ ...editorialVerdict, evidenceAssessmentEnabled: enabled }),
    assessEvidence: () => new Promise(() => {}),
  };
  const view = render(
    <DragonRadarSearch {...base} initialQuery="Goku" transport={transport} timeoutMs={20} />,
  );
  await settle();
  fireEvent.click(screen.getByRole("button", { name: base.messages.canon }));
  await settle();
  expect(screen.queryByRole("button", { name: base.messages.evidenceAction })).toBeNull();
  view.unmount();
  enabled = true;
  render(<DragonRadarSearch {...base} initialQuery="Goku" transport={transport} timeoutMs={20} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: base.messages.canon }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: base.messages.evidenceAction }));
  await act(async () => {
    await Bun.sleep(35);
  });
  expect(screen.getByText(base.messages.evidenceUnavailable)).toBeTruthy();
  expect(screen.getByText("Curated verdict")).toBeTruthy();
});
