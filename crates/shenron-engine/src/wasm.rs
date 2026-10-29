// SPDX-License-Identifier: Apache-2.0

//! WebAssembly bindings for browser WebGPU canvas and JS game loops.

use crate::canvas::{
    BubbleKind, CanvasSurface, ColorRgba, SpeechBubble, TextLayoutConfig, WritingDirection,
};
use glam::Vec2;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

/// WebAssembly wrapper around the 2D vector canvas.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct CanvasEngineWasm {
    surface: CanvasSurface,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl CanvasEngineWasm {
    /// Creates a new WASM canvas surface.
    #[must_use]
    pub fn new(width: u32, height: u32) -> Self {
        Self { surface: CanvasSurface::new(width, height) }
    }

    /// Clears the canvas with an RGBA color.
    pub fn clear(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.surface.clear(ColorRgba::new(r, g, b, a));
    }

    /// Fills an axis-aligned rectangle.
    #[allow(clippy::too_many_arguments)]
    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32, r: u8, g: u8, b: u8, a: u8) {
        self.surface.fill_rect(Vec2::new(x, y), Vec2::new(w, h), ColorRgba::new(r, g, b, a));
    }

    /// Draws a procedural manga speech bubble.
    #[allow(clippy::too_many_arguments)]
    pub fn draw_speech_bubble(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        kind_str: &str,
        tip_x: f32,
        tip_y: f32,
    ) {
        let kind = match kind_str.to_lowercase().as_str() {
            "shout" => BubbleKind::Shout,
            "thought" => BubbleKind::Thought,
            _ => BubbleKind::Normal,
        };

        let mut bubble = SpeechBubble::new(Vec2::new(x, y), Vec2::new(w, h), kind);
        if tip_x > 0.0 || tip_y > 0.0 {
            bubble = bubble.with_tail(Vec2::new(tip_x, tip_y), 24.0);
        }

        self.surface.draw_speech_bubble(&bubble, ColorRgba::WHITE, ColorRgba::BLACK);
    }

    /// Draws text with horizontal or vertical typesetting.
    pub fn draw_text(&mut self, text: &str, x: f32, y: f32, font_size: f32, vertical: bool) {
        let config = TextLayoutConfig {
            font_size,
            direction: if vertical {
                WritingDirection::VerticalRtl
            } else {
                WritingDirection::HorizontalLtr
            },
            ..Default::default()
        };
        self.surface.draw_text(text, Vec2::new(x, y), &config, ColorRgba::BLACK);
    }

    /// Returns a copy of the RGBA pixel buffer.
    #[must_use]
    pub fn get_pixel_data(&self) -> Vec<u8> {
        self.surface.pixels().to_vec()
    }
}

/// A browser canvas presented by wgpu on WebGPU (no WebGL backend is compiled in).
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
struct WebGpuCanvas {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    view_format: wgpu::TextureFormat,
    lost: std::sync::Arc<std::sync::atomic::AtomicBool>,
    present_requests: u64,
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
impl WebGpuCanvas {
    async fn open(
        canvas: web_sys::HtmlCanvasElement,
        label: &str,
        linear_output: bool,
    ) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let surface =
            instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(js_error)?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::LowPower,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
                apply_limit_buckets: false,
            })
            .await
            .map_err(js_error)?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor { label: Some(label), ..Default::default() })
            .await
            .map_err(js_error)?;
        let limit = device.limits().max_texture_dimension_2d;
        if width > limit || height > limit {
            return Err(js_error(format!("Canvas {width}x{height} exceeds device limit {limit}")));
        }
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| js_error("WebGPU adapter cannot present to the canvas"))?;
        // The shaders write premultiplied colour; every WebGPU canvas supports "premultiplied"
        // (GPUCanvasAlphaMode), whatever the reported capability list holds.
        config.alpha_mode = wgpu::CompositeAlphaMode::PreMultiplied;
        let view_format = crate::render::model_serve::canvas_view_format(
            config.format,
            &mut config.view_formats,
            linear_output,
        );
        surface.configure(&device, &config);
        let lost = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = std::sync::Arc::clone(&lost);
        device.set_device_lost_callback(move |_, _| {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        });
        Ok(Self { device, queue, surface, config, view_format, lost, present_requests: 0 })
    }

    fn is_lost(&self) -> bool {
        self.lost.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Records one frame with `record` and presents it. `false` once the device is lost.
    fn frame(
        &mut self,
        record: impl FnOnce(&wgpu::Queue, &mut wgpu::CommandEncoder, &wgpu::TextureView, f32),
    ) -> bool {
        if self.is_lost() {
            return false;
        }
        let (texture, suboptimal) = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(texture) => (texture, false),
            wgpu::CurrentSurfaceTexture::Suboptimal(texture) => (texture, true),
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return true;
            },
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                return true;
            },
            wgpu::CurrentSurfaceTexture::Validation => {
                self.lost.store(true, std::sync::atomic::Ordering::Relaxed);
                return false;
            },
        };
        let view = texture.texture.create_view(&wgpu::TextureViewDescriptor {
            format: Some(self.view_format),
            ..Default::default()
        });
        let aspect = self.config.width as f32 / self.config.height.max(1) as f32;
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("shenron frame"),
        });
        record(&self.queue, &mut encoder, &view, aspect);
        self.queue.submit([encoder.finish()]);
        // wgpu 30: presentation moved from `SurfaceTexture::present` to `Queue::present`.
        self.queue.present(texture);
        self.present_requests = self.present_requests.saturating_add(1);
        if suboptimal {
            self.surface.configure(&self.device, &self.config);
        }
        true
    }

    fn resize(&mut self, width: u32, height: u32) {
        let (width, height) = (width.max(1), height.max(1));
        if (width, height) != (self.config.width, self.config.height) {
            self.config.width = width;
            self.config.height = height;
            self.surface.configure(&self.device, &self.config);
        }
    }
}

/// Browser WebGPU renderer of a Toriyama 3D model (`render::toriyama3d`).
///
/// JavaScript owns the frame loop (visibility, reduced motion, pointer); each `frame` call
/// draws one image. Without WebGPU, `createToriyamaModel` rejects and the caller keeps its SVG.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
pub struct ToriyamaModelWasm {
    gpu: WebGpuCanvas,
    pipeline: crate::render::ToriyamaPipeline,
    uniforms: crate::render::ToriyamaUniforms,
}

