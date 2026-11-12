// SPDX-License-Identifier: Apache-2.0
//! Bounded transport to the owner-installed video CLI; no rendering engine lives here.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use shenron_rag::dragonball::process_env;
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
};

const INPUT_LIMIT: usize = 16 * 1024;
const OUTPUT_LIMIT: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum VideoKind {
    #[default]
    Chronology,
    Beerus,
    Original,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum VideoLanguage {
    #[default]
    Fr,
    En,
    Ja,
}

#[derive(Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoRequest {
    #[serde(default)]
    pub kind: VideoKind,
    #[serde(default)]
    pub language: VideoLanguage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cards: Option<u32>,
}

impl VideoRequest {
    fn validate(&self) -> Result<(), String> {
        for (value, min, max) in [
            (self.width, 320, 1920),
            (self.height, 320, 1920),
            (self.fps, 1, 60),
            (self.duration_seconds, 1, 30),
            (self.max_cards, 1, 12),
        ] {
            if value.is_some_and(|value| !(min..=max).contains(&value)) {
                return Err("Video request exceeds the supported bounds".into());
            }
        }
        let width = self.width.unwrap_or(1280);
        let height = self.height.unwrap_or(720);
        if !width.is_multiple_of(2)
            || !height.is_multiple_of(2)
            || u64::from(width) * u64::from(height) > 2_073_600
        {
            return Err("Video dimensions must be even and within the pixel budget".into());
        }
        Ok(())
    }
}

fn configured_paths(render: bool) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let unavailable = || "Owner video backend is not configured or installed".to_owned();
    let bun = PathBuf::from(process_env("SHENRON_VIDEO_BUN").ok_or_else(unavailable)?);
    let root = PathBuf::from(process_env("SHENRON_VIDEO_PROJECT_ROOT").ok_or_else(unavailable)?);
    if !bun.is_absolute() || !root.is_absolute() {
        return Err(unavailable());
    }
    let bun = bun.canonicalize().map_err(|_| unavailable())?;
    let root = root.canonicalize().map_err(|_| unavailable())?;
    let script =
        root.join(if render { "scripts/video/render.ts" } else { "scripts/video/plan.ts" });
    let resolved = script.canonicalize().map_err(|_| unavailable())?;
    if !bun.is_file() || !root.is_dir() || !resolved.is_file() || !resolved.starts_with(&root) {
        return Err(unavailable());
    }
    Ok((bun, root, resolved))
}

async fn bounded_read(reader: impl AsyncRead + Unpin, limit: usize) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take((limit + 1) as u64).read_to_end(&mut bytes).await?;
    if bytes.len() > limit {
        return Err(std::io::Error::other("Video output exceeds limit"));
    }
    Ok(bytes)
}

