# Console GameCube / Wii (Gecko en WebAssembly)

Mini-jeu `/games/console` : un émulateur GameCube et Wii dans le navigateur. Le joueur fournit son
propre fichier (`.rvz`, `.iso`, `.dol`) ; il est lu localement par morceaux de 8 Mio et n'est jamais
envoyé. Le site ne distribue aucun jeu, aucun BIOS ni aucune image de disque.

## Provenance et licence

- Émulateur : Gecko, <https://github.com/ioncodes/gecko>, **GPL-3.0**. Le lien vers le code source figure
  sur la page. Toute modification locale doit être publiée sous la même licence.
- Build : `wasm-pack` release du crate `crates/web` (LTO fat, `codegen-units = 1`, simd128, tail-call,
  bulk-memory, `wasm-opt`), produit par le pipeline de `C:\src\wii` (`wii-os/pipeline.ps1 -Profile wasm`).
- Révision source et empreinte : `apps/site/src/lib/gecko-wasm.generated.ts` (généré).

## Publication

```sh
bun scripts/ops/prepare-gecko-wasm.ts <dossier pkg de wasm-pack> --source-rev <sha gecko>
set -a; source ~/.aphrody/config/cloudflare.env; set +a
bun scripts/ops/publish-wasm-cdn.ts
```

`prepare-gecko-wasm.ts` nomme les fichiers par empreinte (cache immuable) et réécrit la glue JS vers le
WASM hashé. Les fichiers (`apps/site/public/wasm/gecko/`) sont ignorés par Git : le CDN est la source de
service. Sous Windows, l'étape finale de `publish-wasm-cdn.ts` (copie de `/tmp/cdn-wasm-entries.json`)
échoue sur le chemin `/tmp` : copier `C:/tmp/cdn-wasm-entries.json` et `scripts/ops/cdn-origin-add.ts`
vers `dbfr:/tmp/`, puis lancer `sudo bun /tmp/cdn-origin-add.ts /tmp/cdn-wasm-entries.json` sur dbfr.

## Performance mesurée (2026-10-30)

Image européenne d'un jeu commercial, navigateur avec GPU NVIDIA : disque accepté (2,13 Gio lus en
environ 5 s), émulation à environ 2 à 12 % de la vitesse native, écran noir pendant l'amorçage. Le
goulot est l'interpréteur PowerPC en WASM : le JIT Cranelift de Gecko est natif uniquement. Régler wgpu
n'y change presque rien ; la voie est un recompilateur dynamique qui émet du WebAssembly, chantier à part.
La page l'annonce comme expérimentale ; les petits homebrews (`.dol`) sont la cible réaliste.
