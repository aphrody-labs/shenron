# ADR 0001 : Pile du site et du natif

- **Statut** : Accepté
- **Date** : 2026-11-05
- **Décideurs** : aphrody-dev, via ADR 0003 de yolo-stack
- **Pilier(s) concerné(s)** : apps/site, packages/ui, crates/shenron-desktop

## Contexte

`apps/site` est un serveur Next.js 16 et `packages/ui` une couche React avec Tailwind et Base UI. Le propriétaire impose une refonte complète en Rust et Bun, sans Next.js, Tailwind, Base UI ni shadcn, avec WebGPU réel et Taffy. L'ADR 0003 de yolo-stack (`C:\src\yolo-stack\docs\decisions\0003-verdict-leptos-dioxus-tanstack.md`) a départagé trois arbitrages contradictoires sur la base des mesures krausest publiées le 2026-10-25.

## Décision

Nous retenons Leptos 0.8 (SSR et îlots) sur Axum pour le site public, Dioxus pour Shenron Studio et les applications natives, wgpu, vello, Parley, Taffy et AccessKit pour le rendu partagé, et Bun 1.4.4+ pour l'outillage, le bot et les tests.

## Options considérées

| Option                    | Avantages                                                                                | Inconvénients                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Leptos site, Dioxus natif | Binaire wasm plus léger côté site (48,8 kB gzip mesurés), îlots, SSR statique par locale | Deux runtimes Rust, frontière à tenir          |
| Dioxus partout            | Un seul framework                                                                        | Pas d'îlots, bundle wasm plus lourd            |
| TanStack Start sur Bun    | Migration depuis React plus courte                                                       | Exige Vite et Nitro, hors doctrine Rust et Bun |

## Conséquences

- Positives : une seule langue côté serveur et rendu, SEO par pages statiques par locale.
- Négatives : réécriture de `apps/site` et de `packages/ui`.
- Travaux induits : le bot et les scripts restent en TypeScript sous Bun. Le contrat entre les deux runtimes Rust passe par HTTP, JSON et l'attribut `data-component` des îlots. Aucune nouvelle dépendance Next, Tailwind ou Base UI en attendant.

## Vérification

`grep -rn "next\|tailwind" apps/site/package.json` ne doit plus rien renvoyer une fois la migration finie.

## Références

- `docs/plans/refonte-rust-bun-yolo-stack.md`
- `C:\src\yolo-stack\docs\decisions\0003-verdict-leptos-dioxus-tanstack.md`
