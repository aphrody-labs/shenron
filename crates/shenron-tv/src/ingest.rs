//! Ingest pipeline: yt-dlp download, ffprobe, FFmpeg HLS ladder (one process each, no shell).
use crate::{Config, db::Db};
use anyhow::{Context, Result, bail};
use std::{path::Path, process::Stdio, sync::Arc};
use tokio::process::Command;

const LADDER: [u32; 4] = [1080, 720, 480, 360];

pub struct Probe {
    pub duration: f64,
    pub height: u32,
    pub has_audio: bool,
}

async fn run(cmd: &mut Command, what: &str) -> Result<Vec<u8>> {
    let out = cmd.stdin(Stdio::null()).output().await.with_context(|| format!("{what}: spawn"))?;
    if !out.status.success() {
        let tail: String = String::from_utf8_lossy(&out.stderr).lines().rev().take(6).collect::<Vec<_>>().join(" | ");
        bail!("{what} failed ({}): {tail}", out.status);
    }
    Ok(out.stdout)
}

pub async fn probe(cfg: &Config, file: &Path) -> Result<Probe> {
    let out = run(
        Command::new(&cfg.ffprobe).args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"]).arg(file),
        "ffprobe",
    )
    .await?;
    let j: serde_json::Value = serde_json::from_slice(&out)?;
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let video = streams.iter().find(|s| s["codec_type"] == "video").context("no video stream")?;
    Ok(Probe {
        duration: j["format"]["duration"].as_str().and_then(|d| d.parse().ok()).unwrap_or(0.0),
        height: video["height"].as_u64().unwrap_or(0) as u32,
        has_audio: streams.iter().any(|s| s["codec_type"] == "audio"),
    })
}

/// Renditions at or below the source height (the lowest one is always kept).
pub fn ladder(source_height: u32) -> Vec<u32> {
    let mut v: Vec<u32> = LADDER.iter().copied().filter(|h| *h <= source_height).collect();
    if v.is_empty() {
        v.push(*LADDER.last().unwrap_or(&360));
    }
    v
}

pub async fn transcode(cfg: &Config, src: &Path, out: &Path, p: &Probe) -> Result<Vec<u32>> {
    let heights = ladder(p.height);
    let n = heights.len();
    let split: String = (0..n).map(|i| format!("[s{i}]")).collect();
    let scales: Vec<String> = heights.iter().enumerate().map(|(i, h)| format!("[s{i}]scale=-2:{h}[v{i}]")).collect();
    let filter = format!("[0:v:0]split={n}{split};{}", scales.join(";"));
    let mut args: Vec<String> = vec!["-y".into(), "-nostdin".into(), "-v".into(), "error".into(), "-i".into(), src.display().to_string(), "-filter_complex".into(), filter];
    let mut map = Vec::new();
    for i in 0..n {
        args.extend(["-map".into(), format!("[v{i}]")]);
        if p.has_audio {
            args.extend(["-map".into(), "0:a:0".into()]);
        }
        map.push(if p.has_audio { format!("v:{i},a:{i}") } else { format!("v:{i}") });
    }
    args.extend(
        ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-sc_threshold", "0", "-g", "48", "-keyint_min", "48", "-pix_fmt", "yuv420p"]
            .map(String::from),
    );
    for (i, h) in heights.iter().enumerate() {
        let (maxrate, buf) = match h { 1080 => ("5000k", "10000k"), 720 => ("2800k", "5600k"), 480 => ("1400k", "2800k"), _ => ("800k", "1600k") };
        args.extend([format!("-maxrate:v:{i}"), maxrate.into(), format!("-bufsize:v:{i}"), buf.into()]);
    }
    if p.has_audio {
        args.extend(["-c:a", "aac", "-b:a", "128k", "-ac", "2"].map(String::from));
    }
    args.extend(
        ["-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-master_pl_name", "master.m3u8", "-threads", &cfg.ffmpeg_threads.to_string()]
            .map(String::from),
    );
    args.extend(["-var_stream_map".into(), map.join(" "), "-hls_segment_filename".into(), out.join("v%v_%05d.ts").display().to_string(), out.join("v%v.m3u8").display().to_string()]);
    run(Command::new(&cfg.ffmpeg).args(&args), "ffmpeg hls").await?;
    // Poster frame at 10% of the duration.
    let at = (p.duration * 0.1).max(0.0);
    run(
        Command::new(&cfg.ffmpeg).args(["-y", "-nostdin", "-v", "error", "-ss", &format!("{at:.2}"), "-i"]).arg(src).args(["-frames:v", "1", "-vf", "scale=-2:360"]).arg(out.join("poster.jpg")),
        "ffmpeg poster",
    )
    .await?;
    Ok(heights)
}

pub async fn job(cfg: Arc<Config>, db: Arc<Db>, id: String, url: String, title: Option<String>) {
    let _permit = cfg.slots.acquire().await;
    if let Err(e) = job_inner(&cfg, &db, &id, &url, title).await {
        tracing::error!(%id, error = %e, "ingest failed");
        db.set_status(&id, "failed", Some(&e.to_string()));
    }
}

async fn job_inner(cfg: &Config, db: &Db, id: &str, url: &str, title: Option<String>) -> Result<()> {
    let work = cfg.data.join("work").join(id);
    let out = cfg.data.join("hls").join(id);
    tokio::fs::create_dir_all(&work).await?;
    tokio::fs::create_dir_all(&out).await?;
    db.set_status(id, "downloading", None);
    let template = work.join("source.%(ext)s");
    let info = run(
        Command::new(&cfg.ytdlp)
            .args(["--no-playlist", "--no-progress", "--no-warnings", "--max-filesize", &cfg.max_filesize, "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4", "--dump-single-json", "--no-simulate", "-o"])
            .arg(&template)
            .arg("--")
            .arg(url),
        "yt-dlp",
    )
    .await?;
    let meta: serde_json::Value = serde_json::from_slice(&info).unwrap_or_default();
    // Keep the metadata worth searching later, not the whole format table.
    let keep: serde_json::Value = ["id", "extractor", "title", "uploader", "channel", "description", "upload_date", "duration", "webpage_url", "license", "tags", "categories"]
        .iter()
        .filter_map(|k| meta.get(*k).map(|v| ((*k).to_string(), v.clone())))
        .collect::<serde_json::Map<_, _>>()
        .into();
    db.set_info(id, title.is_none().then(|| meta["title"].as_str()).flatten(), &keep.to_string());
    let src = std::fs::read_dir(&work)?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.file_stem().is_some_and(|s| s == "source") && p.extension().is_some_and(|e| e != "part"))
        .context("yt-dlp produced no file")?;
    db.set_status(id, "transcoding", None);
    let p = probe(cfg, &src).await?;
    let heights = transcode(cfg, &src, &out, &p).await?;
    db.set_ready(id, p.duration, &heights);
    tokio::fs::remove_dir_all(&work).await.ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ladder;
    #[test]
    fn ladder_follows_source() {
        assert_eq!(ladder(1080), vec![1080, 720, 480, 360]);
        assert_eq!(ladder(720), vec![720, 480, 360]);
        assert_eq!(ladder(240), vec![360]);
    }
}
