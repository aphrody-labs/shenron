// SPDX-License-Identifier: Apache-2.0

//! 2D Vector canvas, manga/comic speech bubbles, typography typesetting,
//! and surface rasterization.

pub mod bubble;
pub mod path;
pub mod surface;
pub mod text;

pub use bubble::{BubbleKind, BubbleTail, SpeechBubble};
pub use path::{Path2D, PathCommand};
pub use surface::{CanvasSurface, ColorRgba};
pub use text::{PositionedGlyph, TextLayout, TextLayoutConfig, WritingDirection};
