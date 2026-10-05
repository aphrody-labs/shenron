# Dragon Ball FR site

Next.js site in the Shenron Bun monorepo.

## Development

From the monorepo root:

```sh
bun install --frozen-lockfile
bun --filter @shenron/site dev
```

Next's dev server prints the local URL. This command does not generate `.env.local`.
The variable inventory lives in [`docs/operations/ENV.md`](../../docs/operations/ENV.md);
[`docs/operations/DEV-LOCAL.md`](../../docs/operations/DEV-LOCAL.md) is historical. Database
and site-specific commands are defined in this package's `package.json`.

## Build and release

`bun run build:server` (root) compiles the site into the autonomous `shenron-server`
binary. `bun scripts/build/build-site-external.ts` builds and seals the `.next-build`
artifact consumed by the `aphrody-infra` release pipeline; the `site-artifact` workflow
can produce the same artifact. Release promotion, service units, Nginx routes, health
probes, and rollback are owned by `aphrody-infra`; this repository does not deploy
directly.
