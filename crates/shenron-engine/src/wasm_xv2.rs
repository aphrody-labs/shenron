// SPDX-License-Identifier: Apache-2.0

//! WebAssembly bindings of real DBXV2 characters: one animated character
//! ([`createXv2Character`](create_xv2_character)) and a two-fighter duel
//! ([`createXv2Duel`](create_xv2_duel)). Characters are `.esk` skeletons, `.emd`/`.emb`/
//! `.emm`/`.dyt.emb` parts, an `.ean` animation set and optionally `.bac` actions and `.bdm`
//! damage; they are skinned on the CPU every frame and drawn with the XV2 toon pipeline.

#![cfg(all(feature = "wasm", target_arch = "wasm32"))]

use crate::render::TurntableCamera;
use crate::render::skinned::{
    CharacterPart, SkinnedCharacter, SkinnedGpuCharacter, Xv2ToonPipeline,
};
use crate::xv2_fighter::{self, Duel, Fighter};
use glam::Vec3;
use shenron_re::formats::{BacFile, BdmFile, EanFile, EmbFile, EmdFile, EmmFile, EskFile};
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

/// Parses `{ emd, emb?, emm?, dyt? }` parts.
fn parts_of(parts: &js_sys::Array) -> Result<Vec<CharacterPart>, JsValue> {
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
    Ok(loaded)
}

fn fighter_of(esk: &[u8], ean: &[u8], parts: &js_sys::Array) -> Result<Fighter, JsValue> {
    let esk = EskFile::parse(esk).map_err(js_error)?;
    let ean = EanFile::parse(ean).map_err(js_error)?;
    Ok(Fighter::new(SkinnedCharacter::new(esk.bones, parts_of(parts)?), ean))
}

/// Parses `{ esk, ean, parts, bac?, bdm? }`.
fn duel_fighter(object: &JsValue) -> Result<Fighter, JsValue> {
    let esk = bytes_of(object, "esk")?.ok_or_else(|| js_error("esk is missing"))?;
    let ean = bytes_of(object, "ean")?.ok_or_else(|| js_error("ean is missing"))?;
    let parts = js_sys::Reflect::get(object, &JsValue::from_str("parts"))?
        .dyn_into::<js_sys::Array>()
        .map_err(|_| js_error("parts must be an array"))?;
    let mut fighter = fighter_of(&esk, &ean, &parts)?;
    if let Some(b) = bytes_of(object, "bac")? {
        fighter.actions = Some(BacFile::parse(&b).map_err(js_error)?);
    }
    if let Some(b) = bytes_of(object, "bdm")? {
        fighter.damage = Some(BdmFile::parse(&b).map_err(js_error)?);
    }
    Ok(fighter)
}

/// A browser canvas presented by wgpu on WebGPU, with its toon pipeline.
struct Surface {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    depth: wgpu::TextureView,
    pipeline: Xv2ToonPipeline,
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
        let pipeline = Xv2ToonPipeline::new(&device, config.format);
        Ok(Self { device, queue, surface, config, depth, pipeline })
    }

    fn upload(&self, fighter: &Fighter) -> SkinnedGpuCharacter {
        SkinnedGpuCharacter::upload(&self.device, &self.queue, &fighter.character, &self.pipeline)
    }

    fn aspect(&self) -> f32 {
        self.config.width as f32 / self.config.height.max(1) as f32
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

    /// Re-skins `fighters` with their world skin and presents one frame.
    fn draw(
        &mut self,
        camera: &TurntableCamera,
        fighters: &mut [(&Fighter, &mut SkinnedGpuCharacter)],
    ) -> bool {
        for (fighter, gpu) in fighters.iter_mut() {
            gpu.update(&self.queue, &fighter.character, &fighter.world_skin());
        }
        self.pipeline.update_camera(&self.queue, camera);
        let texture = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t)
            | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return true;
            },
            _ => return true,
        };
        let view = texture.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("xv2 scene"),
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
                    view: &self.depth,
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
            for (_, gpu) in fighters.iter() {
                gpu.draw(&mut pass);
            }
        }
        self.queue.submit([encoder.finish()]);
        self.queue.present(texture);
        true
    }
}

/// Game frames elapsed since the previous call, from a time in seconds.
fn elapsed_frames(last: &mut Option<f32>, time: f32) -> f32 {
    let frames = last.map_or(0.0, |previous| (time - previous).max(0.0) * FRAMES_PER_SECOND);
    *last = Some(time);
    frames
}

