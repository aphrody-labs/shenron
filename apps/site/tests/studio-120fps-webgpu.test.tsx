// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShenronWebStudio } from "../src/components/studio/ShenronWebStudio";

describe("Shenron Studio 120 FPS WebGPU & Minimal Desktop Slidebar", () => {
  it("renders Chapter 1421 Page 1 with 120 FPS telemetry and accessible toolrail", () => {
    const markup = renderToStaticMarkup(
      <ShenronWebStudio source={{ kind: "chapter", id: 1421, page: 1 }} />,
    );

    // Verify 120 FPS performance telemetry
    expect(markup).toContain("120 FPS");
    expect(markup).toContain("SHENRON STUDIO");
    expect(markup).toContain("Chapitre 1421");
    expect(markup).toContain("Planche 1");

    // Verify minimal desktop toolrail & accessibility
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Barre d&#x27;outils Shenron Studio WebGPU 120 FPS"');
    expect(markup).toContain('aria-label="Sélectionner (V)"');
    expect(markup).toContain('aria-label="Déplacement / Pan (H ou Espace)"');
    expect(markup).toContain('aria-label="Bulles de texte OCR (T)"');
    expect(markup).toContain('aria-label="Pinceau Retouche (B)"');
    expect(markup).toContain('aria-label="Inpainting Nettoyage (I)"');
    expect(markup).toContain('aria-label="Gomme (E)"');

    // Verify touch target compliance
    expect(markup).toContain("min-h-11 min-w-11");

    // Verify Fullscreen 120 FPS toggle
    expect(markup).toContain('aria-label="Plein écran 120 FPS (F)"');

    // Verify Screen Reader live announcer
    expect(markup).toContain('aria-live="polite"');
  });

  it("handles fallback and custom chapter/page navigation cleanly", () => {
    const markup = renderToStaticMarkup(
      <ShenronWebStudio source={{ kind: "chapter", id: 1421, page: 2 }} />,
    );

    expect(markup).toContain("Planche 2");
    expect(markup).toContain('aria-label="Planche précédente"');
    expect(markup).toContain('aria-label="Planche suivante"');
  });
});