fn validate_output(value: Value, render: bool) -> Result<Value, String> {
    let plan = if render { value.get("plan") } else { Some(&value) };
    let valid = plan.is_some_and(|plan| {
        plan.get("schema").and_then(Value::as_str) == Some("shenron.video/v1")
            && plan
                .get("qualification")
                .and_then(|q| q.get("originalArtwork"))
                .and_then(Value::as_bool)
                == Some(true)
            && plan
                .get("qualification")
                .and_then(|q| q.get("pixelMatchVerified"))
                .and_then(Value::as_bool)
                == Some(false)
            && (plan.get("qualification").and_then(|q| q.get("rendered")).and_then(Value::as_bool)
                == Some(render))
    });
    let artifact_valid = !render
        || value.get("artifact").is_some_and(|artifact| {
            ["archive", "web"].iter().all(|name| {
                artifact.get(name).is_some_and(|entry| {
                    entry.get("path").and_then(Value::as_str).is_some_and(|path| !path.is_empty())
                        && entry.get("sha256").and_then(Value::as_str).is_some_and(valid_hash)
                        && entry.get("probe").is_some_and(Value::is_object)
                })
            }) && artifact.get("frames").and_then(Value::as_array).is_some_and(|frames| {
                !frames.is_empty()
                    && frames.iter().all(|frame| {
                        frame.get("sha256").and_then(Value::as_str).is_some_and(valid_hash)
                    })
            })
        });
    if !valid || !artifact_valid {
        return Err("Owner video backend returned an invalid receipt".into());
    }
    Ok(value)
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

async fn terminate_owned_child(child: &mut tokio::process::Child, grace: Duration) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // Only the captured child PID is signalled; no client-selected executable or target.
        let mut signal = Command::new("/bin/kill");
        signal
            .args(["-TERM", "--", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        if matches!(tokio::time::timeout(Duration::from_secs(2), signal.status()).await, Ok(Ok(status)) if status.success())
            && matches!(tokio::time::timeout(grace, child.wait()).await, Ok(Ok(_)))
        {
            return;
        }
    }
    #[cfg(not(unix))]
    let _ = grace;
    let _ = child.kill().await;
    let _ = child.wait().await;
}

pub async fn execute(request: VideoRequest, render: bool) -> Result<Value, String> {
    request.validate()?;
    let input = serde_json::to_vec(&request).map_err(|_| "Invalid video request")?;
    if input.len() > INPUT_LIMIT {
        return Err("Video request exceeds input limit".into());
    }
    let (bun, root, script) = configured_paths(render)?;
    let mut child = Command::new(bun)
        .arg("--no-install")
        .arg(script)
        .current_dir(root)
        .env("BUN_DEBUG_QUIET_LOGS", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Owner video backend could not start")?;
    let outcome = tokio::time::timeout(Duration::from_secs(if render { 300 } else { 30 }), async {
        let mut stdin = child.stdin.take().ok_or_else(|| std::io::Error::other("Missing stdin"))?;
        stdin.write_all(&input).await?;
        stdin.shutdown().await?;
        drop(stdin);
        let stdout = child.stdout.take().ok_or_else(|| std::io::Error::other("Missing stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| std::io::Error::other("Missing stderr"))?;
        let (output, _, status) = tokio::try_join!(
            bounded_read(stdout, OUTPUT_LIMIT),
            bounded_read(stderr, 32 * 1024),
            child.wait()
        )?;
        if !status.success() {
            return Err(std::io::Error::other("Video backend failed"));
        }
        Ok::<_, std::io::Error>(output)
    })
    .await;
    let output = match outcome {
        Ok(Ok(output)) => output,
        _ => {
            terminate_owned_child(&mut child, Duration::from_secs(5)).await;
            return Err("Owner video backend failed, exceeded its limits or timed out".into());
        },
    };
    let value =
        serde_json::from_slice(&output).map_err(|_| "Owner video backend returned invalid JSON")?;
    validate_output(value, render)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_paths_urls_unknown_fields_and_unbounded_requests() {
        for value in [
            json!({"url":"https://google.com"}),
            json!({"path":"/tmp/a"}),
            json!({"kind":"command"}),
        ] {
            assert!(serde_json::from_value::<VideoRequest>(value).is_err());
        }
        for value in [
            json!({"width":1921}),
            json!({"width":321}),
            json!({"width":1920,"height":1920}),
            json!({"fps":0}),
            json!({"durationSeconds":31}),
            json!({"maxCards":13}),
        ] {
            assert!(serde_json::from_value::<VideoRequest>(value).unwrap().validate().is_err());
        }
        assert!(VideoRequest::default().validate().is_ok());
        assert_eq!(
            serde_json::to_value(VideoRequest::default()).unwrap(),
            json!({"kind":"chronology","language":"fr"})
        );
    }

    #[test]
    fn receipts_do_not_turn_a_plan_into_verified_rendering() {
        let mut plan = json!({"schema":"shenron.video/v1","qualification":{"originalArtwork":true,"pixelMatchVerified":false,"rendered":false}});
        assert!(validate_output(plan.clone(), false).is_ok());
        assert!(validate_output(plan.clone(), true).is_err());
        plan["qualification"]["rendered"] = json!(true);
        assert!(validate_output(json!({"plan":plan.clone(),"artifact":{}}), true).is_err());
        let hash = "a".repeat(64);
        assert!(validate_output(json!({"plan":plan,"artifact":{"archive":{"path":"private/a.mkv","sha256":hash,"probe":{}},"web":{"path":"private/a.mp4","sha256":hash,"probe":{}},"frames":[{"sha256":hash}]}}), true).is_ok());
        assert!(validate_output(json!({"schema":"shenron.video/v1","qualification":{"originalArtwork":true,"pixelMatchVerified":true,"rendered":true}}), false).is_err());
    }

    #[tokio::test]
    async fn bounds_process_output() {
        assert_eq!(bounded_read(&b"abc"[..], 3).await.unwrap(), b"abc");
        assert!(bounded_read(&b"abcd"[..], 3).await.is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn termination_allows_cleanup_and_forces_an_unresponsive_child() {
        for (script, clean_exit) in [
            ("trap 'exit 0' TERM; printf ready; while :; do :; done", true),
            ("trap '' TERM; printf ready; exec sleep 60", false),
        ] {
            let mut child = Command::new("/bin/sh")
                .args(["-c", script])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .spawn()
                .unwrap();
            let mut ready = [0_u8; 5];
            tokio::time::timeout(
                Duration::from_secs(2),
                child.stdout.take().unwrap().read_exact(&mut ready),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(&ready, b"ready");
            terminate_owned_child(&mut child, Duration::from_millis(100)).await;
            let status = child.wait().await.unwrap();
            assert_eq!(status.success(), clean_exit);
            if !clean_exit {
                use std::os::unix::process::ExitStatusExt;
                assert_eq!(status.signal(), Some(9));
            }
        }
    }
}