/// A posed, animated DBXV2 character on a WebGPU canvas. JavaScript owns the frame loop.
#[wasm_bindgen]
pub struct Xv2CharacterWasm {
    surface: Surface,
    fighter: Fighter,
    gpu: SkinnedGpuCharacter,
    camera: TurntableCamera,
    zoom: f32,
    last: Option<f32>,
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
    let fighter = fighter_of(&esk, &ean, &parts)?;
    let surface = Surface::open(canvas).await?;
    let gpu = surface.upload(&fighter);
    let (center, radius) = fighter.character.bounds();
    let camera = TurntableCamera {
        target: center,
        distance: radius * 3.2,
        azimuth: std::f32::consts::PI,
        z_near: (radius / 100.0).max(0.001),
        z_far: radius * 100.0,
        ..Default::default()
    };
    Ok(Xv2CharacterWasm { surface, fighter, gpu, camera, zoom: 1.0, last: None })
}

#[wasm_bindgen]
impl Xv2CharacterWasm {
    /// Names of the animations, in slot order of [`Self::play`].
    pub fn animations(&self) -> Vec<String> {
        self.fighter.ean.animations.iter().map(|a| a.name.clone()).collect()
    }

    /// Loops the animation at `index` of [`Self::animations`].
    pub fn play(&mut self, index: usize) -> bool {
        self.fighter.play(index)
    }

    /// Loads the character's `.bac`; returns the ids of the actions it can play.
    #[wasm_bindgen(js_name = loadActions)]
    pub fn load_actions(&mut self, bytes: Vec<u8>) -> Result<Vec<u32>, JsValue> {
        self.fighter.actions = Some(BacFile::parse(&bytes).map_err(js_error)?);
        Ok(self.fighter.playable_actions())
    }

    /// Plays a `.bac` action once, then returns to the looping animation.
    #[wasm_bindgen(js_name = playAction)]
    pub fn play_action(&mut self, id: u32) -> bool {
        self.fighter.start_action(id)
    }

    /// Azimuth/elevation in radians and a zoom factor in `[0.5, 3]`.
    pub fn camera(&mut self, azimuth: f32, elevation: f32, zoom: f32) {
        if azimuth.is_finite() && elevation.is_finite() && zoom.is_finite() {
            self.camera.azimuth = std::f32::consts::PI + azimuth;
            self.camera.elevation = elevation.clamp(-1.4, 1.4);
            self.zoom = zoom.clamp(0.5, 3.0);
        }
    }

    /// Draws the pose at `time` seconds. `false` when the surface is unusable.
    pub fn frame(&mut self, time: f32) -> bool {
        let frames = elapsed_frames(&mut self.last, time);
        self.fighter.advance(frames);
        let (center, _) = self.fighter.character.posed_bounds(&self.fighter.world_skin());
        self.camera.target = self.camera.target.lerp(center, 0.2);
        self.camera.aspect_ratio = self.surface.aspect();
        self.camera.fov_y = (45.0 / self.zoom).to_radians();
        let camera = self.camera.clone();
        self.surface.draw(&camera, &mut [(&self.fighter, &mut self.gpu)])
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.surface.resize(width, height);
    }
}

/// Two real fighters facing each other; their `.bac` actions land through their `.bdm`.
#[wasm_bindgen]
pub struct Xv2DuelWasm {
    surface: Surface,
    duel: Duel,
    gpus: [SkinnedGpuCharacter; 2],
    camera: TurntableCamera,
    zoom: f32,
    last: Option<f32>,
    hits: u32,
    /// Each player's loaded skill (its own `.ean`/`.bac`, e.g. a Kamehameha), if any.
    skills: [Option<(EanFile, BacFile)>; 2],
}

/// `a` and `b` are `{ esk, ean, parts, bac?, bdm? }` (parts as for `createXv2Character`).
#[wasm_bindgen(js_name = createXv2Duel)]
pub async fn create_xv2_duel(
    canvas: web_sys::HtmlCanvasElement,
    a: JsValue,
    b: JsValue,
) -> Result<Xv2DuelWasm, JsValue> {
    let duel = Duel::new(duel_fighter(&a)?, duel_fighter(&b)?, 2.0);
    let surface = Surface::open(canvas).await?;
    let gpus = [surface.upload(&duel.fighters[0]), surface.upload(&duel.fighters[1])];
    let camera = TurntableCamera {
        target: Vec3::new(0.0, 0.9, 0.0),
        distance: 4.0,
        z_near: 0.05,
        z_far: 200.0,
        ..Default::default()
    };
    Ok(Xv2DuelWasm {
        surface,
        duel,
        gpus,
        camera,
        zoom: 1.0,
        last: None,
        hits: 0,
        skills: [None, None],
    })
}

