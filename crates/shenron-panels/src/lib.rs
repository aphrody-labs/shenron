// SPDX-License-Identifier: Apache-2.0

//! Panel (koma) detection of manga pages and export of every panel as PNG, SVG and GIF.
//!
//! - [`segment`]: recursive XY-cut on the white gutters, in Japanese reading order.
//! - [`export`]: crop a panel, wrap it in an SVG (vector frame, clip and ink border around the
//!   embedded scan) and animate it as a GIF (Ken Burns, or a page reveal panel by panel).
//! - [`sheet`]: normalise chosen panels on one grid (sprite sheet PNG and `layout.json` for a
//!   Bevy `TextureAtlasLayout::from_grid`).
//!
//! The SVG embeds the scan pixels: it is a vector frame around the authorised scan, not a
//! trace of the drawing. Nothing is redrawn or invented.

#![forbid(unsafe_code)]

pub mod export;
pub mod segment;
pub mod sheet;

pub use export::{
    ExportError, GifOptions, Panel, crop_panel, ken_burns_gif, page_layout_svg, panel_svg,
    reveal_gif,
};
pub use segment::{PanelRect, SegmentOptions, downsample, segment_panels};
pub use sheet::{Sheet, SheetFrame, SheetOptions, build_sheet};
