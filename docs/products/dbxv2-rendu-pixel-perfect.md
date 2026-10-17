# Rendu DBXV2 pixel perfect dans le moteur

Propriétaire : `crates/shenron-engine/src/render/` (`pixel_perfect.rs`, `pixel_sprite.rs`,
`model_adapter.rs`, `model_serve.rs`). Contrat côté client : section « Rendu pixel perfect » de
[dbxv2-plugin.md](dbxv2-plugin.md) ; serveur : [../operations/dbxv2-serve.md](../operations/dbxv2-serve.md).

Les données DBXV2 restent privées : le moteur n'embarque aucune texture ni fixture du jeu. L'appelant
fournit les PNG (endpoint `/png`) à l'exécution ; les tests génèrent des motifs synthétiques.

## Contrat

1. **Textures** : `PixelTexture::decode_png` décode sans perte, aux dimensions natives (L, LA, RGB, RGBA
   8 bits ; 16 bits et flottants refusés plutôt que tronqués). Espace colorimétrique (`ColorSpace::Srgb`
   → `Rgba8UnormSrgb`, `Linear` → `Rgba8Unorm`) et alpha (`AlphaMode::Straight | Premultiplied`) sont
   déclarés par l'appelant, jamais devinés. Un seul niveau de mip.
2. **Échantillonneur** : `nearest_sampler_descriptor()` (nearest mag/min, mip nearest bornée à LOD 0,
   `ClampToEdge`). Le layout matériel est `filterable: false` / `NonFiltering`, et le shader utilise
   `textureSampleLevel(..., 0.0)`. UV exacts : `texel_center_uv`.
3. **Alpha** : `blend_state(alpha)` = `ALPHA_BLENDING` (droit) ou `PREMULTIPLIED_ALPHA_BLENDING`.
   `ModelServePipeline::with_alpha` l'applique ; `PixelTexture::premultiplied` convertit (arrondi au plus proche).
4. **Cadrage entier** : `pixel_perfect_box(tex_w, tex_h, box_w, box_h, dpr, max_scale)` calcule l'échelle
   entière maximale en pixels physiques (`dpr` pris en compte, jamais sous 1:1, `overflow` signalé),
   origine centrée sur la grille. `snap_sprite_position` arrondit un sprite 2D au pixel ;
   `pixel_rect_to_clip` et `snapped_ortho` placent les bords exactement sur des frontières de pixels.
5. **Adaptateur** : `model_from_json_with_pngs(json, pngs, color_space, alpha)` remplace le gris neutre par
   les PNG réels, vérifie leur taille contre celle déclarée et leur nombre ; UV, ordre des sommets et
   indices ne sont jamais transformés. Sans texture, `model_from_json` garde le gris de la taille déclarée.

## Tests de golden pixel

- `Framebuffer::draw_sprite` est le rasteriseur logiciel de référence (échantillonnage au centre des
  pixels destination, mélange en octets arrondi au plus proche, exact pour alpha 0 et 255).
- `tests/pixel_perfect_golden.rs` compare octet à octet à un attendu calculé par formule indépendante
  (PNG synthétique → cadrage → pixels) ; le test GPU (`render_sprite_rgba`, wgpu headless, quad aligné,
  lecture avec pitch de 256 octets) est comparé au même attendu. Sans adaptateur wgpu il s'ignore avec message,
  sauf si `SHENRON_REQUIRE_GPU=1` (obligatoire sur la fabrique) : il échoue alors, un skip ne vaut plus succès.
  L'adaptateur détecté est toujours imprimé (`--nocapture`).
- `gpu_translucent_blend_within_documented_bound` : alpha semi-transparent (1..254), Linear/Srgb × droit/prémultiplié,
  comparé à la formule exacte (Linear : octets ; Srgb : lumière linéaire, décodage à l'échantillonnage, encodage à l'écriture).
- Tests unitaires : aller-retour PNG exact, refus 16 bits, contrat sampler/format/blend, cadrage dpr/overflow,
  alpha droit/prémultiplié, adaptateur.

```sh
# fabrique uniquement (build lourd)
flock ~/build/locks/heavy.lock cargo nextest run -p shenron-engine
```

## Limites

- Le mélange CPU (`Framebuffer`) opère sur les octets encodés (pas de linéarisation) : il n'est la référence GPU que
  pour des pixels opaques ou transparents. Pour un alpha semi-transparent, la référence est la formule du test GPU.
- Mesure (fabrique, llvmpipe LLVM 22.1.8, Vulkan, type CPU, 2026-10-18) : Linear droit/prémultiplié et Srgb prémultiplié
  exacts à l'octet ; Srgb droit : écart maximal 1 (90 octets sur 2400, arrondi du mélange flottant). Borne
  `MAX_BLEND_DELTA = 1` assertée ; un GPU matériel peut arrondir autrement, l'exactitude ne vaut que pour l'opaque
  et le transparent.
- `EmbRgbaTexture` ne porte ni espace colorimétrique ni alpha : `ModelServePipeline` suppose `Rgba8UnormSrgb`
  pour les textures de modèle ; le mode alpha se choisit à la création du pipeline.
- Hash et dimensions des PNG réels : `packages/dbxv2/test/texture.live.test.ts` (`DBXV2_LIVE=1`, voir [dbxv2-plugin.md](dbxv2-plugin.md)).
