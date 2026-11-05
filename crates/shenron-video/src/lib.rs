//! Shenron video library, pure Rust (no ffmpeg, no C): MPEG-1/2 decode (`filmcraft-mpeg2v`), H.264
//! encode (`filmcraft-h264enc`), fragmented MP4 mux (`filmcraft-isobmff`).

use filmcraft_h264enc::{
    Encoder, EncoderConfig, Packet, PacketFormat, Preset, RateControl, YuvFrame,
};
use filmcraft_isobmff::{
    AvcConfig, Brand, ColorInfo, FragmentedWriter, SampleEntry, TrackConfig, WriteSample,
    WriterOptions,
};
use filmcraft_mpeg2v::{
    ChromaFormat, Decoder, Picture, access_units, probe as probe_seq, scan_access_unit,
};
use std::io::{Read, Write};
use std::sync::mpsc::sync_channel;

pub type Res<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// Stream properties of an MPEG-1/2 elementary stream.
#[derive(Clone, Debug, PartialEq)]
pub struct VideoInfo {
    pub codec: &'static str,
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    /// Access units (one per picture or field pair).
    pub frames: usize,
    pub duration: f64,
}

impl VideoInfo {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"codec\":\"{}\",\"width\":{},\"height\":{},\"fpsNumerator\":{},\"fpsDenominator\":{},\"frameCount\":{},\"duration\":{:.6}}}",
            self.codec,
            self.width,
            self.height,
            self.fps_num,
            self.fps_den,
            self.frames,
            self.duration
        )
    }
}

pub fn probe(es: &[u8]) -> Res<VideoInfo> {
    let s = probe_seq(es).ok_or("not an MPEG-1/2 video elementary stream")?;
    let (n, d) = s.frame_rate.filter(|&(n, d)| n > 0 && d > 0).unwrap_or((30, 1));
    let frames = access_units(es).len();
    Ok(VideoInfo {
        codec: if s.mpeg2 { "mpeg2video" } else { "mpeg1video" },
        width: s.width,
        height: s.height,
        fps_num: n,
        fps_den: d,
        frames,
        duration: frames as f64 * f64::from(d) / f64::from(n),
    })
}

#[derive(Clone, Copy, Debug)]
pub enum Speed {
    Speed,
    Balanced,
    Quality,
}

#[derive(Clone, Debug)]
pub struct Mp4Options {
    pub crf: f32,
    pub speed: Speed,
    /// Segment start, seconds (decoding begins at the closest earlier intra picture).
    pub start: f64,
    /// Segment length, seconds (None: to the end).
    pub duration: Option<f64>,
}

impl Default for Mp4Options {
    fn default() -> Self {
        Mp4Options { crf: 23.0, speed: Speed::Speed, start: 0.0, duration: None }
    }
}

/// Planar 4:2:0 copy with even dimensions (4:2:2 / 4:4:4 are subsampled).
pub struct Yuv420 {
    pub y: Vec<u8>,
    pub u: Vec<u8>,
    pub v: Vec<u8>,
}

pub fn to_420(p: &Picture, w: usize, h: usize) -> Yuv420 {
    let (pw, cw) = (p.width as usize, p.chroma_width() as usize);
    let mut y = Vec::with_capacity(w * h);
    for r in 0..h {
        y.extend_from_slice(&p.y[r * pw..r * pw + w]);
    }
    let (hw, hh) = (w / 2, h / 2);
    let plane = |src: &[u8]| {
        let mut out = Vec::with_capacity(hw * hh);
        for r in 0..hh {
            for c in 0..hw {
                out.push(match p.chroma {
                    ChromaFormat::Yuv420 => src[r * cw + c],
                    ChromaFormat::Yuv422 => (u16::from(src[2 * r * cw + c])
                        + u16::from(src[(2 * r + 1) * cw + c]))
                    .div_ceil(2) as u8,
                    ChromaFormat::Yuv444 => src[2 * r * cw + 2 * c],
                });
            }
        }
        out
    };
    Yuv420 { u: plane(&p.cb), v: plane(&p.cr), y }
}

struct Sink<W: Write> {
    mux: FragmentedWriter<W>,
    track: usize,
    den: u32,
    since_flush: usize,
}

/// Dimensions and exact timing of a bounded stream of opaque RGBA8 frames.
#[derive(Clone, Copy, Debug)]
pub struct RgbaVideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    pub frames: u32,
}

