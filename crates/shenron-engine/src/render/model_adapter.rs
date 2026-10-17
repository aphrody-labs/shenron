// SPDX-License-Identifier: Apache-2.0

//! Adapter from the `ModelJson` produced by the private `@shenron/dbxv2` package (served by
//! `scripts/ops/dbxv2-serve.ts` at `/cpk/<name>/model/<emd>.json`) to the
//! [`AssembledCharacterModel`] consumed by [`super::model_serve`].
//!
//! The JSON carries geometry and texture metadata only (no pixels): textures are supplied by the
//! caller, either as PNG bytes from the `/png` endpoint ([`model_from_json_with_pngs`], lossless,
//! native size, checked against the declared size) or already decoded ([`model_from_json`]).
//! Without textures a neutral grey placeholder of the declared size keeps `textureIndex` valid.
//! UVs, vertex order and indices are never transformed.

use super::pixel_perfect::{AlphaMode, ColorSpace, PixelError, PixelTexture};
use serde::Deserialize;
use shenron_re::formats::{
    AssembledCharacterModel, EmbRgbaTexture, EskFile, ModelPrimitive, TexturePixelFormat,
};

/// Largest placeholder edge, to bound memory on hostile or corrupt metadata.
const MAX_PLACEHOLDER_EDGE: u32 = 4096;

