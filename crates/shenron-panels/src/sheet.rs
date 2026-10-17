// SPDX-License-Identifier: Apache-2.0

//! Sprite sheet of chosen panels: every panel is fitted (letterboxed, centred) in one common
//! tile, the tiles are laid out on a regular grid, and a `layout.json` describes the grid so
//! that Bevy can build its atlas with `TextureAtlasLayout::from_grid(tile, columns, rows,
//! padding, offset)`.
//!
//! A manga panel is a still drawing: the sheet is a cut-out animation (motion comic), not an
//! in-between animation.

use image::{
    Rgba, RgbaImage,
    imageops::{self, FilterType},
};
use serde_json::{Value, json};

use crate::{
    export::{ExportError, Panel},
    segment::PanelRect,
};

/// Largest side of a sheet, in pixels (GPU texture limit on the targets of Dragon Pixel).
const MAX_SIDE: u64 = 8192;

/// Geometry of [`build_sheet`].
#[derive(Clone, Copy, Debug)]
pub struct SheetOptions {
    /// Common tile size in pixels; `None` derives it from the mean aspect of the panels with
    /// the longer side at `tile_side`.
    pub tile: Option<(u32, u32)>,
    /// Longer side of the derived tile.
    pub tile_side: u32,
    /// Number of columns; `0` picks `ceil(sqrt(n))`.
    pub columns: u32,
    /// Gap between tiles in pixels (Bevy `padding`).
    pub padding: u32,
    /// Playback rate recorded in the layout.
    pub fps: f32,
    /// Fill of the letterbox around a panel (default: opaque paper white).
    pub background: [u8; 4],
}

impl Default for SheetOptions {
    fn default() -> Self {
        Self {
            tile: None,
            tile_side: 256,
            columns: 0,
            padding: 0,
            fps: 8.0,
            background: [255, 255, 255, 255],
        }
    }
}

/// A rendered sheet and its layout.
#[derive(Clone, Debug)]
pub struct Sheet {
    /// The sheet pixels.
    pub image: RgbaImage,
    /// Tile size.
    pub tile: (u32, u32),
    /// Grid columns.
    pub columns: u32,
    /// Grid rows.
    pub rows: u32,
    /// Gap between tiles.
    pub padding: u32,
    /// Playback rate.
    pub fps: f32,
    /// One entry per panel, in grid order.
    pub frames: Vec<SheetFrame>,
}

/// One frame of a [`Sheet`].
#[derive(Clone, Copy, Debug)]
pub struct SheetFrame {
    /// Content rectangle inside the sheet, in pixels `(x, y, w, h)`.
    pub content: (u32, u32, u32, u32),
    /// Size of the panel crop before fitting.
    pub source: (u32, u32),
    /// Position of the panel on its page, in page uv.
    pub panel: PanelRect,
}

impl Sheet {
    /// Origin of the tile of frame `index`, in sheet pixels.
    #[must_use]
    pub fn tile_origin(&self, index: u32) -> (u32, u32) {
        let (col, row) = (index % self.columns, index / self.columns);
        (col * (self.tile.0 + self.padding), row * (self.tile.1 + self.padding))
    }

    /// The `layout.json` document. `image_name` is the file name of the sheet PNG next to it.
    ///
    /// `tile`, `columns`, `rows`, `padding` and `offset` are the arguments of Bevy's
    /// `TextureAtlasLayout::from_grid`; `bounds` is the tile rectangle of each frame.
    #[must_use]
    pub fn layout_json(&self, image_name: &str) -> String {
        let frames: Vec<Value> = self
            .frames
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let (x, y) = self.tile_origin(i as u32);
                json!({
                    "index": i,
                    "bounds": [x, y, self.tile.0, self.tile.1],
                    "content": [f.content.0, f.content.1, f.content.2, f.content.3],
                    "source": [f.source.0, f.source.1],
                    "panel": [f.panel.x, f.panel.y, f.panel.w, f.panel.h],
                })
            })
            .collect();
        let doc = json!({
            "version": 1,
            "image": image_name,
            "size": [self.image.width(), self.image.height()],
            "tile": [self.tile.0, self.tile.1],
            "columns": self.columns,
            "rows": self.rows,
            "padding": [self.padding, self.padding],
            "offset": [0, 0],
            "fps": self.fps,
            "frame_count": self.frames.len(),
            "frames": frames,
        });
        serde_json::to_string_pretty(&doc).unwrap_or_default()
    }

    /// PNG bytes of the sheet.
    ///
    /// # Errors
    /// Fails when the PNG encoder does.
    pub fn png(&self) -> Result<Vec<u8>, ExportError> {
        let mut out = std::io::Cursor::new(Vec::new());
        self.image.write_to(&mut out, image::ImageFormat::Png)?;
        Ok(out.into_inner())
    }
}

