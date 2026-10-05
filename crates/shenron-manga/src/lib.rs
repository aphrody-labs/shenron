// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 aphrody contributors

//! Shenron adapter over the Koharu headless library (`koharu-library`).
//!
//! Koharu owns detection, OCR, translation, inpainting, typesetting and PSD export; this crate
//! only maps its page results to Shenron's versioned candidate records.
//!
//! # Architecture
//!
//! - [`bubble`]: Speech bubble geometry and Japanese manga reading order (Right-to-Left, Top-to-Bottom).
//! - [`catalog`]: Dragon Ball FR catalog and CDN plate fetching.
//! - [`ocr_projection`]: Projection of a page run to an Aphrody OCR v2 review record.
//! - [`pipeline`]: Native Koharu page stages and versioned review candidate results.

#![allow(missing_docs)]
#![allow(clippy::module_name_repetitions)]

pub mod bubble;
pub mod catalog;
pub mod ocr_projection;
pub mod pipeline;

#[cfg(feature = "koharu")]
pub use koharu_library as koharu;

pub use bubble::{BoundingBox, BubbleKind, Point, SpeechBubble, sort_manga_reading_order};
pub use catalog::{CdnError, MangaCdnClient, PlateRecord};
pub use image;
pub use ocr_projection::OcrProjectionError;
pub use pipeline::{
    MangaPageOutput, MangaPageResult, MangaPipeline, MangaPipelineError, MangaPipelineOptions,
    MangaSource, PAGE_RESULT_SCHEMA, sha256_hex,
};