/// Opens a WebGPU device on `canvas` and prepares `model` (`dragon-ball` or `kinto-un`) from its
/// flat measured `params` (see `DragonBallUniforms::from_params`, `KintoUnUniforms::from_params`).
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = createToriyamaModel)]
pub async fn create_toriyama_model(
    canvas: web_sys::HtmlCanvasElement,
    model: String,
    params: Vec<f32>,
) -> Result<ToriyamaModelWasm, JsValue> {
    let model = crate::render::ToriyamaModel::from_name(&model)
        .ok_or_else(|| js_error(format!("unknown Toriyama model {model}")))?;
    let uniforms =
        model.uniforms(&params).ok_or_else(|| js_error("invalid Toriyama model parameters"))?;
    // These SDF palettes come from already encoded SVG colours, not sRGB texture samples.
    let gpu = WebGpuCanvas::open(canvas, "shenron toriyama 3d", false).await?;
    let size = uniforms.bytes().len() as u64;
    let pipeline = crate::render::ToriyamaPipeline::new(&gpu.device, gpu.view_format, model, size);
    Ok(ToriyamaModelWasm { gpu, pipeline, uniforms })
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
impl ToriyamaModelWasm {
    /// Draws one frame at `time` seconds with the pointer `tilt`. Returns `false` once the
    /// device is lost: the caller then falls back.
    pub fn frame(&mut self, time: f32, tilt_x: f32, tilt_y: f32) -> bool {
        self.uniforms.set_frame(time, tilt_x, tilt_y);
        let (pipeline, uniforms) = (&self.pipeline, &self.uniforms);
        self.gpu
            .frame(|queue, encoder, view, _| pipeline.draw(queue, encoder, view, uniforms.bytes()))
    }

    /// Reconfigures the surface after the canvas backing size changed.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.gpu.resize(width, height);
    }

    /// Whether the WebGPU device was lost.
    #[wasm_bindgen(js_name = isLost)]
    pub fn is_lost(&self) -> bool {
        self.gpu.is_lost()
    }
}

/// Browser WebGPU renderer of a manga page staged in 3D (`render::manga_scene`).
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
pub struct MangaSceneWasm {
    gpu: WebGpuCanvas,
    pipeline: crate::render::MangaScenePipeline,
    panels: Vec<crate::render::PanelRect>,
}

/// Segments the page (`rgba`, `width × height`, an authorised scan, full resolution) into panels,
/// box-filters its texture to `texture_side` pixels and opens its 3D scene on `canvas`. Without
/// WebGPU it rejects and the caller keeps the flat page.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = createMangaScene)]
pub async fn create_manga_scene(
    canvas: web_sys::HtmlCanvasElement,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    texture_side: u32,
) -> Result<MangaSceneWasm, JsValue> {
    if width == 0 || height == 0 || rgba.len() != (width * height * 4) as usize {
        return Err(js_error("page pixels do not match width × height × 4"));
    }
    let panels = crate::render::segment_panels(
        &rgba,
        width as usize,
        height as usize,
        &crate::render::SegmentOptions::default(),
    );
    let (texture, tw, th) =
        crate::render::manga_scene::downsample(&rgba, width, height, texture_side);
    drop(rgba);
    let gpu = WebGpuCanvas::open(canvas, "shenron manga scene", true).await?;
    let pipeline = crate::render::MangaScenePipeline::new(
        &gpu.device,
        &gpu.queue,
        gpu.view_format,
        &texture,
        tw,
        th,
        &panels,
    );
    Ok(MangaSceneWasm { gpu, pipeline, panels })
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
impl MangaSceneWasm {
    /// Draws one frame at `time` seconds with the pointer `tilt`; `false` once the device is lost.
    pub fn frame(&mut self, time: f32, tilt_x: f32, tilt_y: f32) -> bool {
        let pipeline = &self.pipeline;
        self.gpu.frame(|queue, encoder, view, aspect| {
            pipeline.draw(queue, encoder, view, aspect, time, (tilt_x, tilt_y));
        })
    }

    /// Reconfigures the surface after the canvas backing size changed.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.gpu.resize(width, height);
    }

    /// Detected panels, flat `x, y, w, h` in page uv, in reading order.
    pub fn panels(&self) -> Vec<f32> {
        self.panels.iter().flat_map(|p| [p.x, p.y, p.w, p.h]).collect()
    }

    /// Whether the WebGPU device was lost.
    #[wasm_bindgen(js_name = isLost)]
    pub fn is_lost(&self) -> bool {
        self.gpu.is_lost()
    }
}

