// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { auditHtml } from "./uiux-rules";

const GOOD = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accueil</title></head>
<body><a href="#main" class="skip">Aller au contenu</a><main id="main"><h1>Titre</h1><h2>Section</h2>
<img src="/a.png" alt="Goku" width="10" height="10"><button aria-label="Fermer"><svg></svg></button>
<a href="/x">Lien</a><label for="q">Recherche</label><input id="q"></main></body></html>`;

const rules = async (html: string) => (await auditHtml(html)).map((i) => i.rule);

describe("uiux static rules", () => {
  test("a conforming document has no issue", async () => {
    expect(await auditHtml(GOOD)).toEqual([]);
  });

  test("reports document-level defects", async () => {
    const found = await rules(
      `<html><head><meta name="viewport" content="width=device-width, user-scalable=no"><title></title></head><body></body></html>`,
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "lang-attr",
        "zoom-disabled",
        "page-title",
        "heading-h1",
        "landmark-main",
        "skip-links",
      ]),
    );
  });

  test("reports heading skips and missing alt text", async () => {
    const found = await rules(
      GOOD.replace("<h2>", "<h4>").replace("</h2>", "</h4>").replace(' alt="Goku"', ""),
    );
    expect(found).toContain("heading-hierarchy");
    expect(found).toContain("alt-text");
  });

  test("icon-only controls need an accessible name", async () => {
    expect(await rules(GOOD.replace(' aria-label="Fermer"', ""))).toContain("aria-labels");
    expect(
      await rules(
        GOOD.replace(
          '<a href="/x">Lien</a>',
          '<a href="/x"><img src="/i.png" alt="Accueil" width="1" height="1"></a>',
        ),
      ),
    ).not.toContain("aria-labels");
  });

  test("absolutely positioned fill images do not shift layout", async () => {
    const fill =
      '<img src="/f.png" alt="" data-nimg="fill" style="position:absolute;height:100%;width:100%">';
    expect(await rules(GOOD.replace("</main>", `${fill}</main>`))).not.toContain(
      "image-dimensions",
    );
  });

  test("controls wrapped in a label and aria-hidden duplicate links are not flagged", async () => {
    const wrapped = GOOD.replace(
      "</main>",
      '<label><input type="checkbox">Auto</label><a href="/x" tabindex="-1" aria-hidden="true"><img src="/i.png" alt="" data-nimg="fill"></a></main>',
    );
    const found = await rules(wrapped);
    expect(found).not.toContain("form-labels");
    expect(found).not.toContain("aria-labels");
  });

  test("form controls need a label", async () => {
    expect(await rules(GOOD.replace('<label for="q">Recherche</label>', ""))).toContain(
      "form-labels",
    );
  });

  test("positive tabindex, inline outline removal and unsized images are flagged", async () => {
    const found = await rules(
      GOOD.replace('<a href="/x">', '<a href="/x" tabindex="3" style="outline:none">').replace(
        ' width="10" height="10"',
        "",
      ),
    );
    expect(found).toEqual(
      expect.arrayContaining(["tabindex-positive", "focus-states", "image-dimensions"]),
    );
  });
});
