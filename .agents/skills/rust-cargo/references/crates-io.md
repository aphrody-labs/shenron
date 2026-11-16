# crates.io registry and live API


## Sparse Index Protocol (`https://index.crates.io/`)

Cargo reads crate metadata over HTTP without cloning the git index:

- Config endpoint: `GET https://index.crates.io/config.json` returns `{"dl":"https://static.crates.io/crates","api":"https://crates.io"}`.
- Crate metadata path:
  - 1-char name: `/1/<name>`
  - 2-char name: `/2/<name>`
  - 3-char name: `/3/<first-char>/<name>`
  - 4+ char name: `/<first-2>/<next-2>/<name>` (example: `https://index.crates.io/se/rd/serde`)
- Response format: newline-delimited JSON (one JSON object per published version with `name`, `vers`, `deps`, `cksum`, `features`, `yanked`, `rust_version`, `pubtime`).

## Live REST API (`https://crates.io/api/v1/`)

Always send a descriptive `User-Agent` header per crates.io API policy:

```bash
# single crate metadata (pipe to jaq to filter)
xh -b https://crates.io/api/v1/crates/serde User-Agent:shenron-agent/1.0

# top crates by downloads
xh -b "https://crates.io/api/v1/crates?sort=downloads&per_page=10" User-Agent:shenron-agent/1.0
```


## Publishing Checklist

```bash
cargo publish --dry-run -p <crate>
cargo publish -p <crate>
```

Verify secret scan is clean before publishing public crates from this repo.

Crate versions change daily: query the API above instead of trusting any list.
