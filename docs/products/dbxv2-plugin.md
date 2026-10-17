# Paquet DBXV2 privé — `@aphrody/shenron-dbxv2`

Accès typé à Dragon Ball Xenoverse 2 (Bandai Namco / Dimps) : client du serveur à la demande
[`scripts/ops/dbxv2-serve.ts`](../operations/dbxv2-serve.md), base privée, plugin Bun `dbxv2:`,
helpers de rendu pixel perfect. Paquet **privé** (`private: true`), dans `packages/dbxv2`.

**Données privées.** Aucun octet du jeu, aucun index réel, aucun chemin réel n'entre dans Git, un
test, le VFS, un bundle ou un artefact public. Pas de parseur ici : le serveur et `@shenron/dbxv2`
convertissent. Aucune recherche de clé, aucun contournement.

## Activation

Désactivé par défaut. Variables ([ENV.md](../operations/ENV.md)) : `DBXV2_SERVER_URL`,
`DBXV2_TOKEN` (≥ 16 caractères), `DBXV2_DB_PATH`. `isDbxv2Enabled(env)` est faux sans URL valide
(http(s), sans identifiants ni `0.0.0.0`) ou sans jeton, et **toujours faux** en rendu ou build
public (`SHENRON_PROFILE=public`, `SHENRON_PUBLIC_RENDER=1`, `SHENRON_PUBLIC_BUILD=1`) et avec
`NODE_ENV=production`. `dbxv2Status(env)` donne la raison.

## Client (`@aphrody/shenron-dbxv2/client`, classe `pure`)

```ts
const client = createDbxv2Client({ baseUrl, token });
await client.health(); // sans jeton
await client.cpks();
await client.find("CHARA", { q: "ext:emb", limit: 100 }); // findAll() parcourt les pages
await client.raw("CHARA/a/b.bin", { range: { start: 0, end: 1023 } }); // 206 + Content-Range
await client.download(ref, { chunkSize, onProgress, resume }); // plages + reprise
const { binary, info } = await client.texture(ref, { index: 0 });
await client.wav(ref, { cue });
await client.video(ref);
await client.modelJson(ref, { emb, esk });
await client.modelGlb(ref);
```

- Référence : `"<cpk>/<chemin>"` ou `{ cpk, path }` (`parseRef`).
- Jeton uniquement dans `Authorization: Bearer` ; `toJSON()` ne l'expose pas ; jamais en query.
- Réponses JSON validées par zod v4 (`schemas`) ; erreur `Dbxv2SchemaError` avec les `issues`.
- Erreurs typées (`errors`) : `Dbxv2AuthError` (401), `Dbxv2NotFoundError` (404),
  `Dbxv2RangeError` (416), `Dbxv2BusyError` (503), `Dbxv2TimeoutError` (504/délai),
  `Dbxv2ServerError`, `Dbxv2NetworkError`, `Dbxv2AbortError`, `Dbxv2ChangedError`,
  `Dbxv2ConfigError`, `Dbxv2DisabledError`. `attempt(fn)` renvoie un `Result` pour ces erreurs.
- `AbortSignal` partout. Requêtes identiques concurrentes dédupliquées (le fetch partagé n'est
  annulé que si tous les appelants annulent). Retries bornés (réseau, 502/503/504).
- Cache LRU mémoire (octets + entrées + fraîcheur) avec revalidation `If-None-Match` → 304.
  Les tableaux d'octets retournés sont partagés : lecture seule.
- `download` lit par plages avec `If-Range` ; en cas d'échec, `error.partial` permet de reprendre
  (`resume`), et un contenu modifié entre-temps lève `Dbxv2ChangedError`.

## URLs sans jeton : proxy local signé (`./proxy`)

```ts
const proxy = createDbxv2Proxy({ upstream: { baseUrl, token }, ttlSeconds: 300 });
proxy.url.png("CHARA/a/b.emb", { index: 0 }); // <img src>
proxy.url.audio(ref, { cue: 1 });
proxy.url.video(ref);
proxy.url.modelGlb(ref);
```

