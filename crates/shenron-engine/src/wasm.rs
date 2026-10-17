// SPDX-License-Identifier: Apache-2.0

//! WebAssembly bindings for browser WebGPU canvas and JS game loops.

use crate::canvas::{
    BubbleKind, CanvasSurface, ColorRgba, SpeechBubble, TextLayoutConfig, WritingDirection,
};
use crate::game::{
    ArenaId, DragonPixelEngineCore, FighterId, FighterInput, GameMode, WebGpuRenderPacket,
};
use glam::Vec2;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

/// WebAssembly wrapper around the deterministic game simulation core.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct ShenronEngineWasm {
    core: DragonPixelEngineCore,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl ShenronEngineWasm {
    /// Creates a new match between two fighters by string name.
    #[must_use]
    pub fn new(p1_name: &str, p2_name: &str, arena_name: &str, mode_name: &str) -> Self {
        let p1_id = match p1_name.to_lowercase().as_str() {
            "vegeta" => FighterId::Vegeta,
            "gohan" => FighterId::Gohan,
            "piccolo" => FighterId::Piccolo,
            "frieza" => FighterId::Frieza,
            "cell" => FighterId::Cell,
            "majinbuu" | "buu" => FighterId::MajinBuu,
            "trunks" => FighterId::Trunks,
            "yamcha" => FighterId::Yamcha,
            _ => FighterId::Goku,
        };

        let p2_id = match p2_name.to_lowercase().as_str() {
            "goku" => FighterId::Goku,
            "gohan" => FighterId::Gohan,
            "piccolo" => FighterId::Piccolo,
            "frieza" => FighterId::Frieza,
            "cell" => FighterId::Cell,
            "majinbuu" | "buu" => FighterId::MajinBuu,
            "trunks" => FighterId::Trunks,
            "yamcha" => FighterId::Yamcha,
            _ => FighterId::Vegeta,
        };

        let arena = match arena_name.to_lowercase().as_str() {
            "namek" => ArenaId::Namek,
            "cellgames" => ArenaId::CellGames,
            "tournament" => ArenaId::Tournament,
            "kaioshin" => ArenaId::KaioshinRealm,
            "timechamber" => ArenaId::TimeChamber,
            _ => ArenaId::Paozu,
        };

        let mode = match mode_name.to_lowercase().as_str() {
            "story" => GameMode::Story,
            "arcade" => GameMode::Arcade,
            "training" => GameMode::Training,
            _ => GameMode::Versus,
        };

        Self { core: DragonPixelEngineCore::new(p1_id, p2_id, arena, mode) }
    }

    /// Advances the simulation by 1 frame with raw boolean input flags.
    #[allow(clippy::too_many_arguments)]
    pub fn tick_raw(
        &mut self,
        p1_left: bool,
        p1_right: bool,
        p1_up: bool,
        p1_down: bool,
        p1_light: bool,
        p1_heavy: bool,
        p1_special: bool,
        p1_ultimate: bool,
        p1_block: bool,
        p2_left: bool,
        p2_right: bool,
        p2_up: bool,
        p2_down: bool,
        p2_light: bool,
        p2_heavy: bool,
        p2_special: bool,
        p2_ultimate: bool,
        p2_block: bool,
    ) {
        let p1_input = FighterInput {
            left: p1_left,
            right: p1_right,
            up: p1_up,
            down: p1_down,
            light_attack: p1_light,
            heavy_attack: p1_heavy,
            special: p1_special,
            ultimate: p1_ultimate,
            block: p1_block,
            dash: false,
        };

        let p2_input = FighterInput {
            left: p2_left,
            right: p2_right,
            up: p2_up,
            down: p2_down,
            light_attack: p2_light,
            heavy_attack: p2_heavy,
            special: p2_special,
            ultimate: p2_ultimate,
            block: p2_block,
            dash: false,
        };

        self.core.tick(p1_input, p2_input);
    }

    /// Returns the WebGPU render packet serialized as a JSON string.
    #[must_use]
    pub fn get_render_packet_json(&self) -> String {
        let packet = WebGpuRenderPacket::from_core(&self.core);
        serde_json::to_string(&packet).unwrap_or_else(|_| "{}".into())
    }

    /// Returns Player 1's current HP.
    #[must_use]
    pub fn p1_hp(&self) -> f32 {
        self.core.p1.hp
    }

    /// Returns Player 2's current HP.
    #[must_use]
    pub fn p2_hp(&self) -> f32 {
        self.core.p2.hp
    }

    /// Returns Player 1's current Ki.
    #[must_use]
    pub fn p1_ki(&self) -> f32 {
        self.core.p1.ki
    }

    /// Returns Player 2's current Ki.
    #[must_use]
    pub fn p2_ki(&self) -> f32 {
        self.core.p2.ki
    }

    /// Checks if the match has concluded.
    #[must_use]
    pub fn is_match_over(&self) -> bool {
        self.core.winner.is_some()
    }

    /// Returns winner index (1 = P1, 2 = P2, 0 = Draw, None = In Progress).
    #[must_use]
    pub fn winner(&self) -> Option<u8> {
        self.core.winner
    }

    /// Returns JSON array of audio events triggered in the current frame.
    #[must_use]
    pub fn get_audio_events_json(&self) -> String {
        serde_json::to_string(&self.core.audio_events).unwrap_or_else(|_| "[]".into())
    }

    /// Returns JSON array of haptic events triggered in the current frame.
    #[must_use]
    pub fn get_haptic_events_json(&self) -> String {
        serde_json::to_string(&self.core.haptic_events).unwrap_or_else(|_| "[]".into())
    }
}

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
    lost: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
