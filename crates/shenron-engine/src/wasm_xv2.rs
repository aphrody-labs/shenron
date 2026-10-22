// SPDX-License-Identifier: Apache-2.0

//! WebAssembly binding of a real DBXV2 character: `.esk` skeleton, `.emd`/`.emb`/`.emm`/
//! `.dyt.emb` parts and an `.ean` animation set, skinned on the CPU every frame and drawn
//! with the XV2 toon pipeline on WebGPU.

#![cfg(all(feature = "wasm", target_arch = "wasm32"))]

use crate::render::TurntableCamera;
use crate::render::skinned::{
    BoundAnimation, CharacterPart, SkinnedCharacter, SkinnedGpuCharacter, Xv2ToonPipeline,
};
use shenron_re::formats::{BacFile, EanFile, EmbFile, EmdFile, EmmFile, EskFile};

/// BAC animation source naming the character's own `.ean`.
const EAN_CHARACTER: u16 = 5;
use wasm_bindgen::prelude::*;

/// EAN key frames are authored at 60 frames per second.
const FRAMES_PER_SECOND: f32 = 60.0;
const MAX_FILE: usize = 64 * 1024 * 1024;

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn bytes_of(object: &JsValue, key: &str) -> Result<Option<Vec<u8>>, JsValue> {
    let value = js_sys::Reflect::get(object, &JsValue::from_str(key))?;
    if value.is_undefined() || value.is_null() {
        return Ok(None);
    }
    let array = value
        .dyn_into::<js_sys::Uint8Array>()
        .map_err(|_| js_error(format!("{key} must be a Uint8Array")))?;
    if array.length() as usize > MAX_FILE {
        return Err(js_error(format!("{key} exceeds 64 MiB")));
    }
    Ok(Some(array.to_vec()))
}

fn decode_all(emb: &EmbFile) -> Vec<shenron_re::formats::EmbRgbaTexture> {
    (0..emb.count).filter_map(|i| emb.decode_rgba(i).ok()).collect()
}

/// A browser canvas presented by wgpu on WebGPU.
struct Surface {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    depth: wgpu::TextureView,
}

fn depth_view(device: &wgpu::Device, config: &wgpu::SurfaceConfiguration) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("xv2 depth"),
            size: wgpu::Extent3d {
                width: config.width,
                height: config.height,
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

impl Surface {
    async fn open(canvas: web_sys::HtmlCanvasElement) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let (width, height) = (canvas.width().max(1), canvas.height().max(1));
        let surface =
            instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(js_error)?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
                apply_limit_buckets: false,
            })
            .await
            .map_err(js_error)?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("xv2 character"),
                ..Default::default()
            })
            .await
            .map_err(js_error)?;
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| js_error("WebGPU adapter cannot present to the canvas"))?;
        config.alpha_mode = wgpu::CompositeAlphaMode::Opaque;
        surface.configure(&device, &config);
        let depth = depth_view(&device, &config);
        Ok(Self { device, queue, surface, config, depth })
    }

    fn resize(&mut self, width: u32, height: u32) {
        let (width, height) = (width.max(1), height.max(1));
        if (width, height) != (self.config.width, self.config.height) {
            self.config.width = width;
            self.config.height = height;
            self.surface.configure(&self.device, &self.config);
            self.depth = depth_view(&self.device, &self.config);
        }
    }
}

/// A posed, animated DBXV2 character on a WebGPU canvas. JavaScript owns the frame loop.
#[wasm_bindgen]
pub struct Xv2CharacterWasm {
    surface: Surface,
    pipeline: Xv2ToonPipeline,
    character: SkinnedCharacter,
    gpu: SkinnedGpuCharacter,
    ean: EanFile,
    animation: Option<BoundAnimation>,
    started: Option<f32>,
    /// Played frame range, playback speed and whether it plays once then returns to `idle`.
    range: (f32, f32),
    speed: f32,
    once: bool,
    idle: usize,
    actions: Option<BacFile>,
    camera: TurntableCamera,
    zoom: f32,
}

/// Parses every file, decodes textures and uploads the character. `parts` is an array of
/// `{ emd, emb?, emm?, dyt? }` byte arrays.
#[wasm_bindgen(js_name = createXv2Character)]
pub async fn create_xv2_character(
    canvas: web_sys::HtmlCanvasElement,
    esk: Vec<u8>,
    ean: Vec<u8>,
    parts: js_sys::Array,
) -> Result<Xv2CharacterWasm, JsValue> {
    let esk = EskFile::parse(&esk).map_err(js_error)?;
    let ean = EanFile::parse(&ean).map_err(js_error)?;
    let mut loaded = Vec::new();
    for part in parts.iter() {
        let Some(emd) = bytes_of(&part, "emd")? else { continue };
        let mut entry = CharacterPart::new(
            EmdFile::parse(&emd).map_err(js_error)?,
            match bytes_of(&part, "emb")? {
                Some(b) => decode_all(&EmbFile::parse(&b).map_err(js_error)?),
                None => Vec::new(),
            },
        );
        if let Some(b) = bytes_of(&part, "emm")? {
            entry.materials = Some(EmmFile::parse(&b).map_err(js_error)?);
        }
        if let Some(b) = bytes_of(&part, "dyt")? {
            entry.dye = EmbFile::parse(&b).ok().and_then(|d| d.decode_rgba(0).ok());
        }
        loaded.push(entry);
    }
    if loaded.is_empty() {
        return Err(js_error("character has no model part"));
    }
    let character = SkinnedCharacter::new(esk.bones, loaded);
    let surface = Surface::open(canvas).await?;
    let pipeline = Xv2ToonPipeline::new(&surface.device, surface.config.format);
    let gpu = SkinnedGpuCharacter::upload(&surface.device, &surface.queue, &character, &pipeline);
    let (center, radius) = character.bounds();
    let camera = TurntableCamera {
        target: center,
        distance: radius * 3.2,
        azimuth: std::f32::consts::PI,
        z_near: (radius / 100.0).max(0.001),
        z_far: radius * 100.0,
        ..Default::default()
    };
    let mut handle = Xv2CharacterWasm {
        surface,
        pipeline,
        character,
        gpu,
        ean,
        animation: None,
        started: None,
        range: (0.0, 0.0),
        speed: 1.0,
        once: false,
        idle: 0,
        actions: None,
        camera,
        zoom: 1.0,
    };
    handle.play(0);
    Ok(handle)
}

