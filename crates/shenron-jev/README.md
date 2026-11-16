# shenron-jev

Jev System One decision protocol used by the Shenron RAG: typed request and response, bounded
validation (1 MiB JSON limit), optional endpoint clients (`client`) and a test server (`server`).

```rust
use shenron_jev::{Question, Request, check_request};
```

Mode comes from `SHENRON_JEV_MODE` (`native`, `keyless`, `api-key`); the native engine endpoint comes
from `SHENRON_JEV_ENGINE_URL`, else `SHENRON_AI_CHAT_BASE_URL` and its aliases. No default endpoint.

Licenses: Apache-2.0 (`LICENSE-APACHE`, `NOTICE`); the protocol adapter keeps its MIT origin in
`LICENSE-BUN-MIT.md`.
