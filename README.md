<!-- SPDX-License-Identifier: Apache-2.0 -->

# Shenron

Shenron est le produit de [dragonballfr.com](https://dragonballfr.com) : encyclopédie
Dragon Ball, actualités, bot Discord, API, lecteurs manga et databooks, recherche
RAG, chaîne éditoriale et **Shenron Studio**, l'éditeur de traduction manga.
Les interfaces proposent le français, l'anglais et le japonais.

## Architecture et données

| Chemin                                                              | Propriétaire fonctionnel                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/site`                                                         | Application Next 16 : site public, administration, `/studio`, lecteurs et passerelle `/mcp`. |
| `apps/bot`                                                          | Bot Discord et API Bun.                                                                      |
| `apps/server`                                                       | Serveur autonome et pont des API locales.                                                    |
| `packages/ui`                                                       | Couche UI unique, lecteurs et Shenron Studio.                                                |
| `packages/{api,auth,config,db,images,koharu,media,native,pipeline}` | Contrats, configuration, données et adaptateurs des capacités Aphrody.                       |
| `crates/shenron-*`                                                  | CLI, MCP, RAG, moteur RE, liaison native et application de bureau.                           |
| `crates/koharu-*`                                                   | Moteur de traduction manga ; Koharu reste un nom de code interne.                            |
| `plugin/`                                                           | Compétences et manifestes Claude Code, Antigravity, Codex et ChatGPT.                        |
| `deploy/cloudflare`                                                 | Worker CDN R2 et outils de transfert/qualification.                                          |

Les paquets JavaScript du produit utilisent `@aphrody/shenron-*`. PostgreSQL
est la source éditoriale ; SQLite est le réplica du bot. Les écritures passent
par les writers authentifiés et révisés. Redis contient des projections
reconstructibles, dont les articles publics dans la base logique 4 ; il ne
remplace pas PostgreSQL. Les contenus futurs ou en brouillon restent exclus
[du miroir des actualités](docs/operations/news-redis.md).

Les capacités ML, OCR, traduction et navigateur proviennent d'Aphrody. Shenron
les consomme sans recopier leur propriétaire. Le moteur Rust `shenron-re` et la
liaison `@aphrody/shenron-native/re` exposent les parseurs DBXV2 et CPK. Les
fichiers de jeu, sauvegardes et extractions restent dans leurs stores protégés ;
la présence d'un parseur ne constitue pas une publication d'assets du jeu.

## Développement

Lire [AGENTS.md](AGENTS.md) et [START-HERE.md](START-HERE.md) avant modification.
Le runtime est Bun 1.4.4 d'Aphrody ; Rust est épinglé dans `rust-toolchain.toml`
(actuellement 1.98.1), TypeScript local dans les dépendances (7.0.2).

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run check:rust
bun run clippy:rust
bun run test:rust
```

Le lecteur vidéo sépare les contrôles React, la reprise propre à chaque source et
l'adaptateur HLS fourni par `@aphrody/bun-video`. Le build utilise les assets same-origin
et notices explicitement exposés par ce propriétaire. Qualité et pistes viennent des médias réels.
Les fonctions DRM requièrent une configuration autorisée du fournisseur.

Les commandes natives du fork sont accessibles par `bun run check:native`,
`bun run lint:native` et `bun run format:native:check`. Le lanceur utilise le Bun
courant, ou le chemin absolu `SHENRON_BUN_EXECUTABLE`, placé en tête du PATH enfant.
Sur Windows, définir cette variable dans PowerShell ; sur le VPS, la fournir au
job Infra avec le chemin de l'artefact qualifié. Le PATH existant, dont Cargo, est
conservé. Bun 1.4.4 intègre OXC ; le format natif ne remplace pas encore la porte
`bun fmt` complet. Les portes `bun check` et les contrôles canoniques restent requis.

Les suites live nécessitent leurs services réels. Les gates ne prouvent pas un
déploiement. Les builds lourds passent par la fabrique VPS ; l'Infra Aphrody
active sur DBFR les artefacts scellés. Les règles de claims et de données sont
[documentées dans les consignes](AGENTS.md).

| Artefact                   | Commande de construction               |
| -------------------------- | -------------------------------------- |
| `shenron-server`           | `bun scripts/build/server.ts`          |
| `shenron-bot`              | `bun scripts/build/bot.ts`             |
| Application Shenron Studio | `bun scripts/build/desktop.ts`         |
| CLI `shenron`              | `cargo build --release -p shenron-cli` |
| `shenron-mcp`              | `cargo build --release -p shenron-mcp` |

Le script [install.ps1](install.ps1) installe sur Windows un installeur local ou
un artefact de GitHub Releases et vérifie son SHA-256. Ce mécanisme n'établit pas
qu'une release téléchargeable existe pour chaque commit. `shenron-server doctor`
et `paths` diagnostiquent les capacités locales ; aucun credential de production
n'est livré avec l'application.

## MCP, plugin et A2A

Le plugin Claude Code déclare le binaire stdio `shenron-mcp` dans
`plugin/.mcp.json`. Les manifestes portables déclarent le MCP HTTP public
[dragonballfr.com/mcp](https://dragonballfr.com/mcp). Le serveur public filtre
les outils privés ; les noms du protocole sont `dragonball.*`. Vérifier
`tools/list` et les annotations du serveur connecté avant de conclure à une
capacité. Une connexion publique ne donne pas de droits éditoriaux.

```sh
bun scripts/plugin/sync.ts --check
bun scripts/plugin/sync.ts
```

La synchronisation orchestre les générateurs canoniques et aligne les versions,
URL et références embarquées. Elle est idempotente, sans accès aux comptes ni
commit/push automatique. Voir le [contrat du plugin](plugin/references/synchronization.md)
et les [consignes Codex/ChatGPT](plugin/openai/README.md). Une marketplace locale
ne prouve pas une publication dans l'annuaire public d'OpenAI.

A2A utilise le client de coordination durable Aphrody du pipeline Shenron,
configuré par `APHRODY_A2A_COORD_API`. Une configuration absente est une erreur
en production. Ce transport et l'authentification des routes A2A sont distincts
du MCP ; leur présence dans le code ne prouve pas l'exécution d'un agent distant.

## CDN et opérations

Le [Worker CDN R2](deploy/cloudflare/README.md) sert uniquement les chemins
répertoriés dans les manifests, avec objets adressés par SHA-256. Les outils
[Cloudflare](docs/operations/cloudflare-cli.md) et
[de transfert](docs/operations/cloudflare-transfer.md) décrivent la qualification.
Les flags d'import et de vérification restent des contrôles opératoires ; une
configuration de dépôt ne prouve ni la copie des objets ni la bascule DNS.
La configuration SSH, GitHub, Cloudflare et OVH appartient aux workflows Infra
et aux stores protégés, jamais aux manifestes distribués du plugin.

La [documentation](docs/README.md), la [carte d'architecture](docs/architecture/STACK.md)
et le [plan directeur](docs/reference/root/PLAN.md) détaillent les contrats.

## Licence et sources

Apache-2.0 ([LICENSE](LICENSE)). Le moteur Koharu conserve MIT OR Apache-2.0
et ses notices d'origine dans [docs/licenses/koharu](docs/licenses/koharu).
Dragon Ball © Bird Studio/Shueisha, Toei Animation : projet de fans.
Le manga, les databooks et les déclarations vérifiables priment ; Fandom n'est
pas une source éditoriale. Les sous-modules conservent leurs licences propres.