/// Fits every panel in a common tile and assembles the grid, in the order given.
///
/// # Errors
/// Fails without panels, on a zero-sized tile or when the sheet exceeds 8192 px per side.
pub fn build_sheet(panels: &[Panel], opts: &SheetOptions) -> Result<Sheet, ExportError> {
    if panels.is_empty() {
        return Err(ExportError::NoPanels);
    }
    let n = panels.len() as u32;
    let tile = match opts.tile {
        Some(t) => t,
        None => {
            let aspect = panels
                .iter()
                .map(|p| p.image.width() as f32 / p.image.height().max(1) as f32)
                .sum::<f32>()
                / panels.len() as f32;
            let side = opts.tile_side as f32;
            if aspect >= 1.0 {
                (opts.tile_side, (side / aspect).round().max(1.0) as u32)
            } else {
                ((side * aspect).round().max(1.0) as u32, opts.tile_side)
            }
        },
    };
    if tile.0 == 0 || tile.1 == 0 {
        return Err(ExportError::BadSheet("tile has a zero side".into()));
    }
    let columns = if opts.columns == 0 { f64::from(n).sqrt().ceil() as u32 } else { opts.columns }
        .clamp(1, n);
    let rows = n.div_ceil(columns);
    let pad = u64::from(opts.padding);
    let width = u64::from(columns) * u64::from(tile.0) + pad * u64::from(columns - 1);
    let height = u64::from(rows) * u64::from(tile.1) + pad * u64::from(rows - 1);
    if width > MAX_SIDE || height > MAX_SIDE {
        return Err(ExportError::BadSheet(format!("{width}x{height} exceeds {MAX_SIDE} px")));
    }
    let mut image = RgbaImage::from_pixel(width as u32, height as u32, Rgba(opts.background));
    let mut sheet = Sheet {
        image: RgbaImage::new(0, 0),
        tile,
        columns,
        rows,
        padding: opts.padding,
        fps: opts.fps,
        frames: Vec::with_capacity(panels.len()),
    };
    for (i, panel) in panels.iter().enumerate() {
        let (sw, sh) = panel.image.dimensions();
        let scale = (tile.0 as f32 / sw.max(1) as f32).min(tile.1 as f32 / sh.max(1) as f32);
        let fw = ((sw as f32 * scale).round() as u32).clamp(1, tile.0);
        let fh = ((sh as f32 * scale).round() as u32).clamp(1, tile.1);
        let fitted = imageops::resize(&panel.image, fw, fh, FilterType::Lanczos3);
        let (ox, oy) = sheet.tile_origin(i as u32);
        let (cx, cy) = (ox + (tile.0 - fw) / 2, oy + (tile.1 - fh) / 2);
        imageops::replace(&mut image, &fitted, i64::from(cx), i64::from(cy));
        sheet.frames.push(SheetFrame {
            content: (cx, cy, fw, fh),
            source: (sw, sh),
            panel: panel.rect,
        });
    }
    sheet.image = image;
    Ok(sheet)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn panel(w: u32, h: u32, shade: u8) -> Panel {
        Panel {
            image: RgbaImage::from_pixel(w, h, Rgba([shade, shade, shade, 255])),
            rect: PanelRect { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        }
    }

    #[test]
    fn five_panels_fill_a_three_by_two_grid_with_centred_content() {
        let panels: Vec<Panel> =
            (0..5).map(|i| panel(200 + i * 20, 100, 10 + i as u8 * 40)).collect();
        let opts = SheetOptions {
            tile: Some((64, 64)),
            columns: 3,
            padding: 2,
            ..SheetOptions::default()
        };
        let sheet = build_sheet(&panels, &opts).unwrap();
        assert_eq!((sheet.columns, sheet.rows), (3, 2));
        assert_eq!(sheet.image.dimensions(), (3 * 64 + 2 * 2, 2 * 64 + 2));
        // Frame 4 sits in column 1, row 1; a wide panel is letterboxed vertically.
        assert_eq!(sheet.tile_origin(4), (66, 66));
        let (cx, cy, fw, fh) = sheet.frames[4].content;
        assert_eq!(fw, 64);
        assert!(fh < 64 && cy > 66 && cx == 66, "{:?}", sheet.frames[4]);
        let c = sheet.image.get_pixel(cx + fw / 2, cy + fh / 2);
        assert_eq!(c.0, [170, 170, 170, 255]);
        // The unused sixth cell stays background.
        assert_eq!(sheet.image.get_pixel(132 + 32, 66 + 32).0, [255, 255, 255, 255]);
    }

    #[test]
    fn the_layout_follows_the_from_grid_contract() {
        let panels = vec![panel(100, 150, 0), panel(100, 150, 0)];
        let sheet =
            build_sheet(&panels, &SheetOptions { fps: 12.0, ..SheetOptions::default() }).unwrap();
        let v: Value = serde_json::from_str(&sheet.layout_json("a-sheet.png")).unwrap();
        assert_eq!(v["image"], "a-sheet.png");
        assert_eq!(v["columns"], 2);
        assert_eq!(v["rows"], 1);
        assert_eq!(v["fps"], 12.0);
        assert_eq!(v["frame_count"], 2);
        let tile = &v["tile"];
        assert_eq!(v["size"][0].as_u64().unwrap(), 2 * tile[0].as_u64().unwrap());
        assert_eq!(v["frames"][1]["bounds"][0], tile[0]);
        assert_eq!(v["padding"], json!([0, 0]));
    }

    #[test]
    fn degenerate_inputs_are_refused() {
        assert!(matches!(build_sheet(&[], &SheetOptions::default()), Err(ExportError::NoPanels)));
        let p = [panel(10, 10, 0)];
        let zero = SheetOptions { tile: Some((0, 8)), ..SheetOptions::default() };
        assert!(matches!(build_sheet(&p, &zero), Err(ExportError::BadSheet(_))));
        let huge = SheetOptions { tile: Some((9000, 8)), ..SheetOptions::default() };
        assert!(matches!(build_sheet(&p, &huge), Err(ExportError::BadSheet(_))));
    }
}
