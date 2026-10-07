import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "../../src/public/CommandPalette";

afterEach(cleanup);

test("the shared palette runs without Next against a configurable Bun search server", async () => {
  const categories = [
    "characters",
    "planets",
    "sagas",
    "movies",
    "games",
    "episodes",
    "techniques",
    "races",
    "transformations",
    "arcs",
    "mangaVolumes",
    "mangaChapters",
    "battles",
    "locations",
    "tournaments",
    "voiceActors",
    "soundtracks",
    "powerLevels",
    "items",
    "dragons",
    "contributors",
    "databooks",
    "novels",
  ];
  const payload = {
    q: "goku",
    ...Object.fromEntries(
      categories.map((category, i) => [
        category,
        [
          {
            id: i + 1,
            name: category,
            title: category,
            slug: category,
            series: "DB",
            character_id: 1,
            chapter_number: 1,
            volume_number: 1,
            number_in_series: 1,
            character_name: category,
            power_value_formatted: "9000",
          },
        ],
      ]),
    ),
    sources: [
      {
        url: "https://example.org/source",
        title: "Primary source",
        kind: "publisher",
        httpStatus: 200,
      },
    ],
  };
  let status = 503;
  let requested: URL | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requested = new URL(request.url);
      return Response.json(status === 200 ? payload : { error: "Unavailable" }, { status });
    },
  });
  const destinations: string[] = [];
  const counts: number[] = [];
  try {
    render(
      <CommandPalette
        open
        locale="en"
        onOpenChange={() => {}}
        navigate={(href) => destinations.push(href)}
        searchUrl={`${server.url}search?lang=en`}
        onSearch={(_, count) => counts.push(count)}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("A character, saga, technique, episode…"), {
      target: { value: "goku" },
    });
    await act(async () => {
      await Bun.sleep(250);
    });
    expect(screen.getByRole("alert").textContent).toContain("Search is unavailable");
    expect(counts).toEqual([]);
    status = 200;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {
      await Bun.sleep(250);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requested!.searchParams.get("lang")).toBe("en");
    expect(requested!.searchParams.get("q")).toBe("goku");
    expect(counts).toEqual([24]);
    expect(screen.getAllByRole("option")).toHaveLength(26);
    for (const category of categories) expect(document.body.textContent).toContain(category);
    expect(screen.getByText("Primary source")).toBeTruthy();
    fireEvent.click(screen.getByText("databooks"));
    expect(destinations).toEqual(["/wiki/databooks/22"]);
  } finally {
    cleanup();
    await server.stop(true);
  }
});
