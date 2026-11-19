# Admin (overrides MASTER where they conflict)

Engine: `crates/shenron-admin` (API) and `crates/shenron-admin-ui` (GPUI, desktop first, web second); deploys through `shenron-deployd`, edge through `shenron-edge`.

- Dense density: 8 to 32 px spacing, data tables with sort, filter, multi-select and bulk edit; wide tables scroll inside their panel.
- Every write shows its target and effect before it runs; destructive ones confirm with the object name; every result is read back and shown.
- Infra views (deploys, services, CDN, models) are live: state text plus colour, last update time, and the command that produced it.
- File uploads show progress, size and destination (CDN path) and can be cancelled.
