// SPDX-License-Identifier: Apache-2.0
//! HTTP health probe with retries.

use std::time::Duration;

use anyhow::{Result, bail};

use crate::manifest::Health;

pub async fn probe(client: &reqwest::Client, health: &Health) -> Result<()> {
    let attempts = health.retries.max(1);
    let mut last = String::new();
    for attempt in 1..=attempts {
        match client.get(&health.url).timeout(Duration::from_millis(health.timeout_ms)).send().await {
            Ok(resp) if resp.status().as_u16() == health.expect_status => return Ok(()),
            Ok(resp) => last = format!("status {}", resp.status()),
            Err(e) => last = e.to_string(),
        }
        tracing::debug!(url = %health.url, attempt, attempts, %last, "health probe failed");
        if attempt < attempts {
            tokio::time::sleep(Duration::from_millis(health.interval_ms)).await;
        }
    }
    bail!("health probe {} failed after {attempts} attempts: {last}", health.url)
}