/// A real indexed, textured GLB mesh rendered through the shared cel-shading pipeline.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
pub struct GlbModelWasm {
    gpu: WebGpuCanvas,
    pipeline: crate::render::ModelServePipeline,
    model: crate::render::GpuCharacterModel,
    camera: crate::render::TurntableCamera,
    depth: wgpu::TextureView,
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn glb_depth(gpu: &WebGpuCanvas) -> wgpu::TextureView {
    gpu.device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("GLB depth"),
            size: wgpu::Extent3d {
                width: gpu.config.width,
                height: gpu.config.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
        .create_view(&wgpu::TextureViewDescriptor::default())
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = createGlbModel)]
pub async fn create_glb_model(
    canvas: web_sys::HtmlCanvasElement,
    bytes: Vec<u8>,
) -> Result<GlbModelWasm, JsValue> {
    use shenron_re::formats::{
        AssembledCharacterModel, EmbRgbaTexture, ModelPrimitive, TexturePixelFormat,
    };
    if bytes.len() > 64 * 1024 * 1024 {
        return Err(js_error("GLB exceeds 64 MiB"));
    }
    let parsed = crate::render::parse_glb(&bytes).map_err(js_error)?;
    if parsed.primitives.is_empty() {
        return Err(js_error("GLB contains no drawable primitives"));
    }
    let (center, radius) = parsed.bounds();
    let assembled = AssembledCharacterModel {
        name: "cpk-model".into(),
        skeleton: None,
        primitives: parsed
            .primitives
            .into_iter()
            .map(|p| ModelPrimitive {
                name: String::new(),
                material_name: String::new(),
                positions: p.positions,
                normals: p.normals,
                uv: p.uv,
                indices: p.indices,
                texture_index: p.texture,
                sampler: None,
            })
            .collect(),
        textures: parsed
            .textures
            .into_iter()
            .map(|t| EmbRgbaTexture {
                width: t.width,
                height: t.height,
                rgba: t.rgba,
                format: TexturePixelFormat::Rgba8,
            })
            .collect(),
    };
    open_assembled_model(canvas, &assembled, center, radius, &[]).await
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
async fn open_assembled_model(
    canvas: web_sys::HtmlCanvasElement,
    assembled: &shenron_re::formats::AssembledCharacterModel,
    center: [f32; 3],
    radius: f32,
    placements: &[Vec<[f32; 16]>],
) -> Result<GlbModelWasm, JsValue> {
    let gpu = WebGpuCanvas::open(canvas, "shenron CPK scene", true).await?;
    assembled_model_on_gpu(gpu, assembled, center, radius, placements)
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn assembled_model_on_gpu(
    gpu: WebGpuCanvas,
    assembled: &shenron_re::formats::AssembledCharacterModel,
    center: [f32; 3],
    radius: f32,
    placements: &[Vec<[f32; 16]>],
) -> Result<GlbModelWasm, JsValue> {
    crate::render::GpuCharacterModel::validate_for_upload(assembled, &gpu.device.limits())
        .map_err(js_error)?;
    crate::render::GpuCharacterModel::validate_instances(
        placements,
        assembled.primitives.len(),
        &gpu.device.limits(),
    )
    .map_err(js_error)?;
    let pipeline = crate::render::ModelServePipeline::new(&gpu.device, gpu.view_format);
    let model = crate::render::GpuCharacterModel::upload_instanced(
        &gpu.device,
        &gpu.queue,
        assembled,
        &pipeline.material_bind_group_layout,
        placements,
    );
    let camera = crate::render::TurntableCamera {
        target: glam::Vec3::from_array(center),
        distance: radius * 3.0,
        z_near: (radius / 100.0).max(0.001),
        z_far: radius * 100.0,
        ..Default::default()
    };
    let depth = glb_depth(&gpu);
    Ok(GlbModelWasm { gpu, pipeline, model, camera, depth })
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
fn append_world_model(
    world: &mut shenron_re::formats::AssembledCharacterModel,
    mut part: shenron_re::formats::AssembledCharacterModel,
    shared_bank: Option<(usize, usize)>,
) -> Result<(), &'static str> {
    let (offset, count) = shared_bank.unwrap_or((world.textures.len(), part.textures.len()));
    if shared_bank.is_some()
        && (!part.textures.is_empty()
            || offset.checked_add(count).is_none_or(|end| end > world.textures.len()))
    {
        return Err("Shared stage texture bank is invalid");
    }
    for primitive in &mut part.primitives {
        if let Some(index) = primitive.texture_index {
            if index >= count {
                return Err("Stage primitive references a missing texture");
            }
            primitive.texture_index = Some(index + offset);
        }
    }
    world.primitives.extend(part.primitives);
    world.textures.extend(part.textures);
    Ok(())
}

#[cfg(test)]
fn world_bounds(
    world: &shenron_re::formats::AssembledCharacterModel,
) -> Result<[f32; 6], &'static str> {
    world_bounds_with_instances(world, &[])
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
fn world_bounds_with_instances(
    world: &shenron_re::formats::AssembledCharacterModel,
    placements: &[Vec<[f32; 16]>],
) -> Result<[f32; 6], &'static str> {
    if !placements.is_empty() && placements.len() != world.primitives.len() {
        return Err("World placement count differs from primitive count");
    }
    let mut bounds = [
        f32::INFINITY,
        f32::INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
    ];
    let mut drawn = false;
    for (primitive_index, primitive) in world.primitives.iter().enumerate() {
        if primitive.indices.is_empty() {
            continue;
        }
        if primitive.indices.iter().any(|&index| index as usize >= primitive.positions.len()) {
            return Err("Stage primitive index exceeds its vertex buffer");
        }
        if primitive.positions.len() != primitive.normals.len()
            || primitive.positions.len() != primitive.uv.len()
        {
            return Err("Stage vertex attributes have different lengths");
        }
        let identity = [glam::Mat4::IDENTITY.to_cols_array()];
        for matrix in placements.get(primitive_index).map_or(identity.as_slice(), Vec::as_slice) {
            crate::render::model_serve::ModelInstance::from_columns(*matrix)?;
            let matrix = glam::Mat4::from_cols_array(matrix);
            for original in &primitive.positions {
                let position =
                    matrix.transform_point3(glam::Vec3::from_array(*original)).to_array();
                for axis in 0..3 {
                    if !position[axis].is_finite() {
                        return Err("Stage position is not finite");
                    }
                    bounds[axis] = bounds[axis].min(position[axis]);
                    bounds[axis + 3] = bounds[axis + 3].max(position[axis]);
                }
                drawn = true;
            }
        }
    }
    if !drawn {
        return Err("Stage has no drawable geometry");
    }
    Ok(bounds)
}

/// An original DBXV2 stage, uploaded without recentering individual NSK pieces.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
pub struct Xv2WorldWasm {
    scene: GlbModelWasm,
    bounds: [f32; 6],
    actor: Option<crate::world_actor::WorldActor>,
    actor_pipeline: Option<crate::render::skinned::Xv2ToonPipeline>,
    actor_input: crate::world_actor::ActorInput,
    previous_time: Option<f32>,
    texture_profile: serde_json::Value,
    frame_metrics: WorldFrameMetrics,
    frame_clock: Option<(JsValue, js_sys::Function)>,
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorldFrameMetrics {
    frame_calls: u64,
    actor_updates: u64,
    last_frame_submitted: bool,
    last_frame_accepted: bool,
    frame_cpu_ms: Option<f64>,
    actor_step_cpu_ms: Option<f64>,
    actor_skin_upload_cpu_ms: Option<f64>,
    render_submit_cpu_ms: Option<f64>,
    input_interval_ms: Option<f64>,
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
fn measured_elapsed(start: Option<f64>, end: Option<f64>) -> Option<f64> {
    let elapsed = end? - start?;
    (elapsed.is_finite() && elapsed >= 0.0).then_some(elapsed)
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn browser_frame_clock() -> Option<(JsValue, js_sys::Function)> {
    let object = js_sys::Reflect::get(&js_sys::global(), &"performance".into()).ok()?;
    let function = js_sys::Reflect::get(&object, &"now".into()).ok()?.dyn_into().ok()?;
    Some((object, function))
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
const WORLD_MAX_PARTS: u32 = 512;
#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
const WORLD_SOURCE_BUDGET_BYTES: usize = 512 * 1024 * 1024;
#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
const WORLD_TEXTURE_BUDGET_BYTES: u64 = 512 * 1024 * 1024;

/// Select only authored DDS levels. Prefer the largest next memory saving, breaking
/// ties by original bank/texture order; textures without smaller levels stay intact.
#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
fn plan_texture_mips(
    available: &[Vec<(u32, u32)>],
    budget: u64,
    max_dimension: u32,
) -> Result<Vec<usize>, &'static str> {
    let bytes = |(width, height): (u32, u32)| -> Result<u64, &'static str> {
        if width == 0 || height == 0 {
            return Err("DDS mip has zero dimensions");
        }
        (width as u64)
            .checked_mul(height as u64)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or("DDS mip byte count overflows")
    };
    let mut levels = Vec::with_capacity(available.len());
    let mut total = 0u64;
    for chain in available {
        let level = chain
            .iter()
            .position(|&(w, h)| w <= max_dimension && h <= max_dimension)
            .ok_or("Original DDS mip chain cannot fit device dimensions")?;
        total = total.checked_add(bytes(chain[level])?).ok_or("DDS texture budget overflows")?;
        levels.push(level);
    }
    while total > budget {
        let mut best = None;
        let mut best_saving = 0;
        for (index, chain) in available.iter().enumerate() {
            let level = levels[index];
            if let Some(&next) = chain.get(level + 1) {
                let saving = bytes(chain[level])?
                    .checked_sub(bytes(next)?)
                    .ok_or("DDS mip dimensions increase")?;
                if saving > best_saving {
                    best = Some(index);
                    best_saving = saving;
                }
            }
        }
        let index = best.ok_or("Original DDS mip chains cannot fit the decoded texture budget")?;
        levels[index] += 1;
        total -= best_saving;
    }
    Ok(levels)
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn world_part_bytes(object: &JsValue, key: &str) -> Result<Option<Vec<u8>>, JsValue> {
    let value = js_sys::Reflect::get(object, &JsValue::from_str(key))?;
    if value.is_undefined() || value.is_null() {
        return Ok(None);
    }
    let bytes = value
        .dyn_into::<js_sys::Uint8Array>()
        .map_err(|_| js_error(format!("{key} must be Uint8Array")))?;
    if bytes.length() > 64 * 1024 * 1024 {
        return Err(js_error(format!("{key} exceeds 64 MiB")));
    }
    Ok(Some(bytes.to_vec()))
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn world_part_instances(object: &JsValue) -> Result<Vec<[f32; 16]>, JsValue> {
    let value = js_sys::Reflect::get(object, &"instances".into())?;
    if value.is_undefined() || value.is_null() {
        return Ok(vec![glam::Mat4::IDENTITY.to_cols_array()]);
    }
    let array = value.dyn_into::<js_sys::Array>().map_err(|_| {
        js_error("instances must be an array of column-major Float32Array mat4 values")
    })?;
    if array.length() == 0 || array.length() > 4096 {
        return Err(js_error("Stage part must contain 1 to 4096 instances"));
    }
    array
        .iter()
        .map(|value| {
            let matrix = value
                .dyn_into::<js_sys::Float32Array>()
                .map_err(|_| js_error("instance must be a Float32Array"))?;
            if matrix.length() != 16 {
                return Err(js_error("instance matrix must contain 16 column-major floats"));
            }
            let matrix: [f32; 16] =
                matrix.to_vec().try_into().map_err(|_| js_error("invalid instance matrix"))?;
            crate::render::model_serve::ModelInstance::from_columns(matrix).map_err(js_error)?;
            Ok(matrix)
        })
        .collect()
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = createXv2World)]
pub async fn create_xv2_world(
    canvas: web_sys::HtmlCanvasElement,
    parts: js_sys::Array,
) -> Result<Xv2WorldWasm, JsValue> {
    use shenron_re::formats::nsk::NskFile;
    use shenron_re::formats::{AssembledCharacterModel, EmbFile, EmmFile};
    if parts.length() == 0 || parts.length() > WORLD_MAX_PARTS {
        return Err(js_error("Stage must contain 1 to 512 original pieces"));
    }
    let mut assembled = AssembledCharacterModel {
        name: "cpk-stage".into(),
        primitives: Vec::new(),
        textures: Vec::new(),
        skeleton: None,
    };
    let mut total = 0usize;
    let mut banks = Vec::new();
    let mut texture_count = 0usize;
    let mut pending_models = Vec::new();
    // The loader shares a Uint8Array for an EMB used by several NSK files. Retain its
    // JS identity so that it is copied, parsed, decoded and uploaded only once.
    let mut texture_banks: Vec<(JsValue, usize, usize)> = Vec::new();
    let mut placements = Vec::new();
    let mut instance_count = 0usize;
    for (index, part) in parts.iter().enumerate() {
        let instances = world_part_instances(&part)?;
        instance_count = instance_count
            .checked_add(instances.len())
            .ok_or_else(|| js_error("Stage instance count overflow"))?;
        if instance_count > 16384 {
            return Err(js_error("Stage exceeds 16384 original instances"));
        }
        let nsk = world_part_bytes(&part, "nsk")?.ok_or_else(|| js_error("nsk is missing"))?;
        let emm = world_part_bytes(&part, "emm")?;
        total += nsk.len() + emm.as_ref().map_or(0, Vec::len);
        if total > WORLD_SOURCE_BUDGET_BYTES {
            return Err(js_error("Stage input exceeds 512 MiB"));
        }
        let nsk = NskFile::parse(&nsk).map_err(js_error)?;
        let _materials = emm.as_deref().map(EmmFile::parse).transpose().map_err(js_error)?;
        let source = js_sys::Reflect::get(&part, &JsValue::from_str("emb"))?;
        let (offset, count) = if source.is_undefined() || source.is_null() {
            (0, 0)
        } else if let Some((_, offset, count)) =
            texture_banks.iter().find(|(value, _, _)| js_sys::Object::is(value, &source))
        {
            (*offset, *count)
        } else {
            let bytes =
                world_part_bytes(&part, "emb")?.ok_or_else(|| js_error("emb is missing"))?;
            total += bytes.len();
            if total > WORLD_SOURCE_BUDGET_BYTES {
                return Err(js_error("Stage input exceeds 512 MiB"));
            }
            let bank = EmbFile::parse(&bytes).map_err(js_error)?;
            let offset = texture_count;
            let count = bank.textures.len();
            texture_count = texture_count
                .checked_add(count)
                .ok_or_else(|| js_error("Stage texture count overflows"))?;
            if texture_count > 16384 {
                return Err(js_error("Stage exceeds 16384 original textures"));
            }
            banks.push(bank);
            texture_banks.push((source, offset, count));
            (offset, count)
        };
        let model = AssembledCharacterModel {
            name: format!("stage-{index}"),
            primitives: AssembledCharacterModel::assemble_nsk_primitives(
                &nsk.model,
                &nsk.skeleton,
                count,
            )
            .map_err(js_error)?,
            textures: Vec::new(),
            skeleton: None,
        };
        placements.extend(std::iter::repeat_n(instances, model.primitives.len()));
        pending_models.push((model, offset, count));
    }
    // Negotiate once, before any decoding, so the planner uses the actual device limits.
    let gpu = WebGpuCanvas::open(canvas, "shenron CPK world", true).await?;
    let budget = WORLD_TEXTURE_BUDGET_BYTES;
    let mut available = Vec::new();
    let mut sources = Vec::new();
    for (bank_index, bank) in banks.iter().enumerate() {
        for (texture_index, texture) in bank.textures.iter().enumerate() {
            if texture.mipmap_count == 0 || texture.mipmap_count > 32 {
                return Err(js_error("DDS mip count must be between 1 and 32"));
            }
            let chain = (0..texture.mipmap_count as usize)
                .map(|level| bank.mip_dimensions(texture_index, level))
                .collect::<Result<Vec<_>, _>>()
                .map_err(js_error)?;
            available.push(chain);
            sources.push((bank_index, texture_index));
        }
    }
    let levels =
        plan_texture_mips(&available, budget, gpu.device.limits().max_texture_dimension_2d)
            .map_err(js_error)?;
    let mut original_bytes = 0u64;
    let mut decoded_bytes = 0u64;
    let mut choices = Vec::new();
    for (index, &(bank, texture)) in sources.iter().enumerate() {
        let level = levels[index];
        let (width, height) = available[index][level];
        original_bytes += available[index][0].0 as u64 * available[index][0].1 as u64 * 4;
        decoded_bytes += width as u64 * height as u64 * 4;
        // Decode the selected authored level once; never omit or reorder a sampler index.
        assembled.textures.push(banks[bank].decode_rgba_mip(texture, level).map_err(js_error)?);
        choices.push(serde_json::json!({"bank":bank,"texture":texture,"mip":level,"width":width,"height":height}));
    }
    let texture_profile = serde_json::json!({"budgetBytes":budget,"originalBytes":original_bytes,"decodedBytes":decoded_bytes,"textureCount":sources.len(),"reducedTextureCount":levels.iter().filter(|&&level| level>0).count(),"choices":choices});
    drop(banks);
    for (model, offset, count) in pending_models {
        append_world_model(&mut assembled, model, Some((offset, count))).map_err(js_error)?;
    }
    let bounds = world_bounds_with_instances(&assembled, &placements).map_err(js_error)?;
    let center = std::array::from_fn(|axis| (bounds[axis] + bounds[axis + 3]) * 0.5);
    let radius =
        glam::Vec3::new(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2])
            .length()
            .max(1.0)
            * 0.5;
    let scene = assembled_model_on_gpu(gpu, &assembled, center, radius, &placements)?;
    Ok(Xv2WorldWasm {
        scene,
        bounds,
        actor: None,
        actor_pipeline: None,
        actor_input: crate::world_actor::ActorInput::default(),
        previous_time: None,
        texture_profile,
        frame_metrics: WorldFrameMetrics::default(),
        frame_clock: browser_frame_clock(),
    })
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
impl Xv2WorldWasm {
    fn clock_now(&self) -> Option<f64> {
        let (object, function) = self.frame_clock.as_ref()?;
        function.call0(object).ok()?.as_f64().filter(|value| value.is_finite())
    }
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
impl Xv2WorldWasm {
    /// CPU durations and submitted work only; no GPU completion or display-rate claim.
    #[wasm_bindgen(js_name = frameStats)]
    pub fn frame_stats(&self) -> Result<JsValue, JsValue> {
        let mut info = serde_json::to_value(&self.frame_metrics).map_err(js_error)?;
        info["presentRequests"] = self.scene.gpu.present_requests.into();
        info["gpuTimeMs"] = serde_json::Value::Null;
        info["gpuTimingAvailable"] = false.into();
        info["surfaceFormat"] = format!("{:?}", self.scene.gpu.config.format).into();
        info["viewFormat"] = format!("{:?}", self.scene.gpu.view_format).into();
        info["staticDrawCalls"] = self.scene.model.primitives.len().into();
        info["staticInstanceDraws"] = self
            .scene
            .model
            .primitives
            .iter()
            .map(|primitive| primitive.instance_count as u64)
            .sum::<u64>()
            .into();
        info["staticTriangles"] = self
            .scene
            .model
            .primitives
            .iter()
            .map(|primitive| primitive.index_count as u64 / 3 * primitive.instance_count as u64)
            .sum::<u64>()
            .into();
        let mut actor_parts = 0u64;
        let mut actor_vertices = 0u64;
        if let Some(actor) = &self.actor {
            for part in
                actor.fighter().character.parts.iter().filter(|part| !part.indices.is_empty())
            {
                actor_parts += 1;
                actor_vertices += part.positions.len() as u64;
            }
        }
        info["actorDrawCalls"] = actor_parts.into();
        info["actorVertices"] = actor_vertices.into();
        info["actorUploadBytesPerUpdate"] =
            (actor_vertices * std::mem::size_of::<crate::render::ModelVertex>() as u64).into();
        serde::Serialize::serialize(&info, &serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(js_error)
    }

    #[wasm_bindgen(js_name = textureProfile)]
    pub fn texture_profile(&self) -> Result<JsValue, JsValue> {
        serde::Serialize::serialize(
            &self.texture_profile,
            &serde_wasm_bindgen::Serializer::json_compatible(),
        )
        .map_err(js_error)
    }
    /// Bounds in the stage's original coordinate system, min then max.
    pub fn bounds(&self) -> Vec<f32> {
        self.bounds.to_vec()
    }

    /// A free camera, not an orbit around an auto-normalized model.
    pub fn camera(&mut self, x: f32, y: f32, z: f32, yaw: f32, pitch: f32) {
        if ![x, y, z, yaw, pitch].iter().all(|value| value.is_finite()) {
            return;
        }
        let pitch = pitch.clamp(-1.5, 1.5);
        let direction =
            glam::Vec3::new(yaw.sin() * pitch.cos(), pitch.sin(), -yaw.cos() * pitch.cos());
        self.scene.camera.target = glam::Vec3::new(x, y, z) + direction;
        self.scene.camera.distance = 1.0;
        self.scene.camera.azimuth = (-direction.x).atan2(-direction.z);
        self.scene.camera.elevation = -pitch;
        self.scene.camera.z_near = 0.05;
        self.scene.camera.fov_y = 60.0f32.to_radians();
    }

    #[wasm_bindgen(js_name = setActor)]
    pub fn set_actor(
        &mut self,
        files: JsValue,
        idle_name: String,
        walk_name: Option<String>,
        speed: f32,
    ) -> Result<(), JsValue> {
        let fighter = crate::wasm_xv2::duel_fighter(&files)?;
        let bindings = crate::world_actor::MotionBindings::from_names(
            &fighter.ean,
            &idle_name,
            walk_name.as_deref(),
        )
        .map_err(js_error)?;
        let pipeline = self.actor_pipeline.get_or_insert_with(|| {
            crate::render::skinned::Xv2ToonPipeline::new(
                &self.scene.gpu.device,
                self.scene.gpu.view_format,
            )
        });
        let mut actor = crate::world_actor::WorldActor::new(
            fighter,
            bindings,
            speed,
            &self.scene.gpu.device,
            &self.scene.gpu.queue,
            pipeline,
        )
        .map_err(js_error)?;
        actor.update_gpu(&self.scene.gpu.queue);
        self.actor = Some(actor);
        self.actor_input = crate::world_actor::ActorInput::default();
        self.previous_time = None;
        Ok(())
    }

    #[wasm_bindgen(js_name = actorPlace)]
    pub fn actor_place(&mut self, x: f32, y: f32, z: f32, yaw: f32) -> bool {
        self.actor.as_mut().is_some_and(|actor| actor.place(glam::Vec3::new(x, y, z), yaw))
    }

    #[wasm_bindgen(js_name = actorInput)]
    pub fn actor_input(&mut self, forward: f32, strafe: f32, yaw: f32) -> bool {
        if self.actor.is_none() || ![forward, strafe, yaw].iter().all(|value| value.is_finite()) {
            return false;
        }
        self.actor_input = crate::world_actor::ActorInput { forward, strafe, yaw };
        true
    }

    #[wasm_bindgen(js_name = actorPosition)]
    pub fn actor_position(&self) -> Vec<f32> {
        self.actor.as_ref().map_or_else(Vec::new, |actor| actor.position().to_array().to_vec())
    }

    #[wasm_bindgen(js_name = actorActions)]
    pub fn actor_actions(&self) -> Vec<u32> {
        self.actor.as_ref().map_or_else(Vec::new, |actor| actor.fighter().playable_actions())
    }

    #[wasm_bindgen(js_name = actorAttack)]
    pub fn actor_attack(&mut self, id: u32) -> bool {
        self.actor.as_mut().is_some_and(|actor| actor.attack(id))
    }

    #[wasm_bindgen(js_name = actorCanWalk)]
    pub fn actor_can_walk(&self) -> bool {
        self.actor.as_ref().is_some_and(crate::world_actor::WorldActor::can_walk)
    }

    #[wasm_bindgen(js_name = clearActor)]
    pub fn clear_actor(&mut self) {
        self.actor = None;
        self.actor_input = crate::world_actor::ActorInput::default();
        self.previous_time = None;
    }

    pub fn frame(&mut self, time: f32) -> bool {
        let frame_start = self.clock_now();
        self.frame_metrics.frame_calls = self.frame_metrics.frame_calls.saturating_add(1);
        self.frame_metrics.actor_step_cpu_ms = None;
        self.frame_metrics.actor_skin_upload_cpu_ms = None;
        self.frame_metrics.input_interval_ms = if time.is_finite() {
            self.previous_time
                .map(|previous| (time as f64 - previous as f64) * 1000.0)
                .filter(|value| value.is_finite() && *value >= 0.0)
        } else {
            None
        };
        if time.is_finite() {
            let seconds =
                self.previous_time.map_or(0.0, |previous| (time - previous).clamp(0.0, 0.05));
            self.previous_time = Some(time);
            if self.actor.is_some() {
                let step_start = self.clock_now();
                let actor = self.actor.as_mut().expect("actor presence checked");
                actor.step(self.actor_input, seconds);
                let step_end = self.clock_now();
                let actor = self.actor.as_mut().expect("actor presence checked");
                actor.update_gpu(&self.scene.gpu.queue);
                self.frame_metrics.actor_updates =
                    self.frame_metrics.actor_updates.saturating_add(1);
                let upload_end = self.clock_now();
                self.frame_metrics.actor_step_cpu_ms = measured_elapsed(step_start, step_end);
                self.frame_metrics.actor_skin_upload_cpu_ms =
                    measured_elapsed(step_end, upload_end);
            }
        }
        let before = self.scene.gpu.present_requests;
        let render_start = self.clock_now();
        let accepted =
            self.scene.frame_with_actor(self.actor.as_ref(), self.actor_pipeline.as_ref());
        let frame_end = self.clock_now();
        self.frame_metrics.render_submit_cpu_ms = measured_elapsed(render_start, frame_end);
        self.frame_metrics.frame_cpu_ms = measured_elapsed(frame_start, frame_end);
        self.frame_metrics.last_frame_submitted = self.scene.gpu.present_requests != before;
        self.frame_metrics.last_frame_accepted = accepted;
        accepted
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.scene.resize(width, height);
    }
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen]
impl GlbModelWasm {
    /// Explicit camera controls: azimuth/elevation in radians and a bounded zoom factor.
    pub fn camera(&mut self, azimuth: f32, elevation: f32, zoom: f32) {
        if azimuth.is_finite() && elevation.is_finite() && zoom.is_finite() {
            self.camera.azimuth = azimuth;
            self.camera.elevation = elevation.clamp(-1.4, 1.4);
            self.camera.fov_y = (45.0 / zoom.clamp(0.5, 3.0)).to_radians();
        }
    }
    pub fn frame(&mut self, _time: f32, _tilt_x: f32, _tilt_y: f32) -> bool {
        self.frame_with_actor(None, None)
    }
    pub fn resize(&mut self, width: u32, height: u32) {
        self.gpu.resize(width, height);
        self.depth = glb_depth(&self.gpu);
    }
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
impl GlbModelWasm {
    fn frame_with_actor(
        &mut self,
        actor: Option<&crate::world_actor::WorldActor>,
        actor_pipeline: Option<&crate::render::skinned::Xv2ToonPipeline>,
    ) -> bool {
        let (pipeline, model, camera, depth) =
            (&self.pipeline, &self.model, &mut self.camera, &self.depth);
        self.gpu.frame(|queue, encoder, view, aspect| {
            camera.aspect_ratio = aspect;
            pipeline.update_camera(queue, camera, glam::Mat4::IDENTITY);
            if let Some(pipeline) = actor_pipeline {
                pipeline.update_camera(queue, camera);
            }
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("CPK model scene"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.025,
                            g: 0.035,
                            b: 0.06,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&pipeline.pipeline);
            pass.set_bind_group(0, &pipeline.uniform_bind_group, &[]);
            for primitive in &model.primitives {
                if let Some(material) = &primitive.bind_group {
                    pass.set_bind_group(1, material, &[]);
                }
                pass.set_vertex_buffer(0, primitive.vertex_buffer.slice(..));
                pass.set_vertex_buffer(1, primitive.instance_buffer.slice(..));
                pass.set_index_buffer(primitive.index_buffer.slice(..), primitive.index_format);
                pass.draw_indexed(0..primitive.index_count, 0, 0..primitive.instance_count);
            }
            if let (Some(actor), Some(pipeline)) = (actor, actor_pipeline) {
                pass.set_pipeline(&pipeline.pipeline);
                pass.set_bind_group(0, &pipeline.uniform_bind_group, &[]);
                actor.draw(&mut pass);
            }
        })
    }
}

#[cfg(any(test, all(feature = "wasm", target_arch = "wasm32")))]
fn stage_layout_info(
    layout: &shenron_re::formats::fmp::FmpFile,
    lod_index: usize,
) -> Result<serde_json::Value, &'static str> {
    use shenron_re::formats::fmp::fmp_matrix_column_major;
    let mut instances = Vec::new();
    let mut spawns = Vec::new();
    for object in &layout.objects {
        let object_matrix = glam::Mat4::from_cols_array(&fmp_matrix_column_major(&object.matrix));
        if object.entities.is_empty() {
            spawns.push(
                serde_json::json!({"name":object.name,"matrix":object_matrix.to_cols_array()}),
            );
        }
        for entity in &object.entities {
            if !entity.lods.iter().any(|lod| lod.nsk.is_some()) {
                continue;
            }
            let lod = entity
                .lods
                .get(lod_index)
                .ok_or("Requested LOD is absent from a visual FMP entity")?;
            let nsk = lod.nsk.ok_or("Requested LOD has no NSK geometry")?;
            let entity_matrix =
                glam::Mat4::from_cols_array(&fmp_matrix_column_major(&entity.matrix));
            let matrix = (object_matrix * entity_matrix).to_cols_array();
            crate::render::model_serve::ModelInstance::from_columns(matrix)?;
            if instances.len() >= 16384 {
                return Err("FMP exceeds 16384 original instances");
            }
            // Omit absent references instead of serializing null into the JS optional contract.
            let mut instance = serde_json::json!({"nsk":nsk,"matrix":matrix});
            if let Some(emb) = entity.emb {
                instance["emb"] = serde_json::json!(emb);
            }
            if let Some(emm) = lod.emm {
                instance["emm"] = serde_json::json!(emm);
            }
            instances.push(instance);
        }
    }
    Ok(
        serde_json::json!({"resources": &layout.resources, "instances":instances,"spawns":spawns,"lodIndex":lod_index}),
    )
}

/// Parse and compose original FMP layout placements without allocating a GPU.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = inspectXv2StageLayout)]
pub fn inspect_xv2_stage_layout(
    bytes: js_sys::Uint8Array,
    lod_index: Option<u32>,
) -> Result<JsValue, JsValue> {
    if bytes.length() > 64 * 1024 * 1024 {
        return Err(js_error("FMP input exceeds 64 MiB"));
    }
    let layout = shenron_re::formats::fmp::FmpFile::parse(&bytes.to_vec()).map_err(js_error)?;
    let info = stage_layout_info(&layout, lod_index.unwrap_or(0) as usize).map_err(js_error)?;
    serde::Serialize::serialize(&info, &serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(js_error)
}

/// Inspect original animation names without creating GPU resources.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[wasm_bindgen(js_name = inspectXv2Animations)]
pub fn inspect_xv2_animations(bytes: js_sys::Uint8Array) -> Result<JsValue, JsValue> {
    if bytes.length() > 64 * 1024 * 1024 {
        return Err(js_error("EAN input exceeds 64 MiB"));
    }
    let ean = shenron_re::formats::EanFile::parse(&bytes.to_vec()).map_err(js_error)?;
    let result = js_sys::Array::new();
    for (index, animation) in ean.animations.iter().enumerate() {
        let entry = js_sys::Object::new();
        js_sys::Reflect::set(&entry, &"index".into(), &JsValue::from_f64(index as f64))?;
        js_sys::Reflect::set(&entry, &"name".into(), &JsValue::from_str(&animation.name))?;
        js_sys::Reflect::set(&entry, &"frameCount".into(), &JsValue::from(animation.frame_count))?;
        result.push(&entry);
    }
    Ok(result.into())
}

#[cfg(test)]
mod world_tests {
    use super::{append_world_model, world_bounds};
    use shenron_re::formats::{
        AssembledCharacterModel, EmbRgbaTexture, ModelPrimitive, TexturePixelFormat,
    };

    #[test]
    fn frame_telemetry_keeps_unavailable_and_invalid_clock_samples_absent() {
        assert_eq!(super::measured_elapsed(Some(10.0), Some(10.25)), Some(0.25));
        assert_eq!(super::measured_elapsed(None, Some(10.0)), None);
        assert_eq!(super::measured_elapsed(Some(10.0), Some(9.0)), None);
        assert_eq!(super::measured_elapsed(Some(f64::NAN), Some(10.0)), None);
        let info = serde_json::to_value(super::WorldFrameMetrics::default()).unwrap();
        assert_eq!(info["frameCalls"], 0);
        assert_eq!(info["lastFrameSubmitted"], false);
        assert!(info["frameCpuMs"].is_null());
        assert!(info["actorSkinUploadCpuMs"].is_null());
    }

    #[test]
    fn authored_texture_mips_fit_budget_without_dropping_nonmipped_textures() {
        let available = vec![vec![(8, 8), (4, 4), (2, 2)], vec![(4, 4)], vec![(8, 8), (4, 4)]];
        assert_eq!(super::plan_texture_mips(&available, 384, 8192).unwrap(), vec![1, 0, 0]);
        assert_eq!(super::plan_texture_mips(&available, 320, 8192).unwrap(), vec![1, 0, 1]);
        assert_eq!(super::plan_texture_mips(&available, 1024, 4).unwrap(), vec![1, 0, 1]);
        assert!(super::plan_texture_mips(&available, 63, 8192).is_err());
        assert!(super::plan_texture_mips(&available, 1024, 2).is_err());
        assert!(super::plan_texture_mips(&[vec![(4, 4), (8, 8)]], 1, 8192).is_err());
        assert!(super::plan_texture_mips(&[vec![(0, 4)]], 1024, 8192).is_err());
        assert_eq!(super::plan_texture_mips(&[], 256, 8192).unwrap(), Vec::<usize>::new());
    }

    /// Private DDS-chain report measured on all original BFlbn EMB entries.
    #[test]
    fn real_conton_textures_keep_original_levels_under_the_owner_budget_when_provided() {
        assert_eq!(super::WORLD_MAX_PARTS, 512);
        assert_eq!(super::WORLD_SOURCE_BUDGET_BYTES, 512 * 1024 * 1024);
        assert_eq!(super::WORLD_TEXTURE_BUDGET_BYTES, 512 * 1024 * 1024);
        let Ok(path) = std::env::var("SHENRON_REAL_BFLBN_MIP_REPORT") else { return };
        let report: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let qualification = report
            .get("originalMipQualification")
            .or_else(|| {
                report.get("textureBudget").and_then(|value| value.get("originalMipQualification"))
            })
            .unwrap();
        assert_eq!(qualification["allDeclaredLevelsPresent"], true);
        assert!(qualification["errors"].as_array().unwrap().is_empty());
        let environment = report["geometryCorrection"]["environmentBank"]["path"].as_str().unwrap();
        let available: Vec<Vec<(u32, u32)>> = qualification["selection"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|texture| texture["bank"].as_str().unwrap() != environment)
            .map(|texture| {
                texture["levels"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|level| {
                        (
                            level["width"].as_u64().unwrap().try_into().unwrap(),
                            level["height"].as_u64().unwrap().try_into().unwrap(),
                        )
                    })
                    .collect()
            })
            .collect();
        assert_eq!(available.len(), 523);
        let original_bytes: u64 =
            available.iter().map(|chain| chain[0].0 as u64 * chain[0].1 as u64 * 4).sum();
        assert_eq!(original_bytes, 400_091_776);
        assert!(original_bytes <= super::WORLD_TEXTURE_BUDGET_BYTES);
        let levels =
            super::plan_texture_mips(&available, super::WORLD_TEXTURE_BUDGET_BYTES, 8192).unwrap();
        assert!(
            levels.iter().all(|&level| level == 0),
            "Conton should retain every original DDS top level at 512 MiB"
        );
    }

    #[test]
    fn fmp_layout_composes_original_parent_and_entity_before_instance_rendering() {
        use shenron_re::formats::fmp::{FmpEntity, FmpFile, FmpLod, FmpObject, FmpResources};
        let identity = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];
        let mut parent = identity;
        parent[0] = 0.0;
        parent[1] = 1.0;
        parent[3] = -1.0;
        parent[4] = 0.0;
        parent[9] = 10.0;
        let mut child = identity;
        child[10] = 3.0;
        let mut layout = FmpFile {
            version: 0x20900,
            resources: FmpResources { nsk: vec!["real.nsk".into()], ..Default::default() },
            objects: vec![FmpObject {
                source_offset: 0,
                name: "tree".into(),
                matrix: parent,
                spatial_hierarchy_offset: None,
                entities: vec![FmpEntity {
                    source_offset: 0,
                    name: None,
                    matrix: child,
                    emb: None,
                    ema: None,
                    lods: vec![FmpLod { nsk: Some(0), emm: None, distance: 0.0 }],
                }],
            }],
        };
        let info = super::stage_layout_info(&layout, 0).unwrap();
        assert_eq!(info["instances"][0]["matrix"][12], 7.0);
        assert_eq!(info["instances"][0]["matrix"][13], 0.0);
        assert!(info["instances"][0].get("emb").is_none());
        assert!(super::stage_layout_info(&layout, 1).is_err());
        layout.objects[0].entities.clear();
        let spawn = super::stage_layout_info(&layout, 0).unwrap();
        assert_eq!(spawn["spawns"][0]["matrix"][12], 10.0);
        assert_eq!(spawn["instances"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn world_instance_bounds_use_original_layout_placements() {
        let world = triangle(-25.0);
        let placements = vec![vec![
            glam::Mat4::from_translation(glam::Vec3::new(10.0, 5.0, 20.0)).to_cols_array(),
            glam::Mat4::from_translation(glam::Vec3::new(-10.0, 0.0, 0.0)).to_cols_array(),
        ]];
        let bounds = super::world_bounds_with_instances(&world, &placements).unwrap();
        assert_eq!(bounds[0], -35.0);
        assert_eq!(bounds[3], -14.0);
        assert_eq!(bounds[1], 0.0);
        assert_eq!(bounds[4], 6.0);
        assert_eq!(bounds[5], 20.0);
    }

    #[test]
    fn real_bflbn_layout_exposes_original_instances_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BFLBN_FMP") else { return };
        let layout =
            shenron_re::formats::fmp::FmpFile::parse(&std::fs::read(path).unwrap()).unwrap();
        let visual_records = layout
            .objects
            .iter()
            .flat_map(|object| &object.entities)
            .filter(|entity| !entity.lods.is_empty())
            .count();
        assert_eq!(visual_records, 114);
        // This is an original environment-texture record, not an absent geometry instance.
        let environment = layout.objects.iter().find(|object| object.name == "ENVTEX").unwrap();
        assert_eq!(environment.source_offset, 6804);
        assert_eq!(environment.entities.len(), 1);
        let entity = &environment.entities[0];
        assert_eq!(entity.source_offset, 35068);
        assert_eq!(entity.emb, Some(1));
        assert_eq!(entity.lods.len(), 1);
        assert_eq!(entity.lods[0].nsk, None);
        assert_eq!(entity.lods[0].emm, None);
        let info = super::stage_layout_info(&layout, 0).unwrap();
        assert_eq!(info["resources"]["nsk"].as_array().unwrap().len(), 60);
        assert_eq!(info["instances"].as_array().unwrap().len(), 113);
        assert_eq!(info["resources"]["emb"][1], layout.resources.emb[1]);
        assert!(
            info["instances"].as_array().unwrap().iter().any(|instance| instance["matrix"][12]
                .as_f64()
                .unwrap()
                .abs()
                > 10.0)
        );
    }

    fn triangle(x: f32) -> AssembledCharacterModel {
        AssembledCharacterModel {
            name: "stage-piece".into(),
            skeleton: None,
            primitives: vec![ModelPrimitive {
                name: "mesh".into(),
                material_name: "original-material".into(),
                positions: vec![[x, 0.0, 0.0], [x + 1.0, 0.0, 0.0], [x, 1.0, 0.0]],
                normals: vec![[0.0, 0.0, 1.0]; 3],
                uv: vec![[0.0, 0.0]; 3],
                indices: vec![0, 1, 2],
                texture_index: Some(0),
                sampler: None,
            }],
            textures: vec![EmbRgbaTexture {
                width: 1,
                height: 1,
                rgba: vec![255; 4],
                format: TexturePixelFormat::Rgba8,
            }],
        }
    }

    #[test]
    fn stage_merge_preserves_original_coordinates_and_texture_ownership() {
        let mut world = triangle(-25.0);
        append_world_model(&mut world, triangle(70.0), None).unwrap();
        assert_eq!(world.primitives[0].positions[0], [-25.0, 0.0, 0.0]);
        assert_eq!(world.primitives[1].positions[0], [70.0, 0.0, 0.0]);
        assert_eq!(world.primitives[0].texture_index, Some(0));
        assert_eq!(world.primitives[1].texture_index, Some(1));
        assert_eq!(world_bounds(&world).unwrap(), [-25.0, 0.0, 0.0, 71.0, 1.0, 0.0]);
    }

    #[test]
    fn stage_merge_rejects_missing_texture_without_mutating_world() {
        let mut world = triangle(0.0);
        let mut part = triangle(30.0);
        part.primitives[0].texture_index = Some(1);
        assert!(append_world_model(&mut world, part, None).is_err());
        assert_eq!(world.primitives.len(), 1);
        assert_eq!(world.textures.len(), 1);
    }

    #[test]
    fn stage_parts_share_one_texture_bank_without_copying_its_pixels() {
        let mut world = triangle(0.0);
        let pixels = world.textures[0].rgba.as_ptr();
        for index in 1..4 {
            let mut part = triangle(index as f32 * 20.0);
            part.textures.clear();
            append_world_model(&mut world, part, Some((0, 1))).unwrap();
        }
        assert_eq!(world.primitives.len(), 4);
        assert_eq!(world.textures.len(), 1);
        assert_eq!(world.textures[0].rgba.as_ptr(), pixels);
        assert!(world.primitives.iter().all(|part| part.texture_index == Some(0)));
        assert_eq!(world_bounds(&world).unwrap(), [0.0, 0.0, 0.0, 61.0, 1.0, 0.0]);
    }

    #[test]
    fn stage_shared_bank_must_exist_and_cannot_hide_an_extra_texture() {
        let mut world = triangle(0.0);
        let mut part = triangle(20.0);
        part.textures.clear();
        assert!(append_world_model(&mut world, part, Some((1, 1))).is_err());
        assert!(append_world_model(&mut world, triangle(20.0), Some((0, 1))).is_err());
        assert_eq!(world.primitives.len(), 1);
        assert_eq!(world.textures.len(), 1);
    }

    #[test]
    fn stage_bounds_reject_invalid_geometry() {
        let mut world = triangle(0.0);
        world.primitives[0].positions[0][0] = f32::NAN;
        assert!(world_bounds(&world).is_err());
        world = triangle(0.0);
        world.primitives[0].indices[0] = 3;
        assert!(world_bounds(&world).is_err());
        world = triangle(0.0);
        world.primitives[0].normals.clear();
        assert!(world_bounds(&world).is_err());
        world.primitives.clear();
        assert!(world_bounds(&world).is_err());
    }
}
