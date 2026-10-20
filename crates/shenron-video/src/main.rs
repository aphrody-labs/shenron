//! `shenron-video`: pure-Rust video tool. Input on stdin (MPEG-1/2 elementary stream), result on stdout.
//!
//! - `shenron-video mp4 [--crf N] [--preset speed|balanced|quality] [--start S] [--duration S]` fragmented MP4, H.264 High
//! - `shenron-video probe` JSON metadata
//! - `shenron-video frame [--time S]` PNG still
//! - `shenron-video encode-rgba --width W --height H --fps-num N --fps-den D --frames N` opaque RGBA8 stdin to H.264 MP4

use shenron_video::{
    Mp4Options, Res, RgbaVideoInfo, Speed, encode_rgba_fmp4, png, probe, still_at, transcode_fmp4,
};
use std::io::{self, BufWriter, Read, Write};

fn run() -> Res<()> {
    let mut args = std::env::args().skip(1);
    let cmd = args.next().unwrap_or_else(|| "mp4".into());
    if cmd == "--help" || cmd == "help" {
        println!(
            "shenron-video: probe | frame [--time S] | mp4 [--crf N] [--preset speed|balanced|quality] [--start S] [--duration S]\nMPEG-1/2 elementary stream on stdin; result on stdout.\nencode-rgba --width W --height H --fps-num N [--fps-den D] --frames N [--crf N] [--preset speed|balanced|quality]\nOpaque RGBA8 on stdin; lossy BT.709 YUV420 H.264 fragmented MP4 on stdout. Preserve PNG originals for exact pixels and alpha."
        );
        return Ok(());
    }
    let mut opts = Mp4Options::default();
    let mut time = 0.0f64;
    let mut rgba = RgbaVideoInfo { width: 0, height: 0, fps_num: 0, fps_den: 1, frames: 0 };
    while let Some(a) = args.next() {
        let v = args.next().ok_or_else(|| format!("{a} needs a value"))?;
        match a.as_str() {
            "--crf" => opts.crf = v.parse()?,
            "--time" => time = v.parse()?,
            "--start" => opts.start = v.parse()?,
            "--duration" => opts.duration = Some(v.parse()?),
            "--width" => rgba.width = v.parse()?,
            "--height" => rgba.height = v.parse()?,
            "--fps-num" => rgba.fps_num = v.parse()?,
            "--fps-den" => rgba.fps_den = v.parse()?,
            "--frames" => rgba.frames = v.parse()?,
            "--preset" => {
                opts.speed = match v.as_str() {
                    "speed" => Speed::Speed,
                    "balanced" => Speed::Balanced,
                    "quality" => Speed::Quality,
                    other => return Err(format!("unknown preset {other}").into()),
                }
            },
            other => return Err(format!("unknown argument {other}").into()),
        }
    }
    if cmd == "encode-rgba" {
        let mut out = BufWriter::with_capacity(1 << 20, io::stdout().lock());
        encode_rgba_fmp4(io::stdin().lock(), rgba, &opts, &mut out)?;
        out.flush()?;
        return Ok(());
    }
    let mut es = Vec::new();
    io::stdin().lock().read_to_end(&mut es)?;
    let mut out = BufWriter::with_capacity(1 << 20, io::stdout().lock());
    match cmd.as_str() {
        "mp4" => {
            transcode_fmp4(&es, &opts, &mut out)?;
        },
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
