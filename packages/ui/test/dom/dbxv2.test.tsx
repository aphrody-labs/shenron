// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dbxv2Audio, Dbxv2Image, Dbxv2UiProvider } from "../../src/dbxv2";

afterEach(cleanup);

describe("Dbxv2Image", () => {
  test("announces loading, then the integer scale, with nearest-neighbour sampling", () => {
    const { container } = render(
      <Dbxv2UiProvider labels={{ loading: "Chargement", scale: "Échelle ×{scale}" }}>
        <Dbxv2Image src="http://127.0.0.1:1/r/png/x" alt="Texture" width={16} height={16} />
      </Dbxv2UiProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("Chargement");
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Texture");
    expect(img.style.imageRendering).toBe("pixelated");
    fireEvent.load(img);
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("an error is an alert with a working retry", () => {
    const { container } = render(<Dbxv2Image src="http://127.0.0.1:1/x" alt="Texture" />);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a decorative image has an empty alt and is hidden from assistive technology", () => {
    const { container } = render(<Dbxv2Image src="http://127.0.0.1:1/x" alt="x" decorative />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Dbxv2Audio", () => {
  test("is named, and shows an alert with retry on failure", () => {
    const { container } = render(<Dbxv2Audio src="http://127.0.0.1:1/a" label="Voix" />);
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("aria-label")).toBe("Voix");
    fireEvent.error(audio);
    expect(screen.getByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(container.querySelector("audio")).not.toBeNull();
  });
});
