// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LocaleProvider, useLangue } from "../src/lib/i18n/client";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  if (typeof document !== "undefined") document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
});

function Probe() {
  const { locale, dico, changerLangue } = useLangue();
  return (
    <div>
      <output>{`${locale}:${dico.cardCatalog.title}`}</output>
      <button type="button" onClick={() => changerLangue("ja")}>
        ja
      </button>
    </div>
  );
}

async function mount() {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    // The non-default dictionary is a dynamic import: let it settle.
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  return host.querySelector("output")!;
}

test.skipIf(typeof document === "undefined")(
  "without a cookie only the bundled French dictionary is used",
  async () => {
    const out = await mount();
    expect(out.textContent).toBe("fr:Cartes Dragon Ball officielles");
  },
);

test.skipIf(typeof document === "undefined")(
  "the NEXT_LOCALE cookie loads the English dictionary on demand, and the switcher loads Japanese",
  async () => {
    document.cookie = "NEXT_LOCALE=en; path=/";
    const out = await mount();
    expect(out.textContent).toBe("en:Official Dragon Ball Cards");
    expect(document.documentElement.lang).toBe("en");
    await act(async () => {
      host!.querySelector("button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(out.textContent?.startsWith("ja:")).toBe(true);
    expect(out.textContent).not.toContain("Official Dragon Ball Cards");
    expect(document.documentElement.lang).toBe("ja");
  },
);
