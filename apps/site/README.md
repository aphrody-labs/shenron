# Dragon Ball FR site

Next.js site in the Shenron Bun monorepo.

## Development

From the monorepo root:

```sh
bun install --frozen-lockfile
bun --filter @aphrody/shenron-site dev
```

Next's dev server prints the local URL. This command does not generate `.env.local`.
The variable inventory lives in [`docs/operations/ENV.md`](../../docs/operations/ENV.md);
[`docs/operations/DEV-LOCAL.md`](../../docs/operations/DEV-LOCAL.md) is historical. Database
and site-specific commands are defined in this package's `package.json`.

## Build and release

`bun run build:server` (root) compiles the site into the autonomous `shenron-server`
binary. A production release is built, verified and shipped as a container image by
`scripts/deploy/release.sh` (`build-image.sh` then `ship-image.sh`); the manual
`server-artifact` workflow runs the build step only on a self-hosted runner.
