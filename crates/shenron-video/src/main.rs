//! `shenron-video`: pure-Rust video tool. Input on stdin (MPEG-1/2 elementary stream), result on stdout.
//!
//! - `shenron-video mp4 [--crf N] [--preset speed|balanced|quality] [--start S] [--duration S]` fragmented MP4, H.264 High
//! - `shenron-video probe` JSON metadata
//! - `shenron-video frame [--time S]` PNG still

use shenron_video::{Mp4Options, Res, Speed, png, probe, still_at, transcode_fmp4};
use std::io::{self, BufWriter, Read, Write};

fn run() -> Res<()> {
    let mut args = std::env::args().skip(1);
    let cmd = args.next().unwrap_or_else(|| "mp4".into());
    let mut opts = Mp4Options::default();
    let mut time = 0.0f64;
    while let Some(a) = args.next() {
        let v = args.next().ok_or_else(|| format!("{a} needs a value"))?;
        match a.as_str() {
            "--crf" => opts.crf = v.parse()?,
            "--time" => time = v.parse()?,
            "--start" => opts.start = v.parse()?,
            "--duration" => opts.duration = Some(v.parse()?),
            "--preset" => {
                opts.speed = match v.as_str() {
                    "speed" => Speed::Speed,
                    "balanced" => Speed::Balanced,
                    "quality" => Speed::Quality,
                    other => return Err(format!("unknown preset {other}").into()),
                }
            }
            other => return Err(format!("unknown argument {other}").into()),
        }
    }
    let mut es = Vec::new();
    io::stdin().lock().read_to_end(&mut es)?;
    let mut out = BufWriter::with_capacity(1 << 20, io::stdout().lock());
    match cmd.as_str() {
        "mp4" => {
            transcode_fmp4(&es, &opts, &mut out)?;
        }
        "probe" => out.write_all(probe(&es)?.to_json().as_bytes())?,
        "frame" => out.write_all(&png(&still_at(&es, time)?))?,
        other => return Err(format!("unknown command {other}").into()),
    }
    out.flush()?;
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("shenron-video: {e}");
        std::process::exit(1);
    }
}
