# admin. proofs (2026-11-16)

- Desktop (Linux build from fr1, run under Xvfb, signed in with the operator token, live prd data): `admin-desktop-linux.png`. Overview panel shows api, PostgreSQL, Redis and back-office services from the production dashboard API.
- Web build (wasm, local service with a throwaway token and fixture upstream, real Chrome): `admin-web-dashboard.jpg`. Sign-in form, panel navigation and the Overview panel rendered. The accessibility tree names every control: form "Sign in", textbox "Access token", button "Sign in", buttons "Open panel <name>", "Refresh panel", "Sign out".
- Live service on prd behind Cloudflare (`admin.dragonballfr.com`, image `localhost/shenron-admin:m2`), checked responses:
  - `GET /api/health` returns `{"ok":true,"service":"shenron-admin"}`; `GET /api/panels` without credentials returns 401.
  - With the operator token: `/api/me` returns `{"via":"token"}`; `/api/panels/bot-totals` returns `totalUsers 8449, totalActiveUsers 2939, totalGuilds 1`; `/api/panels/overview` returns the four services with state `ok`; `/api/panels/pipeline` returns the RAG index (257436 chunks).
- Tests: `cargo test -p shenron-admin` 5 passed on fr1; clippy clean.
