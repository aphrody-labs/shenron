# deploy/cloudflare

Worker CDN (`cdn-worker.ts`) devant le bucket Cloudflare R2 et le cluster Garage S3 de la triade (`shenron-cdn`), origine locale (`cdn-origin.ts`, `shenron-cdn-origin.service`) et outils d'operations dans `cli/`.

## Architecture & Optimisations Edge (Triade Souveraine)

- **Triade Canonique** :
  - `vps` (`10.200.77.1` / `51.77.147.152`) : Build Hub & Mesh Coordinator.
  - `cdn` (`10.200.77.3` / `51.255.162.6`, alias herite `bunos`) : Simulateur Cloudflare Edge (Pingora Gateway, Garage S3 R2 `:3900`, RQLite D1 `:17401`, Workerd, Mail/Auth).
  - `prod` (`10.200.77.5` / `72.60.186.43`, alias herite `dbfr`) : Production Origin Arch Linux 7.2.11 (`dragonballfr.com`).
- **Reduction des Round-Trips & Cache Isolate** : les requetes `GET` lisent et verifient l'objet R2 en un seul appel `CDN.get()` sans `CDN.head()` redondant prealable, et mettent en cache les shards de manifestes immuables en memoire d'isolate.
- **Cache Immutable Maximal** : tous les assets hashes (`/_next/static/`, `/fonts/`, `/objects/<sha256>`) recoivent `Cache-Control: public, max-age=31536000, immutable` tandis que les index mutables (`*/index.json`) conservent `no-store`.
- **Fallback Transparent R2 / Garage S3 (`GARAGE_ORIGIN`)** : support natif des endpoints Cloudflare R2 et Garage S3 (`http://10.200.77.3:3900`) avec verification stricte du digest SHA-256.
- **Headers Zero-Trust & Compression Zstd/Brotli** : application systematique de `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, `Strict-Transport-Security`, `Permissions-Policy` et negociation `zstd` / `br` a la volee pour les payloads compressibles.

Le Worker ne sert que les chemins presents dans les manifests du bucket. Configuration: `wrangler.jsonc`.

```sh
bun test deploy/cloudflare/cdn-worker.test.ts
bun check -p deploy/cloudflare
```

Aucun secret ni manifeste reel dans ce dossier. Les exemples de configuration sont les fichiers `*.example*`.
