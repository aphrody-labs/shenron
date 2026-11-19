# shenron-edge

Reverse proxy and load balancer of the Shenron fleet: it replaces nginx on `fr2` (load balancer of
dragonballfr.com) and then on `prd` (vhosts). ADR 0009, step 3. One binary, one TOML file, SIGHUP to
reload.

```
shenron-edge --config /etc/shenron-edge/edge.toml          # run
shenron-edge --check --config /etc/shenron-edge/edge.toml  # validate, bind nothing
kill -HUP $(pidof shenron-edge)                            # reload; an invalid file keeps the running config
```

Examples that match the live nginx configuration: `deploy/edge/fr2.example.toml` (the six
locations of `shenron-lb.conf`), `deploy/edge/prd.example.toml` (the admin, tv and koharu vhosts),
unit `deploy/edge/shenron-edge.service`.

## Why Pingora

Pingora 0.9.1 (crates.io, newest stable) gives the parts that are hard to get right and that nginx
did for us: HTTP/1.1 and HTTP/2 downstream, connection pooling and keepalive to the upstreams,
WebSocket and SSE passthrough without buffering (nginx `X-Accel-Buffering` is stripped), graceful
reload, and a rustls backend (`ring`). Its TLS story does not block: `TlsSettings::set_cert_resolver`
takes a rustls `ResolvesServerCert`, so the certificate store is swapped atomically and a renewed
certificate serves the next handshake with no listener restart. ACME is HTTP-01 through
`instant-acme` (ring), the challenge answer is served from the plain HTTP listener.

What Pingora does not ship, and what this crate adds:

- A disk cache. `pingora-cache` only has an in-memory storage, so `cache/` implements the nginx
  `proxy_cache_path` zones: hashed layout, atomic writes, `Vary` variants, `inactive` and
  `max_size` eviction, a per-key lock (`proxy_cache_lock`), stale serving (`proxy_cache_use_stale`).
  Cacheability follows nginx: `Set-Cookie` and `Vary: *` forbid; `X-Accel-Expires`, then
  `Cache-Control` (`s-maxage` before `max-age`, `private`/`no-cache`/`no-store` forbid), then
  `Expires`, then the per-status `valid` rules.
- Passive health and weights (`pool.rs`): smooth weighted round robin, `max_fails` and
  `fail_timeout`, backup servers, retry on the next server on a connect error.
- Header rules with nginx semantics (`headers.rs`): `add` (`add_header ... always`, empty values
  skipped, so `X-Shenron-Upstream` is absent on a cache hit exactly as with `$upstream_addr`),
  `default` (set when absent) and `remove`.

rama or hyper plus rustls was the fallback; it was not needed.

## Parity with the nginx it replaces

| nginx | shenron-edge |
| --- | --- |
| `upstream` with `max_fails`, `fail_timeout`, `backup`, weights | `[[pool]]` with `[[pool.server]]` |
| `location ^~`, `=`, `~*` in file order | `[[vhost.route]]` with `prefix`, `exact`, `regex` (first match wins, file order) |
| `proxy_cache_path` zones | `[[cache]]` |
| `proxy_cache_valid`, `proxy_cache_lock`, `proxy_cache_use_stale` | route `cache.valid`, `lock`, `use_stale` |
| `proxy_cache_key` with `$shenron_img_accept` map | `cache.variance` (header, default, `contains` map) |
| `proxy_cache_bypass` and `proxy_no_cache` on cookies or `$arg_nocache` | `cache.bypass` (`cookies`, `args`); a `Range` request also bypasses |
| `add_header X-Shenron-LB-Cache $upstream_cache_status always` | `headers.add` with `$cache_status` (HIT, MISS, EXPIRED, BYPASS, STALE, UPDATING) |
| `proxy_set_header Host`, `X-Real-IP`, `X-Forwarded-*` | `upstream_host`, always `X-Real-IP`, `X-Forwarded-For/Proto/Host` |
| `real_ip` from Cloudflare ranges | `server.trusted_proxies` and `CF-Connecting-IP` |
| `return 301` www and http to https | `redirect_to`, `redirect_http` |
| `client_max_body_size` | route `max_body` |
| `server_tokens`, upstream `Server`/`Date`/`X-Accel-*` hidden | `server.server_header`, stripped |
| certbot, `ssl_certificate` | `[[certificate]]` static files, or `acme = true` |

Security headers (CSP, CSP-report-only, COOP, permissions-policy, referrer-policy, x-frame-options)
and the `Link` preload header are produced by the application and pass through untouched; the
`default` rules (commented in `fr2.example.toml`, so the header diff against nginx stays empty) only
fill a gap. HSTS is added by Cloudflare today and moves to the edge when the proxy leaves (step 8).

## Differences, on purpose

- Routes match the raw request path, not a percent-decoded one.
- A 5xx answer is not retried on another server (the response is already streaming); it counts
  as a failed attempt for health (`failure_statuses`) and is served from stale when allowed.
  Connection errors and timeouts do move to the next server.
- Cached objects are read whole into memory (`max_object`, default 64 MiB); larger ones are
  streamed and never stored. A cache hit does not honour `Range`; a ranged request bypasses.
- No response compression layer: the application already compresses, and a compressed variant is
  keyed through `Vary: Accept-Encoding`.
- Listener addresses and the TLS listener set need a restart; everything else (vhosts, routes,
  pools, zones, certificates, trust list) reloads on SIGHUP.

## Tests

`cargo test -p shenron-edge` covers the pure rules (pool selection and health, cache policy, key and
variance, bypass, header rules, routing, config) and `tests/proxy.rs`, which runs a real server in
front of a scripted origin. `scripts/ops/edge-header-diff.ts` replays URLs through nginx and
through the edge on the same host and prints the headers that differ.
