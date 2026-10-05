// SPDX-License-Identifier: MIT OR Apache-2.0
//! Font families the renderer can letter with, as the editor lists them.

use koharu_renderer::{
    FontFamily as RenderFontFamily, FontRange as RenderFontRange, FontSource as RenderFontSource,
    FontStyle as RenderFontStyle,
};
use koharu_scene::FontStyle;
use serde::Serialize;
use specta::Type;

#[derive(Clone, Debug, Serialize, Type)]
pub struct FontFamily {
    pub name: String,
    pub metadata: FontMetadata,
    pub sources: Vec<FontSource>,
    pub faces: Vec<FontFace>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct FontMetadata {
    pub primary_script: Option<String>,
    pub scripts: Vec<String>,
    pub languages: Vec<String>,
    pub category: Option<String>,
    pub classifications: Vec<String>,
    pub use_cases: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct FontFace {
    pub postscript_name: String,
    pub weight: u16,
    pub weight_range: Option<FontRange>,
    pub style: FontStyle,
}

#[derive(Clone, Copy, Debug, Serialize, Type)]
pub struct FontRange {
    pub minimum: u16,
    pub maximum: u16,
}

#[derive(Clone, Copy, Debug, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum FontSource {
    System,
    Bundled,
}

impl From<RenderFontFamily> for FontFamily {
    fn from(family: RenderFontFamily) -> Self {
        Self {
            name: family.name,
            metadata: FontMetadata {
                primary_script: family.metadata.primary_script,
                scripts: family.metadata.scripts,
                languages: family.metadata.languages,
                category: family.metadata.category,
                classifications: family.metadata.classifications,
                use_cases: family.metadata.use_cases,
            },
            sources: family
                .sources
                .into_iter()
                .map(|source| match source {
                    RenderFontSource::System => FontSource::System,
                    RenderFontSource::Bundled => FontSource::Bundled,
                })
                .collect(),
            faces: family
                .faces
                .into_iter()
                .map(|face| FontFace {
                    postscript_name: face.post_script_name,
                    weight: face.weight,
                    weight_range: face.weight_range.map(FontRange::from),
                    style: match face.style {
                        RenderFontStyle::Normal => FontStyle::Normal,
                        RenderFontStyle::Italic => FontStyle::Italic,
                        RenderFontStyle::Oblique => FontStyle::Oblique,
                    },
                })
                .collect(),
        }
    }
}

impl From<RenderFontRange> for FontRange {
    fn from(value: RenderFontRange) -> Self {
        Self { minimum: value.minimum, maximum: value.maximum }
    }
}
