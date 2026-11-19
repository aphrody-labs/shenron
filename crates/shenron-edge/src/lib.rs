// SPDX-License-Identifier: Apache-2.0
//! `shenron-edge`: the Shenron reverse proxy and load balancer on Pingora. One TOML file describes
//! listeners, certificates (static or ACME), disk cache zones, upstream pools and virtual hosts;
//! SIGHUP reloads it without dropping connections.

pub mod acme;
pub mod cache;
pub mod config;
pub mod headers;
pub mod pool;
pub mod proxy;
pub mod router;
pub mod runtime;
pub mod server;
pub mod state;
pub mod tls;