#[derive(Debug, thiserror::Error)]
pub enum ModelAdapterError {
    #[error("invalid model JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("primitive {primitive}: {what}")]
    Invalid { primitive: usize, what: &'static str },
    #[error("texture: {0}")]
    Texture(#[from] PixelError),
    #[error("model declares {declared} textures, caller supplied {supplied} PNGs")]
    TextureCount { declared: usize, supplied: usize },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrimitiveJson {
    #[serde(default)]
    name: String,
    #[serde(default)]
    material_name: String,
    #[serde(default)]
    positions: Vec<[f32; 3]>,
    #[serde(default)]
    normals: Vec<[f32; 3]>,
    #[serde(default)]
    uv: Vec<[f32; 2]>,
    #[serde(default)]
    indices: Vec<u32>,
    #[serde(default)]
    texture_index: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct TextureJson {
    width: u32,
    height: u32,
}

#[derive(Debug, Deserialize)]
struct ModelJson {
    #[serde(default)]
    name: String,
    #[serde(default)]
    primitives: Vec<PrimitiveJson>,
    #[serde(default)]
    textures: Vec<TextureJson>,
    #[serde(default)]
    skeleton: serde_json::Value,
}

/// Converts `ModelJson` text into an [`AssembledCharacterModel`].
///
/// `textures` overrides the placeholders when it matches the declared texture count.
pub fn model_from_json(
    json: &str,
    textures: Option<Vec<EmbRgbaTexture>>,
) -> Result<AssembledCharacterModel, ModelAdapterError> {
    let parsed: ModelJson = serde_json::from_str(json)?;

    let textures = match textures {
        Some(t) if t.len() == parsed.textures.len() => t,
        _ => parsed
            .textures
            .iter()
            .map(|t| {
                let w = t.width.clamp(1, MAX_PLACEHOLDER_EDGE);
                let h = t.height.clamp(1, MAX_PLACEHOLDER_EDGE);
                EmbRgbaTexture {
                    width: w,
                    height: h,
                    format: TexturePixelFormat::Rgba8,
                    rgba: [220u8, 220, 220, 255].repeat((w * h) as usize),
                }
            })
            .collect(),
    };

    let mut primitives = Vec::with_capacity(parsed.primitives.len());
    for (i, p) in parsed.primitives.into_iter().enumerate() {
        let n = p.positions.len();
        if !p.normals.is_empty() && p.normals.len() != n {
            return Err(ModelAdapterError::Invalid {
                primitive: i,
                what: "normals/positions length mismatch",
            });
        }
        if !p.uv.is_empty() && p.uv.len() != n {
            return Err(ModelAdapterError::Invalid {
                primitive: i,
                what: "uv/positions length mismatch",
            });
        }
        if p.indices.iter().any(|&ix| ix as usize >= n) {
            return Err(ModelAdapterError::Invalid { primitive: i, what: "index out of range" });
        }
        if p.indices.len() % 3 != 0 {
            return Err(ModelAdapterError::Invalid {
                primitive: i,
                what: "indices not a multiple of 3",
            });
        }
        let texture_index = p.texture_index.filter(|&t| t < textures.len());
        primitives.push(ModelPrimitive {
            name: p.name,
            material_name: p.material_name,
            normals: if p.normals.is_empty() { vec![[0.0, 1.0, 0.0]; n] } else { p.normals },
            uv: if p.uv.is_empty() { vec![[0.0, 0.0]; n] } else { p.uv },
            positions: p.positions,
            indices: p.indices,
            texture_index,
        });
    }

    // The package exposes the skeleton as `{ name, bones: [...] }` when present, else null.
    let skeleton = serde_json::from_value::<EskFile>(parsed.skeleton).ok();

    Ok(AssembledCharacterModel { name: parsed.name, primitives, textures, skeleton })
}

/// Converts `ModelJson` text using the caller's real PNG textures (one per declared texture, in
/// order). Each PNG is decoded losslessly at its native size and must match the declared size.
pub fn model_from_json_with_pngs(
    json: &str,
    pngs: &[&[u8]],
    color_space: ColorSpace,
    alpha: AlphaMode,
) -> Result<AssembledCharacterModel, ModelAdapterError> {
    let parsed: ModelJson = serde_json::from_str(json)?;
    if pngs.len() != parsed.textures.len() {
        return Err(ModelAdapterError::TextureCount {
            declared: parsed.textures.len(),
            supplied: pngs.len(),
        });
    }
    let mut textures = Vec::with_capacity(pngs.len());
    for (index, (bytes, declared)) in pngs.iter().zip(&parsed.textures).enumerate() {
        let t = PixelTexture::decode_png(bytes, color_space, alpha)?;
        if (t.width, t.height) != (declared.width, declared.height) {
            return Err(PixelError::DeclaredSizeMismatch {
                index,
                got_w: t.width,
                got_h: t.height,
                want_w: declared.width,
                want_h: declared.height,
            }
            .into());
        }
        textures.push(EmbRgbaTexture {
            width: t.width,
            height: t.height,
            format: TexturePixelFormat::Rgba8,
            rgba: t.rgba,
        });
    }
    model_from_json(json, Some(textures))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SYNTHETIC: &str = r#"{
      "name": "synthetic", "vertices": 3, "triangles": 1,
      "primitives": [{
        "name": "p0", "materialName": "m0",
        "positions": [[0,0,0],[1,0,0],[0,1,0]],
        "normals": [[0,0,1],[0,0,1],[0,0,1]],
        "uv": [[0,0],[1,0],[0,1]],
        "indices": [0,1,2], "textureIndex": 0
      },{
        "name": "p1", "materialName": "m1",
        "positions": [[0,0,0],[1,0,0],[0,1,0]],
        "normals": [], "uv": [], "indices": [0,1,2], "textureIndex": 7
      }],
      "textures": [{"width": 4, "height": 2, "format": "dxt5"}],
      "skeleton": {"name": "sk", "bones": [{
        "index": 0, "name": "root", "parent_index": null,
        "translation": [0,0,0], "rotation": [0,0,0,1], "scale": [1,1,1],
        "inverse_bind_matrix": [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
      }]}
    }"#;

    #[test]
    fn converts_geometry_textures_and_skeleton() {
        let m = model_from_json(SYNTHETIC, None).unwrap();
        assert_eq!(m.name, "synthetic");
        assert_eq!(m.primitives.len(), 2);
        assert_eq!(m.primitives[0].positions.len(), 3);
        assert_eq!(m.primitives[0].texture_index, Some(0));
        // Out-of-range texture index is dropped; missing normals/uv are filled.
        assert_eq!(m.primitives[1].texture_index, None);
        assert_eq!(m.primitives[1].normals.len(), 3);
        assert_eq!(m.primitives[1].uv.len(), 3);
        assert_eq!(m.textures.len(), 1);
        assert_eq!(m.textures[0].rgba.len(), 4 * 2 * 4);
        assert_eq!(m.skeleton.unwrap().bones.len(), 1);
    }

    #[test]
    fn null_skeleton_is_none() {
        let json = r#"{"name":"n","primitives":[],"textures":[],"skeleton":null}"#;
        assert!(model_from_json(json, None).unwrap().skeleton.is_none());
    }

    #[test]
    fn rejects_out_of_range_index() {
        let json = r#"{"name":"n","primitives":[{"positions":[[0,0,0]],"indices":[0,0,5]}],"textures":[]}"#;
        assert!(matches!(model_from_json(json, None), Err(ModelAdapterError::Invalid { .. })));
    }

    #[test]
    fn caller_textures_replace_placeholders() {
        let tex = EmbRgbaTexture {
            width: 1,
            height: 1,
            format: TexturePixelFormat::Rgba8,
            rgba: vec![1, 2, 3, 4],
        };
        let m = model_from_json(SYNTHETIC, Some(vec![tex])).unwrap();
        assert_eq!(m.textures[0].rgba, vec![1, 2, 3, 4]);
    }

    fn png(w: u32, h: u32, rgba: Vec<u8>) -> Vec<u8> {
        let mut out = Vec::new();
        image::RgbaImage::from_raw(w, h, rgba)
            .unwrap()
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn real_pngs_replace_grey_without_touching_geometry() {
        let rgba: Vec<u8> = (0..4 * 2 * 4).map(|i| (i * 7 + 1) as u8).collect();
        let bytes = png(4, 2, rgba.clone());
        let m =
            model_from_json_with_pngs(SYNTHETIC, &[&bytes], ColorSpace::Srgb, AlphaMode::Straight)
                .unwrap();
        assert_eq!(m.textures[0].rgba, rgba);
        assert_eq!((m.textures[0].width, m.textures[0].height), (4, 2));
        // UV and vertex order are exactly those of the JSON.
        assert_eq!(m.primitives[0].uv, vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]);
        assert_eq!(m.primitives[0].indices, vec![0, 1, 2]);
        assert_eq!(
            m.primitives[0].positions,
            vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
        );
    }

    #[test]
    fn png_size_and_count_are_checked() {
        let wrong = png(2, 2, vec![0; 16]);
        assert!(matches!(
            model_from_json_with_pngs(SYNTHETIC, &[&wrong], ColorSpace::Srgb, AlphaMode::Straight),
            Err(ModelAdapterError::Texture(PixelError::DeclaredSizeMismatch { .. }))
        ));
        assert!(matches!(
            model_from_json_with_pngs(SYNTHETIC, &[], ColorSpace::Srgb, AlphaMode::Straight),
            Err(ModelAdapterError::TextureCount { declared: 1, supplied: 0 })
        ));
    }
}
