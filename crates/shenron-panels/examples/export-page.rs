// SPDX-License-Identifier: Apache-2.0

//! Reproducible export from an authorised local page, without network or GPU.

use std::{error::Error, path::PathBuf};

use shenron_panels::{
    SegmentOptions, SheetOptions, build_sheet, crop_panel, page_layout_svg, panel_svg,
    segment_panels,
};

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = std::env::args_os().skip(1);
    let input = PathBuf::from(args.next().ok_or("expected local page and output directory")?);
    let output = PathBuf::from(args.next().ok_or("expected output directory")?);
    if args.next().is_some() {
        return Err("expected exactly two arguments".into());
    }
    let page = image::open(&input)?.into_rgba8();
    let (width, height) = page.dimensions();
    let rects =
        segment_panels(page.as_raw(), width as usize, height as usize, &SegmentOptions::default());
    let panels = rects
        .iter()
        .map(|rect| crop_panel(page.as_raw(), width, height, *rect, 0.0))
        .collect::<Result<Vec<_>, _>>()?;
    let sheet = build_sheet(
        &panels,
        &SheetOptions { tile: Some((256, 256)), fps: 2.0, padding: 8, ..SheetOptions::default() },
    )?;
    std::fs::create_dir_all(&output)?;
    std::fs::write(output.join("sheet.png"), sheet.png()?)?;
    std::fs::write(output.join("sheet.gif"), sheet.gif()?)?;
    std::fs::write(output.join("sheet.layout.json"), sheet.layout_json("sheet.png"))?;
    std::fs::write(
        output.join("page-layout.svg"),
        page_layout_svg(&rects, width, height, "Page panels"),
    )?;
    for (index, panel) in panels.iter().enumerate() {
        std::fs::write(
            output.join(format!("panel-{}.svg", index + 1)),
            panel_svg(panel, "Manga panel", 512)?,
        )?;
    }
    println!(
        "{}",
        serde_json::json!({
            "page_size": [width, height],
            "panels": panels.len(),
            "sheet_size": [sheet.image.width(), sheet.image.height()],
            "gif_frames": sheet.frames.len(),
            "gif_frame_ms": 500,
            "svg_drawing": "embedded raster; vector layout and border",
        })
    );
    Ok(())
}
