// SPDX-License-Identifier: Apache-2.0

//! CLI command `shenron panels`: detect every panel (koma) of a manga page and export each one
//! as PNG, SVG and animated GIF, plus a vector layout map and a reveal GIF of the whole page.

use std::path::{Path, PathBuf};

use clap::Args;
use miette::{IntoDiagnostic, Result};
use shenron_manga::{MangaCdnClient, sha256_hex};
use shenron_panels::{
    GifOptions, SegmentOptions, SheetOptions, build_sheet, crop_panel, ken_burns_gif,
    page_layout_svg, panel_svg, reveal_gif, segment_panels,
};

/// Where the page comes from: exactly one of `IMAGE`, `--cdn` or `--chapter` + `--page`.
#[derive(Debug, Args)]
pub(crate) struct PanelsArgs {
    /// Local page image (PNG, JPEG).
    #[arg(conflicts_with_all = ["cdn", "chapter"])]
    image: Option<PathBuf>,
    /// CDN URL or relative media path of the page.
    #[arg(long, conflicts_with = "chapter")]
    cdn: Option<String>,
    /// Chapter ID of the Dragon Ball FR catalog.
    #[arg(long, requires = "page")]
    chapter: Option<u64>,
    /// Plate number within the chapter (1 = first plate).
    #[arg(long)]
    page: Option<u32>,
    /// Output directory (created; existing files are replaced).
    #[arg(short, long)]
    output: PathBuf,
    /// Skip the SVG files.
    #[arg(long)]
    no_svg: bool,
    /// Skip the GIF files.
    #[arg(long)]
    no_gif: bool,
    /// Longer side of the GIF frames, in pixels.
    #[arg(long, default_value_t = 480)]
    gif_side: u32,
    /// Longer side of the raster embedded in each SVG, in pixels (0 = original size).
    #[arg(long, default_value_t = 1200)]
    svg_side: u32,
    /// Margin added around each panel, as a fraction of its size.
    #[arg(long, default_value_t = 0.01)]
    margin: f32,
    /// Keep only the panels of this 1-based index (repeatable); default: all.
    #[arg(long = "only")]
    only: Vec<usize>,
    /// Largest gutter tilt tried, in degrees (0 = straight gutters only).
    #[arg(long, default_value_t = 10.0)]
    max_skew: f32,
    /// Write one sprite sheet (PNG + layout.json, for Bevy `TextureAtlasLayout::from_grid`) of the
    /// selected panels, in `--only` order, instead of the per-panel files.
    #[arg(long)]
    sheet: bool,
    /// Also encode the sheet tiles, in their chosen order, as a looping cut-out GIF.
    #[arg(long, requires = "sheet")]
    sheet_gif: bool,
    /// Sheet tile size `WxH` in pixels (default: mean panel aspect, longer side `--tile-side`).
    #[arg(long, value_parser = parse_tile, requires = "sheet")]
    tile: Option<(u32, u32)>,
    /// Longer side of the derived sheet tile.
    #[arg(long, default_value_t = 256, requires = "sheet")]
    tile_side: u32,
    /// Sheet columns (0 = square-ish grid).
    #[arg(long, default_value_t = 0, requires = "sheet")]
    columns: u32,
    /// Gap between sheet tiles, in pixels.
    #[arg(long, default_value_t = 0, requires = "sheet")]
    padding: u32,
    /// Playback rate recorded in layout.json.
    #[arg(long, default_value_t = 8.0, requires = "sheet")]
    fps: f32,
    /// Print the summary as JSON.
    #[arg(long)]
    json: bool,
}

fn parse_tile(raw: &str) -> Result<(u32, u32), String> {
    let (w, h) = raw.split_once(['x', 'X']).ok_or("expected WxH, e.g. 256x192")?;
    let side = |v: &str| v.trim().parse::<u32>().map_err(|e| e.to_string());
    Ok((side(w)?, side(h)?))
}

fn write(path: &Path, bytes: impl AsRef<[u8]>) -> Result<()> {
    std::fs::write(path, bytes).into_diagnostic()
}

async fn load(args: &PanelsArgs) -> Result<(Vec<u8>, String)> {
    if let Some(path) = &args.image {
        let label = path.file_stem().map_or_else(|| "page".into(), |s| s.to_string_lossy().into());
        return Ok((std::fs::read(path).into_diagnostic()?, label));
    }
    let client = MangaCdnClient::new();
    if let Some(url) = &args.cdn {
        let bytes = client.fetch_image(url).await.map_err(|e| miette::miette!("{e}"))?;
        let label = url.rsplit('/').next().unwrap_or("page").trim_end_matches(".jpg").to_owned();
        return Ok((bytes, label));
    }
    match (args.chapter, args.page) {
        (Some(chapter), Some(page)) => {
            let (bytes, _) = client
                .fetch_manga_plate(chapter, page)
                .await
                .map_err(|e| miette::miette!("{e}"))?;
            Ok((bytes, format!("ch{chapter}-p{page:03}")))
        },
        _ => Err(miette::miette!("give an IMAGE, --cdn URL, or --chapter ID --page N")),
    }
}