#[wasm_bindgen]
impl Xv2CharacterWasm {
    /// Names of the animations, in slot order of [`Self::play`].
    pub fn animations(&self) -> Vec<String> {
        self.ean.animations.iter().map(|a| a.name.clone()).collect()
    }

    /// Plays the animation at `index` of [`Self::animations`] from its first frame.
    pub fn play(&mut self, index: usize) -> bool {
        let Some(animation) = self.ean.animations.get(index) else { return false };
        let bound = self.character.bind(&self.ean, animation);
        self.range = (0.0, bound.frame_count.saturating_sub(1) as f32);
        self.animation = Some(bound);
        self.speed = 1.0;
        self.once = false;
        self.idle = index;
        self.started = None;
        true
    }

    /// Loads the character's `.bac` action timelines; returns the ids of the actions that
    /// animate the character with its own `.ean`.
    #[wasm_bindgen(js_name = loadActions)]
    pub fn load_actions(&mut self, bytes: Vec<u8>) -> Result<Vec<u32>, JsValue> {
        let bac = BacFile::parse(&bytes).map_err(js_error)?;
        let playable = bac
            .moves
            .iter()
            .filter(|m| {
                m.animations
                    .iter()
                    .any(|a| a.ean_type == EAN_CHARACTER && self.slot(a.ean_index).is_some())
            })
            .map(|m| m.move_id)
            .collect();
        self.actions = Some(bac);
        Ok(playable)
    }

    /// Plays action `id` of the loaded `.bac` once: its first character animation over the
    /// action's frame range and speed, then returns to the last looping animation.
    #[wasm_bindgen(js_name = playAction)]
    pub fn play_action(&mut self, id: u32) -> bool {
        let Some(action) = self.actions.as_ref().and_then(|b| b.find(id)) else { return false };
        let Some(record) = action
            .animations
            .iter()
            .find(|a| a.ean_type == EAN_CHARACTER && self.slot(a.ean_index).is_some())
            .cloned()
        else {
            return false;
        };
        let Some(slot) = self.slot(record.ean_index) else { return false };
        let bound = self.character.bind(&self.ean, &self.ean.animations[slot]);
        let last = bound.frame_count.saturating_sub(1) as f32;
        let end =
            if record.frame_end == u16::MAX { last } else { (record.frame_end as f32).min(last) };
        self.range = ((record.frame_start as f32).min(end), end);
        self.speed = if record.time_scale.is_finite() && record.time_scale > 0.0 {
            record.time_scale
        } else {
            1.0
        };
        self.animation = Some(bound);
        self.once = true;
        self.started = None;
        true
    }

    /// Position in [`Self::animations`] of the animation stored at EAN slot `index`.
    fn slot(&self, index: u16) -> Option<usize> {
        self.ean.animations.iter().position(|a| a.index == index as usize)
    }

    /// Azimuth/elevation in radians and a zoom factor in `[0.5, 3]`.
    pub fn camera(&mut self, azimuth: f32, elevation: f32, zoom: f32) {
        if azimuth.is_finite() && elevation.is_finite() && zoom.is_finite() {
            self.camera.azimuth = std::f32::consts::PI + azimuth;
            self.camera.elevation = elevation.clamp(-1.4, 1.4);
            self.zoom = zoom.clamp(0.5, 3.0);
        }
    }

    /// Draws the pose at `time` seconds (looping). `false` when the surface is unusable.
    pub fn frame(&mut self, time: f32) -> bool {
        let started = *self.started.get_or_insert(time);
        let (start, end) = self.range;
        let length = (end - start).max(0.0);
        let elapsed = (time - started).max(0.0) * FRAMES_PER_SECOND * self.speed;
        if self.once && elapsed > length {
            self.play(self.idle);
            return self.frame(time);
        }
        let frame = if self.once {
            start + elapsed.min(length)
        } else if length > 0.0 {
            start + elapsed % length
        } else {
            start
        };
        let skin = self.character.skin_matrices(self.animation.as_ref(), frame);
        self.gpu.update(&self.surface.queue, &self.character, &skin);
        let (center, _) = self.character.posed_bounds(&skin);
        self.camera.target = self.camera.target.lerp(center, 0.2);
        self.camera.aspect_ratio =
            self.surface.config.width as f32 / self.surface.config.height.max(1) as f32;
        self.camera.fov_y = (45.0 / self.zoom).to_radians();
        self.pipeline.update_camera(&self.surface.queue, &self.camera);

        let texture = match self.surface.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t)
            | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.surface.configure(&self.surface.device, &self.surface.config);
                return true;
            },
            _ => return true,
        };
        let view = texture.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self.surface.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("xv2 character"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.03,
                            g: 0.04,
                            b: 0.08,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.surface.depth,
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
            pass.set_pipeline(&self.pipeline.pipeline);
            pass.set_bind_group(0, &self.pipeline.uniform_bind_group, &[]);
            self.gpu.draw(&mut pass);
        }
        self.surface.queue.submit([encoder.finish()]);
        self.surface.queue.present(texture);
        true
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.surface.resize(width, height);
    }
}
