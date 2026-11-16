# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: Apache-2.0
# admin. service: the shenron-admin binary and the Rust web bundle.
# Build from the repository root after: cargo build --release -p shenron-admin and
# crates/shenron-admin-ui/build-web.sh dist/admin-web
FROM ubuntu:26.10
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && (id ubuntu >/dev/null 2>&1 && userdel -r ubuntu || true) \
 && groupadd --gid 10002 shenron-admin \
 && useradd --uid 10002 --gid 10002 --no-create-home --shell /usr/sbin/nologin shenron-admin
COPY --chmod=755 target/release/shenron-admin /usr/local/bin/shenron-admin
COPY dist/admin-web /usr/share/shenron-admin/web
ENV SHENRON_ADMIN_BIND=127.0.0.1:5020 SHENRON_ADMIN_WEB_DIR=/usr/share/shenron-admin/web
USER 10002:10002
ENTRYPOINT ["/usr/local/bin/shenron-admin"]