#[wasm_bindgen]
impl Xv2DuelWasm {
    /// Playable `.bac` action ids of `player` (0 or 1).
    pub fn actions(&self, player: usize) -> Vec<u32> {
        self.duel.fighters.get(player).map(Fighter::playable_actions).unwrap_or_default()
    }

    /// Starts action `id` for `player`; refused while stunned or mid-action/skill.
    pub fn attack(&mut self, player: usize, id: u32) -> bool {
        self.duel.fighters.get_mut(player).is_some_and(|f| f.start_action(id))
    }

    /// Loads a skill's own `.ean` and `.bac` (e.g. `data/skill/SPA/004_GOK_GKD/
    /// 004_GOK_GKD.{ean,bac}`, a Kamehameha) for `player`; returns its playable action ids.
    #[wasm_bindgen(js_name = loadSkill)]
    pub fn load_skill(
        &mut self,
        player: usize,
        ean_bytes: Vec<u8>,
        bac_bytes: Vec<u8>,
    ) -> Result<Vec<u32>, JsValue> {
        let ean = EanFile::parse(&ean_bytes).map_err(js_error)?;
        let bac = BacFile::parse(&bac_bytes).map_err(js_error)?;
        let ids = bac
            .moves
            .iter()
            .filter(|m| m.animations.iter().any(|a| a.ean_type == xv2_fighter::EAN_SKILL))
            .map(|m| m.move_id)
            .collect();
        let Some(slot) = self.skills.get_mut(player) else { return Err(js_error("bad player")) };
        *slot = Some((ean, bac));
        Ok(ids)
    }

    /// Plays action `id` of `player`'s loaded skill once, animated from the skill's own
    /// `.ean` rather than the character's. The skill's own hitboxes, if any, are not yet
    /// resolved (see [`crate::xv2_fighter::Fighter::start_skill`]).
    #[wasm_bindgen(js_name = playSkill)]
    pub fn play_skill(&mut self, player: usize, id: u32) -> bool {
        let (Some(fighter), Some(Some((ean, bac)))) =
            (self.duel.fighters.get_mut(player), self.skills.get(player))
        else {
            return false;
        };
        fighter.start_skill(ean, bac, id)
    }

    /// Moves `player` toward (positive) or away from (negative) the opponent.
    pub fn walk(&mut self, player: usize, metres: f32) {
        if let Some(f) = self.duel.fighters.get_mut(player) {
            f.walk(metres);
        }
    }

    pub fn hp(&self, player: usize) -> i32 {
        self.duel.fighters.get(player).map_or(0, |f| f.hp)
    }

    /// Whether `player` can act (not stunned, no action in progress).
    pub fn ready(&self, player: usize) -> bool {
        self.duel.fighters.get(player).is_some_and(|f| f.stun == 0 && f.current_action().is_none())
    }

    /// Distance between the fighters, in metres.
    pub fn distance(&self) -> f32 {
        let [a, b] = &self.duel.fighters;
        a.placement.position.distance(b.placement.position)
    }

    /// Hits landed since the duel started.
    pub fn hits(&self) -> u32 {
        self.hits
    }

    pub fn camera(&mut self, azimuth: f32, elevation: f32, zoom: f32) {
        if azimuth.is_finite() && elevation.is_finite() && zoom.is_finite() {
            self.camera.azimuth = azimuth;
            self.camera.elevation = elevation.clamp(-1.4, 1.4);
            self.zoom = zoom.clamp(0.5, 3.0);
        }
    }

    /// Advances the duel to `time` seconds and draws it.
    pub fn frame(&mut self, time: f32) -> bool {
        let frames = elapsed_frames(&mut self.last, time);
        self.hits += self.duel.step(frames).len() as u32;
        let [a, b] = &self.duel.fighters;
        let middle = (a.placement.position + b.placement.position) / 2.0;
        self.camera.target = self.camera.target.lerp(middle + Vec3::Y * 0.9, 0.2);
        self.camera.distance = (self.distance() * 1.3).max(3.5);
        self.camera.aspect_ratio = self.surface.aspect();
        self.camera.fov_y = (45.0 / self.zoom).to_radians();
        let camera = self.camera.clone();
        let [g0, g1] = &mut self.gpus;
        let [f0, f1] = &self.duel.fighters;
        self.surface.draw(&camera, &mut [(f0, g0), (f1, g1)])
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.surface.resize(width, height);
    }
}