/// Executes `shenron panels`.
pub(crate) async fn run(args: PanelsArgs) -> Result<()> {
    let (bytes, label) = load(&args).await?;
    let decoded = shenron_manga::image::load_from_memory(&bytes).into_diagnostic()?.to_rgba8();
    let (width, height) = decoded.dimensions();
    let rgba = decoded.as_raw();
    let opts = SegmentOptions { max_skew_deg: args.max_skew, ..SegmentOptions::default() };
    let mut panels = segment_panels(rgba, width as usize, height as usize, &opts);
    if !args.only.is_empty() {
        // Keep the order of `--only`: it is the frame order of a sheet.
        panels = args
            .only
            .iter()
            .map(|&n| {
                n.checked_sub(1).and_then(|index| panels.get(index)).copied().ok_or_else(|| {
                    miette::miette!("panel index {n} is outside 1..={}", panels.len())
                })
            })
            .collect::<Result<Vec<_>>>()?;
    }
    if panels.is_empty() {
        return Err(miette::miette!(
            "no panel found on {label} ({width}×{height}): the page has no white gutter"
        ));
    }
    std::fs::create_dir_all(&args.output).into_diagnostic()?;
    if args.sheet {
        return write_sheet(&args, &label, rgba, (width, height), &panels, &sha256_hex(&bytes));
    }
    let gif = GifOptions { max_side: args.gif_side, ..GifOptions::default() };
    let mut files = Vec::new();
    for (i, rect) in panels.iter().enumerate() {
        let n = i + 1;
        let panel = crop_panel(rgba, width, height, *rect, args.margin)
            .map_err(|e| miette::miette!("panel {n}: {e}"))?;
        let stem = format!("{label}-case{n:02}");
        write(&args.output.join(format!("{stem}.png")), panel.png().into_diagnostic()?)?;
        files.push(format!("{stem}.png"));
        if !args.no_svg {
            let svg = panel_svg(&panel, &format!("{label}, case {n}"), args.svg_side)
                .into_diagnostic()?;
            write(&args.output.join(format!("{stem}.svg")), svg)?;
            files.push(format!("{stem}.svg"));
        }
        if !args.no_gif {
            let bytes = ken_burns_gif(&panel, &gif).into_diagnostic()?;
            write(&args.output.join(format!("{stem}.gif")), bytes)?;
            files.push(format!("{stem}.gif"));
        }
    }
    if !args.no_svg {
        let layout = page_layout_svg(&panels, width, height, &format!("{label}, plan de page"));
        write(&args.output.join(format!("{label}-plan.svg")), layout)?;
        files.push(format!("{label}-plan.svg"));
    }
    if !args.no_gif {
        let bytes = reveal_gif(rgba, width, height, &panels, &gif).into_diagnostic()?;
        write(&args.output.join(format!("{label}-lecture.gif")), bytes)?;
        files.push(format!("{label}-lecture.gif"));
    }
    if args.json {
        let summary = serde_json::json!({
            "page": label,
            "width": width,
            "height": height,
            "panels": panels.iter().map(|p| [p.x, p.y, p.w, p.h]).collect::<Vec<_>>(),
            "files": files,
        });
        println!("{}", serde_json::to_string_pretty(&summary).into_diagnostic()?);
    } else {
        println!(
            "{label}: {} panel(s) of {width}×{height} → {} file(s) in {}",
            panels.len(),
            files.len(),
            args.output.display()
        );
    }
    Ok(())
}

/// `--sheet`: crops the panels, normalises them on one grid and writes the PNG and its layout.
fn write_sheet(
    args: &PanelsArgs,
    label: &str,
    rgba: &[u8],
    (width, height): (u32, u32),
    panels: &[shenron_panels::PanelRect],
    source_sha256: &str,
) -> Result<()> {
    let crops = panels
        .iter()
        .enumerate()
        .map(|(i, rect)| {
            crop_panel(rgba, width, height, *rect, args.margin)
                .map_err(|e| miette::miette!("panel {}: {e}", i + 1))
        })
        .collect::<Result<Vec<_>>>()?;
    let opts = SheetOptions {
        tile: args.tile,
        tile_side: args.tile_side,
        columns: args.columns,
        padding: args.padding,
        fps: args.fps,
        ..SheetOptions::default()
    };
    let sheet = build_sheet(&crops, &opts).into_diagnostic()?;
    let image_name = format!("{label}-sheet.png");
    let layout_name = format!("{label}-sheet.layout.json");
    write(&args.output.join(&image_name), sheet.png().into_diagnostic()?)?;
    let mut layout: serde_json::Value =
        serde_json::from_str(&sheet.layout_json(&image_name)).into_diagnostic()?;
    layout["source"] = serde_json::json!({
        "sha256": source_sha256,
        "width": width,
        "height": height,
    });
    write(&args.output.join(&layout_name), serde_json::to_vec_pretty(&layout).into_diagnostic()?)?;
    let mut files = vec![image_name.clone(), layout_name.clone()];
    if args.sheet_gif {
        let gif_name = format!("{label}-sheet.gif");
        write(&args.output.join(&gif_name), sheet.gif().into_diagnostic()?)?;
        files.push(gif_name);
    }
    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "page": label,
                "width": width,
                "height": height,
                "panels": panels.iter().map(|p| [p.x, p.y, p.w, p.h]).collect::<Vec<_>>(),
                "files": files,
                "sheet": layout,
            }))
            .into_diagnostic()?
        );
        return Ok(());
    }
    println!(
        "{label}: sheet {}×{} px, {} frame(s) of {}×{} ({} col × {} row) → {image_name}, {layout_name}",
        sheet.image.width(),
        sheet.image.height(),
        crops.len(),
        sheet.tile.0,
        sheet.tile.1,
        sheet.columns,
        sheet.rows
    );
    Ok(())
}