/// Encode opaque RGBA8 through FilmCraft's BT.709 conversion, H.264 encoder and MP4 muxer.
/// This web derivative is lossy; callers retain original PNG frames for exact archival pixels.
pub fn encode_rgba_fmp4<R: Read, W: Write>(
    mut input: R,
    info: RgbaVideoInfo,
    opts: &Mp4Options,
    out: W,
) -> Res<u64> {
    let RgbaVideoInfo { width, height, fps_num, fps_den, frames } = info;
    if !(16..=1920).contains(&width)
        || !(16..=1920).contains(&height)
        || !width.is_multiple_of(2)
        || !height.is_multiple_of(2)
        || u64::from(width) * u64::from(height) > 2_073_600
        || fps_num == 0
        || fps_den == 0
        || fps_den > 100_000
        || fps_num > 60 * fps_den
        || frames == 0
        || frames > 1800
        || !opts.crf.is_finite()
        || !(0.0..=51.0).contains(&opts.crf)
    {
        return Err("invalid bounded RGBA video dimensions, timing, frame count or CRF".into());
    }
    let (w, h) = (width as usize, height as usize);
    let mut cfg = EncoderConfig::new(width, height, fps_num, fps_den);
    cfg.rate = RateControl::Crf(opts.crf);
    cfg.preset = match opts.speed {
        Speed::Speed => Preset::Speed,
        Speed::Balanced => Preset::Balanced,
        Speed::Quality => Preset::Quality,
    };
    cfg.keyint = (fps_num / fps_den).max(1) * 2;
    cfg.bframes = 0;
    cfg.threads = 1;
    cfg.color.primaries = 1;
    cfg.color.transfer = 13;
    cfg.color.matrix = 1;
    cfg.format = PacketFormat::LengthPrefixed;
    let mut enc = Encoder::new(cfg)?;
    let avcc = AvcConfig::parse(&enc.avcc())?;
    let mut mux = FragmentedWriter::new(out, WriterOptions::new(Brand::Mp4));
    let mut entry = SampleEntry::avc(avcc, width as u16, height as u16);
    entry.video.as_mut().ok_or("AVC sample entry has no video parameters")?.color =
        Some(ColorInfo::Nclx { primaries: 1, transfer: 13, matrix: 1, full_range: false });
    let track = mux.add_track(TrackConfig::new(entry, fps_num))?;
    let mut sink = Sink { mux, track, den: fps_den, since_flush: 0 };
    let mut rgba = vec![0; w * h * 4];
    let (mut y, mut u, mut v) = (Vec::new(), Vec::new(), Vec::new());
    for index in 0..frames {
        input.read_exact(&mut rgba)?;
        if rgba.as_chunks::<4>().0.iter().any(|pixel| pixel[3] != 255) {
            return Err("web H.264 requires opaque input; retain PNG frames for alpha".into());
        }
        filmcraft_export::rgba_to_yuv420_8(&rgba, w, h, &mut y, &mut u, &mut v);
        let frame = YuvFrame { y: &y, u: &u, v: &v, y_stride: w, uv_stride: w / 2 };
        sink.push(enc.encode(&frame, i64::from(index))?)?;
    }
    if input.read(&mut [0])? != 0 {
        return Err("RGBA input contains more frames than declared".into());
    }
    sink.push(enc.flush())?;
    sink.mux.finish()?.flush()?;
    Ok(u64::from(frames))
}

impl<W: Write> Sink<W> {
    fn push(&mut self, packets: Vec<Packet>) -> Res<()> {
        for pk in packets {
            let offset = (pk.pts - pk.dts) * i64::from(self.den);
            if pk.keyframe && self.since_flush > 0 {
                self.mux.flush_fragment()?;
                self.since_flush = 0;
            }
            self.mux.write_sample(
                self.track,
                WriteSample {
                    data: &pk.data,
                    duration: self.den,
                    composition_offset: offset as i32,
                    is_sync: pk.keyframe,
                },
            )?;
            self.since_flush += 1;
        }
        Ok(())
    }
}

