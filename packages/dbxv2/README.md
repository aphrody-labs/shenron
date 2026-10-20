# @aphrody/shenron-dbxv2

Client typé DBXV2 pour les passerelles publiques, avec adaptateurs Bun facultatifs pour un backend privé. Le code est distribué sous Apache-2.0 ; le paquet ne contient ni jeu, ni base privée, ni identifiants Steam.

```ts
import { Dbxv2Client } from "@aphrody/shenron-dbxv2/client";

const client = new Dbxv2Client({
  mode: "public",
  baseUrl: "https://your-gateway.example",
});
const health = await client.health();
```

Remplacer l'origine d'exemple par une passerelle déployée compatible. Le mode public exige HTTPS, refuse les jetons et les URL avec identifiants, paramètres ou fragment. Les requêtes omettent les credentials et refusent les redirections. L'environnement équivalent utilise `DBXV2_CLIENT_MODE=public` et `DBXV2_PUBLIC_URL`.

Le plugin exporté par `@aphrody/shenron-dbxv2/plugin` accepte `publicAssets`, un dictionnaire indexé par le spécificateur `dbxv2:` complet. Chaque entrée déclare `url`, `sha256` et `provenance` ; l'URL HTTPS contient le SHA-256 dans son chemin. Seuls les dérivés PNG, WAV, vidéo et GLB approuvés sont admissibles. Les imports bruts et les modèles JSON restent exclus de ce chemin public.

Les adaptateurs privés utilisent `DBXV2_SERVER_URL` et `DBXV2_TOKEN`. Ne transmettre ces variables ni au navigateur ni à une publication. L'accès direct à la base reste interdit en production et dans les builds publics.

Le WASM Shenron RE sert à analyser les formats DBXV2. Le jeu original nécessite une session de jeu réelle et un transport qualifié ; publier cette bibliothèque ne fournit pas un port WASM du jeu.