Écoute sur le loopback uniquement. URL `/r/<kind>/<cpk>/<chemin>?exp=…&sig=…` : HMAC-SHA256
(secret aléatoire par processus) sur genre, entrée, paramètres et expiration ; durée de vie 1 s à
1 h. Le proxy injecte lui-même le jeton, relaie `Range`, `If-Range`, `If-None-Match`, diffuse en
flux, refuse tout paramètre non signé (400), toute signature fausse ou expirée (403), toute
méthode hors GET/HEAD, et n'envoie aucun CORS (`Cross-Origin-Resource-Policy: same-site`).
Refusé en contexte public.

## Plugin Bun `dbxv2:` (`./plugin`, `./preload`)

```ts
import url from "dbxv2:CHARA/chemin/dans/le/cpk.emb?png"; // string : URL signée
import wav from "dbxv2:BGM/x.acb?wav&cue=1"; // string
import clip from "dbxv2:MOVIE/x.usm?video"; // string
import glb from "dbxv2:CHARA/x.emd?glb"; // string
import model from "dbxv2:CHARA/x.emd?model"; // ModelJson validé (top-level await)
import bytes from "dbxv2:CHARA/x.bin?raw"; // ArrayBuffer (top-level await)
```

Exports nommés : `ref`, `url`, `blob(signal?)`, `arrayBuffer(signal?)` (`model` : `jsonUrl`,
`glbUrl`). Paramètres après le format : `index`, `cue`, `emb`, `esk`.

Enregistrement par bunfig :

```toml
[test]
preload = ["./packages/dbxv2/src/preload.ts"]
[run]
preload = ["./packages/dbxv2/src/preload.ts"]
```

Les modules générés sont de fins wrappers (marqueur `@dbxv2-private`) : le serveur et le jeton
sont lus dans l'environnement à l'exécution, rien n'est fixé dans un module. Sans serveur ou
jeton, l'import échoue avec la raison et les variables à poser.

**Garde de build.** `Bun.build` avec le plugin est refusé (`Dbxv2BuildRefusedError`) en build
public/production : `NODE_ENV=production`, profil public, `minify`, `define` de production.
`scripts/build/server.ts` échoue si l'arbre de release contient un module généré, le marqueur ou
`dbxv2.d.ts` (`findDbxv2Leaks`).

## Déclarations typées (`./declarations`)

`bun run --filter @aphrody/shenron-dbxv2 types` (ou `--from-db`) écrit
`var/dbxv2/dbxv2.d.ts` (ignoré par Git, refusé hors d'un dossier `var/`) : modules ambiants
`dbxv2:*?png|wav|video|glb|model|raw` et unions `Dbxv2KnownPath`, `Dbxv2KnownImage`,
`Dbxv2KnownAudio`, `Dbxv2KnownVideo`, `Dbxv2KnownModel` lues depuis l'index privé (gabarit
`${string}/${string}` au-delà de 20 000 chemins). Les paramètres (`&index=`) fonctionnent à
l'exécution mais ne sont pas typés par les modules ambiants (un seul `*` par motif) ; à ajouter
à un `tsconfig` local via `include`.

## Base privée (`./db`)

`openDbxv2DbFromEnv(env)` ouvre `DBXV2_DB_PATH` en lecture seule ; `openDbxv2Db`,
`Dbxv2Db` (`search` hybride BM25 + e5, `files`, `file`, `characters`, `messages`, `stats`),
`decodeMsg`, `decodeCms` sont réexportés de `@aphrody/shenron-db/dbxv2` (sous-chemin ajouté, classe
`bun`), sans duplication. `iterateDbxv2Refs`, `refOfFile` font le lien avec le client.

## Rendu pixel perfect