/// MPEG-1/2 elementary stream to fragmented MP4 (H.264 High). Decoding runs on its own thread,
/// feeding the (internally multi-threaded) encoder through a bounded channel. Returns the frame count.
pub fn transcode_fmp4<W: Write>(es: &[u8], opts: &Mp4Options, out: W) -> Res<u64> {
    let info = probe(es)?;
    let (w, h) = ((info.width & !1) as usize, (info.height & !1) as usize);
    let (num, den) = (info.fps_num, info.fps_den);
    let seq = probe_seq(es).ok_or("probe")?;

    let mut cfg = EncoderConfig::new(w as u32, h as u32, num, den);
    cfg.rate = RateControl::Crf(opts.crf);
    cfg.preset = match opts.speed {
        Speed::Speed => Preset::Speed,
        Speed::Balanced => Preset::Balanced,
        Speed::Quality => Preset::Quality,
    };
    cfg.keyint = (num / den).max(1) * 2;
    cfg.sar = (seq.sar.0.min(65535) as u16, seq.sar.1.min(65535) as u16);
    cfg.format = PacketFormat::LengthPrefixed;
    let mut enc = Encoder::new(cfg)?;
    let avcc = AvcConfig::parse(&enc.avcc())?;
    let mut mux = FragmentedWriter::new(out, WriterOptions::new(Brand::Mp4));
    let track = mux.add_track(TrackConfig::new(SampleEntry::avc(avcc, w as u16, h as u16), num))?;
    let mut sink = Sink { mux, track, den, since_flush: 0 };

    let units = access_units(es);
    let first = ((opts.start.max(0.0) * f64::from(num) / f64::from(den)) as usize)
        .min(units.len().saturating_sub(1));
    let begin = (0..=first)
        .rev()
        .find(|&i| scan_access_unit(&es[units[i].clone()]).is_intra())
        .unwrap_or(0);
    let skip = first - begin;
    let limit = opts
        .duration
        .map_or(usize::MAX, |d| (d.max(0.0) * f64::from(num) / f64::from(den)).ceil() as usize);

    let mut count = 0i64;
    std::thread::scope(|scope| -> Res<()> {
        let (tx, rx) = sync_channel::<Yuv420>(8);
        let dec_thread = scope.spawn(move || -> Res<()> {
            let mut dec = Decoder::new();
            let (mut idx, mut sent) = (0usize, 0usize);
            let mut emit = |p: Picture| -> bool {
                idx += 1;
                if idx <= skip {
                    return true;
                }
                sent += 1;
                sent <= limit && tx.send(to_420(&p, w, h)).is_ok() && sent < limit
            };
            for r in units[begin..].iter().cloned() {
                for p in dec.decode(&es[r], 0)? {
                    if !emit(p) {
                        return Ok(());
                    }
                }
            }
            for p in dec.flush() {
                if !emit(p) {
                    break;
                }
            }
            Ok(())
        });
        for f in rx {
            let frame = YuvFrame { y: &f.y, u: &f.u, v: &f.v, y_stride: w, uv_stride: w / 2 };
            sink.push(enc.encode(&frame, count)?)?;
            count += 1;
        }
        dec_thread.join().map_err(|_| "decoder thread panicked")??;
        Ok(())
    })?;
    sink.push(enc.flush())?;
    if count == 0 {
        return Err("no decodable picture".into());
    }
    sink.mux.finish()?.flush()?;
    Ok(count as u64)
}

/// A decoded still, RGBA8 (BT.601 limited range, as MPEG video without colour description).
pub struct Still {
    pub width: usize,
    pub height: usize,
    pub rgba: Vec<u8>,
}

fn clamp(v: i32) -> u8 {
    v.clamp(0, 255) as u8
}

pub fn picture_to_rgba(p: &Picture) -> Still {
    let (w, h) = (p.width as usize, p.height as usize);
    let cw = p.chroma_width() as usize;
    let mut rgba = Vec::with_capacity(w * h * 4);
    for r in 0..h {
        let cr = if p.chroma == ChromaFormat::Yuv420 { r / 2 } else { r };
        for c in 0..w {
            let cc = if p.chroma == ChromaFormat::Yuv444 { c } else { c / 2 };
            let y = i32::from(p.y[r * w + c]) - 16;
            let u = i32::from(p.cb[cr * cw + cc]) - 128;
            let v = i32::from(p.cr[cr * cw + cc]) - 128;
            let yy = 298 * y;
            rgba.extend_from_slice(&[
                clamp((yy + 409 * v + 128) >> 8),
                clamp((yy - 100 * u - 208 * v + 128) >> 8),
                clamp((yy + 516 * u + 128) >> 8),
                255,
            ]);
        }
    }
    Still { width: w, height: h, rgba }
}

/// The picture shown at `seconds`: decoding starts at the closest intra access unit at or before it.
/// Positions are approximate to a couple of frames when the stream reorders pictures (B frames).
pub fn still_at(es: &[u8], seconds: f64) -> Res<Still> {
    let info = probe(es)?;
    let units = access_units(es);
    let target = ((seconds.max(0.0) * f64::from(info.fps_num) / f64::from(info.fps_den)) as usize)
        .min(units.len().saturating_sub(1));
    let start = (0..=target)
        .rev()
        .find(|&i| scan_access_unit(&es[units[i].clone()]).is_intra())
        .unwrap_or(0);
    let want = target - start;
    let mut dec = Decoder::new();
    let mut seen = 0usize;
    let mut last: Option<Picture> = None;
    for r in units[start..].iter().cloned() {
        for p in dec.decode(&es[r], 0)? {
            if seen == want {
                return Ok(picture_to_rgba(&p));
            }
            seen += 1;
            last = Some(p);
        }
        if seen > want + 4 {
            break;
        }
    }
    for p in dec.flush() {
        if seen == want {
            return Ok(picture_to_rgba(&p));
        }
        seen += 1;
        last = Some(p);
    }
    last.map(|p| picture_to_rgba(&p)).ok_or_else(|| "no decodable picture".into())
}

