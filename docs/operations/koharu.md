# koharu (koharu.dragonballfr.com)

Pure-Rust service (`crates/koharu-web`, ADR `docs/decisions/0005-koharu-service.md`), own compose
project `/srv/koharu`, own unit `koharu-stack.service`, own nginx file `deploy/nginx/zz-koharu.conf`.
The Next.js vhosts are not touched. API: `docs/api/koharu-web.openapi.json` (also `GET /openapi.json`).

Build (fr1 only): `cargo build --release -p koharu-web`, copy to `dist/koharu-web/linux-x64/`, then
`docker build -f deploy/docker/Dockerfile.koharu -t localhost/koharu-web:<sha> .`; preview on fr2; ship with
`docker save | zstd | ssh prd docker load`. Deploy on prd under `/srv/deploy.lock` (flock), one service.

Settings: `KOHARU_WEB_*` (bind, tokens, translate url and model, target language, cpu).
Models download on the first page into `/srv/koharu/home` (persistent).
Proofs: `docs/proofs/koharu-*`.
