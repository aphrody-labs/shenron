<!-- Décris ce que la PR change et comment la tester. -->

## Modifications

<!-- Changements apportés et raison de cette PR. -->

## Type

- [ ] Fix (correction de bug)
- [ ] Feature (nouvelle fonctionnalité)
- [ ] Refactor (pas de changement de comportement)
- [ ] Docs / chore / test
- [ ] Breaking change

## Checklist

- [ ] `bun run typecheck`, `bun run lint` et `bun run test` passent
- [ ] `bun --filter @shenron/bot gen:entries` lancé si commande ou événement discordx ajouté ou retiré
- [ ] `bun --filter @shenron/site db:generate` (ou `@shenron/bot`) lancé si `src/db/schema.ts` change
- [ ] `bun packages/api/scripts/openapi.ts` lancé si le contrat d'API change (`--check` en CI)
- [ ] Crates touchées : `bun run clippy:rust` et `bun run test:rust` passent
- [ ] `.env.example` et `docs/operations/ENV.md` à jour si nouvelle variable