fn crc32(data: &[u8], mut crc: u32) -> u32 {
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xEDB8_8320 & 0u32.wrapping_sub(crc & 1));
        }
    }
    crc
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let mut c = crc32(kind, 0xFFFF_FFFF);
    out.extend_from_slice(kind);
    c = crc32(data, c);
    out.extend_from_slice(data);
    out.extend_from_slice(&(!c).to_be_bytes());
}

/// PNG (RGBA8, stored deflate blocks: no compression, no dependency).
pub fn png(still: &Still) -> Vec<u8> {
    let mut raw = Vec::with_capacity((still.width * 4 + 1) * still.height);
    for row in still.rgba.chunks(still.width * 4) {
        raw.push(0);
        raw.extend_from_slice(row);
    }
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(65535).collect();
    for (i, b) in blocks.iter().enumerate() {
        z.push(u8::from(i + 1 == blocks.len()));
        z.extend_from_slice(&(b.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(b.len() as u16)).to_le_bytes());
        z.extend_from_slice(b);
    }
    let (mut a, mut s) = (1u32, 0u32);
    for &b in &raw {
        a = (a + u32::from(b)) % 65521;
        s = (s + a) % 65521;
    }
    z.extend_from_slice(&((s << 16) | a).to_be_bytes());
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&(still.width as u32).to_be_bytes());
    ihdr.extend_from_slice(&(still.height as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_has_signature_and_dimensions() {
        let s = Still { width: 3, height: 2, rgba: vec![200; 24] };
        let p = png(&s);
        assert_eq!(&p[1..4], b"PNG");
        assert_eq!(u32::from_be_bytes(p[16..20].try_into().unwrap()), 3);
        assert_eq!(&p[p.len() - 8..p.len() - 4], b"IEND");
    }

    #[test]
    fn probe_rejects_garbage() {
        assert!(probe(&[0u8; 64]).is_err());
    }

    #[test]
    fn rgba_stream_rejects_invalid_bounds_before_reading() {
        let info = RgbaVideoInfo { width: 0, height: 16, fps_num: 24, fps_den: 1, frames: 1 };
        let error =
            encode_rgba_fmp4(&[][..], info, &Mp4Options::default(), Vec::new()).unwrap_err();
        assert!(error.to_string().contains("invalid bounded RGBA"));
        let extreme = RgbaVideoInfo { width: 16, fps_den: u32::MAX, ..info };
        assert!(encode_rgba_fmp4(&[][..], extreme, &Mp4Options::default(), Vec::new()).is_err());
    }

    #[test]
    fn rgba_stream_refuses_truncation_alpha_and_extra_data() {
        let info = RgbaVideoInfo { width: 16, height: 16, fps_num: 24, fps_den: 1, frames: 1 };
        let opts = Mp4Options::default();
        assert!(encode_rgba_fmp4(&[][..], info, &opts, Vec::new()).is_err());
        let transparent = vec![0; 16 * 16 * 4];
        assert!(
            encode_rgba_fmp4(&transparent[..], info, &opts, Vec::new())
                .unwrap_err()
                .to_string()
                .contains("opaque input")
        );
        let extra = vec![255; 16 * 16 * 4 + 1];
        assert!(
            encode_rgba_fmp4(&extra[..], info, &opts, Vec::new())
                .unwrap_err()
                .to_string()
                .contains("more frames")
        );
    }

    #[test]
    fn rgba_stream_muxes_the_exact_declared_frame_count() {
        let info = RgbaVideoInfo { width: 16, height: 16, fps_num: 24, fps_den: 1, frames: 3 };
        let rgba = vec![255; 16 * 16 * 4 * 3];
        let mut output = Vec::new();
        assert_eq!(
            encode_rgba_fmp4(&rgba[..], info, &Mp4Options::default(), &mut output).unwrap(),
            3
        );
        assert!(output.windows(4).any(|bytes| bytes == b"ftyp"));
        assert!(output.windows(4).any(|bytes| bytes == b"moov"));
        assert!(output.windows(4).any(|bytes| bytes == b"moof"));
    }
}