1. **Textures** (`client.texture`) : PNG sans perte aux dimensions natives, octets du serveur
   inchangés (aucun rééchantillonnage ni recompression). `Dbxv2TextureInfo` : `width`, `height`
   (lus dans l'en-tête PNG, égaux à l'EMB), `bitDepth`, `pngColorType`, `colorSpace`
   (`srgb` par défaut), `alpha` (`straight` par défaut), `sha256` des octets exacts,
   `byteLength`. Espace colorimétrique et mode alpha sont **déclarés** (le PNG ne les porte pas) et
   surchargeables par appel. Un format non décodé (GNF PS4) lève `Dbxv2UnsupportedFormatError` ;
   un non-PNG, `Dbxv2SchemaError` : jamais d'approximation. L'`ETag` du serveur est exposé
   (`binary.etag`).
2. **DOM / canvas** (`./pixel-perfect`, `pixelPerfect(w, h, box, { dpr, maxScale, strict })`) :
   échelle entière en pixels physiques (`dpr` pris en compte), jamais en dessous de 1:1
   (`overflow` ou `strict`), position centrée et alignée sur la grille de pixels physiques,
   `pixelPerfectStyle` (`image-rendering: pixelated`), `drawPixelPerfect` (lissage désactivé,
   destination entière). Aucun sous-pixel.
3. **wgpu / Bevy (`crates/shenron-engine`)** : contrat à appliquer, `NEAREST_SAMPLER` en est
   le descripteur wgpu. Bevy : `ImageSampler::nearest()`, `mip_level_count = 1`,
   `AddressMode::ClampToEdge`, UV exacts (centres de texels, sans biais), quad et viewport dont la
   taille est un multiple entier de la texture en pixels physiques et dont l'origine est un pixel
   physique entier, format `Rgba8UnormSrgb` (couleur) ou `Rgba8Unorm` (données) selon
   `colorSpace` (`wgpuTextureFormat`). Alpha `straight` : mélange `SrcAlpha/OneMinusSrcAlpha` ;
   `premultiplied` : `One/OneMinusSrcAlpha`.
4. **Modèles** : `modelJson` valide la forme (`looseObject`, champs inconnus conservés) mais ne
   transforme rien : UV, ordre des sommets et indices, normales et squelette sont ceux du serveur.
   Le glTF binaire est servi tel quel.
5. **Vérification** : mêmes octets d'entrée ⇒ même `sha256` (test d'invariance), dimensions du
   PNG = en-tête. Test réel `packages/dbxv2/test/texture.live.test.ts` (`DBXV2_LIVE=1`, `DBXV2_SERVER_URL`,
   `DBXV2_TOKEN`, exécuté sur la fabrique, échantillon tiré par `find`) : sha256 du client = `node:crypto` sur un
   `fetch` direct ; largeur/hauteur = en-tête DDS lu dans les octets `raw` de l'EMB ; deux requêtes identiques
   (octets, sha256, ETag) ; PNG 8 bits RGB/RGBA décodé indépendamment. Mesuré le 2026-10-18 sur 12 textures
   (DXT1 ×5, DXT5 ×7) : tout passe. Reste **supposé** : `colorSpace = srgb` (aucun indicateur dans DDS ni PNG) ;
   `alpha = straight` n'est réfuté que si aucune texture semi-transparente n'a de canal couleur > alpha (5 sur 6
   en ont : prémultiplié exclu ; 1 est compatible avec les deux).

## Tests

```sh
cd packages/dbxv2 && bun test            # serveur factice local, plugin via Bun.build / sous-processus
bun check --project tsconfig.json        # types stricts, sans any
bun scripts/audit/check-workspace-packages.ts --package @aphrody/shenron-dbxv2
```

Les tests n'emploient que des octets inventés (aucune donnée du jeu).

## Limites

- Les URL signées ne valent que tant que le processus qui les a émises (proxy) vit ; un secret
  par processus.
- Le serveur ne publie ni espace colorimétrique ni mode alpha : ils sont déclarés ici, à
  confirmer sur des sources réelles.
- Les modules `?model` / `?raw` chargent en mémoire (top-level await) ; privilégier `?glb` ou
  `download` pour les gros fichiers.
- Typage des paramètres d'import (`&index=`) non couvert par les modules ambiants.
- Le runtime ne fonctionne que sous Bun (proxy `Bun.serve`) ; le client seul est portable.
- Pas d'intégration site / UI / moteur dans ce lot.