impl WebGpuCanvas {
    async fn open(canvas: web_sys::HtmlCanvasElement, label: &str) -> Result<Self, JsValue> {
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
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| js_error("WebGPU adapter cannot present to the canvas"))?;
        // The shaders write premultiplied colour; every WebGPU canvas supports "premultiplied"
        // (GPUCanvasAlphaMode), whatever the reported capability list holds.
        config.alpha_mode = wgpu::CompositeAlphaMode::PreMultiplied;
        surface.configure(&device, &config);
        let lost = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = std::sync::Arc::clone(&lost);
        device.set_device_lost_callback(move |_, _| {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        });
        Ok(Self { device, queue, surface, config, lost })
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
            _ => return true,
        };
        let view = texture.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let aspect = self.config.width as f32 / self.config.height.max(1) as f32;
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("shenron frame"),
        });
        record(&self.queue, &mut encoder, &view, aspect);
        self.queue.submit([encoder.finish()]);
        // wgpu 30: presentation moved from `SurfaceTexture::present` to `Queue::present`.
        self.queue.present(texture);
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
    let gpu = WebGpuCanvas::open(canvas, "shenron toriyama 3d").await?;
    let size = uniforms.bytes().len() as u64;
    let pipeline =
        crate::render::ToriyamaPipeline::new(&gpu.device, gpu.config.format, model, size);
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
    let gpu = WebGpuCanvas::open(canvas, "shenron manga scene").await?;
    let pipeline = crate::render::MangaScenePipeline::new(
        &gpu.device,
        &gpu.queue,
        gpu.config.format,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_engine_wrapper_simulation() {
        let mut engine = ShenronEngineWasm::new("goku", "vegeta", "cellgames", "versus");
        assert_eq!(engine.p1_hp(), 10000.0);
        assert_eq!(engine.p2_hp(), 9500.0);

        engine.tick_raw(
            false, true, false, false, true, false, false, false, false, false, false, false,
            false, false, false, false, false, false,
        );

        let packet_json = engine.get_render_packet_json();
        assert!(packet_json.contains("fighters"));
    }
}
