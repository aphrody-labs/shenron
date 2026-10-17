// SPDX-License-Identifier: Apache-2.0

//! A manga page (planche) staged as a 3D scene on wgpu.
//!
//! [`segment_panels`] finds the panels (koma) of a page by recursive XY-cut on its white
//! gutters: a row or a column is a gutter when nearly all of its pixels are paper. The scene
//! then lays the page as a receding backdrop and lifts every panel towards the camera at its own
//! depth, with an ink border and a hard drop shadow, under a perspective camera that follows
//! the pointer: the parallax between panels is what reads as depth.
//!
//! The page pixels are the caller's (an authorised scan); nothing is drawn or invented over
//! them, the scene only re-arranges the panels in space.

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};

// The segmentation lives in `shenron-panels` (pure, native and wasm32); re-exported here.
pub use shenron_panels::{PanelRect, SegmentOptions, downsample, segment_panels};

/// Depth of the `index`-th panel: varied but deterministic, so neighbours separate.
#[must_use]
pub fn panel_depth(index: usize) -> f32 {
    0.10 + 0.06 * ((index * 5 + 2) % 4) as f32 / 3.0
}

/// Uniform block of [`MANGA_SCENE_WGSL`].
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct SceneUniforms {
    /// Column-major view-projection matrix.
    pub view_proj: [[f32; 4]; 4],
    /// `page aspect (w / h), backdrop dimming, ink border (uv), 0`.
    pub params: [f32; 4],
}

/// One quad of the scene: `rect` in page uv, `depth`, `kind` (0 page, 1 shadow, 2 panel).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct SceneQuad {
    /// `x, y, w, h` in page uv.
    pub rect: [f32; 4],
    /// `depth, kind, 0, 0`.
    pub meta: [f32; 4],
}

/// Back-to-front quads of a page and its panels (drawn without a depth buffer).
#[must_use]
pub fn scene_quads(panels: &[PanelRect]) -> Vec<SceneQuad> {
    let mut quads = vec![SceneQuad { rect: [0.0, 0.0, 1.0, 1.0], meta: [0.0, 0.0, 0.0, 0.0] }];
    let mut order: Vec<(usize, f32)> =
        panels.iter().enumerate().map(|(i, _)| (i, panel_depth(i))).collect();
    order.sort_by(|a, b| a.1.total_cmp(&b.1));
    for (i, depth) in order {
        let p = panels[i];
        quads.push(SceneQuad { rect: [p.x, p.y, p.w, p.h], meta: [depth - 0.004, 1.0, 0.0, 0.0] });
        quads.push(SceneQuad { rect: [p.x, p.y, p.w, p.h], meta: [depth, 2.0, 0.0, 0.0] });
    }
    quads
}

/// View-projection of the scene: a perspective camera orbiting the page centre.
#[must_use]
pub fn scene_camera(
    canvas_aspect: f32,
    page_aspect: f32,
    time: f32,
    tilt_x: f32,
    tilt_y: f32,
) -> Mat4 {
    let fov = 30_f32.to_radians();
    // Fit the page (height 2, width 2 × aspect) in the view, with a margin for the parallax.
    let fit_h = 1.0_f32;
    let fit_w = page_aspect / canvas_aspect.max(0.01);
    let distance = fit_h.max(fit_w) * 1.12 / (fov / 2.0).tan();
    let yaw = tilt_y * 0.45 + 0.07 * (time * 0.31).sin();
    let pitch = tilt_x * 0.3 + 0.04 * (time * 0.23).sin();
    let eye = Vec3::new(yaw.sin() * pitch.cos(), pitch.sin(), yaw.cos() * pitch.cos()) * distance;
    let view = Mat4::look_at_rh(eye, Vec3::ZERO, Vec3::Y);
    let proj = Mat4::perspective_rh(fov, canvas_aspect.max(0.01), 0.1, distance * 4.0);
    proj * view
}

/// Shader of the scene: instanced quads sampling the page texture.
pub const MANGA_SCENE_WGSL: &str = r"
struct Scene {
  view_proj: mat4x4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var page: texture_2d<f32>;
@group(0) @binding(2) var page_sampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) local: vec2<f32>,
  @location(2) @interpolate(flat) kind: f32,
  @location(3) @interpolate(flat) size: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @location(0) rect: vec4<f32>, @location(1) info: vec4<f32>) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
  );
  let c = corners[v];
  let uv = rect.xy + c * rect.zw;
  let aspect = scene.params.x;
  // Shadows fall down-right of their panel.
  let shadow = select(vec2<f32>(0.0), vec2<f32>(0.018, -0.018), info.y == 1.0);
  let world = vec3<f32>((uv.x - 0.5) * 2.0 * aspect + shadow.x, (0.5 - uv.y) * 2.0 + shadow.y, info.x);
  var out: VsOut;
  out.position = scene.view_proj * vec4<f32>(world, 1.0);
  out.uv = uv;
  out.local = c * rect.zw;
  out.kind = info.y;
  out.size = rect.zw;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  // Derivatives and the sample stay in uniform control flow (WGSL uniformity rules).
  let texel = textureSample(page, page_sampler, in.uv).rgb;
  // Ink border of a lifted panel: distance to the nearest edge, in page uv.
  let d = min(min(in.local.x, in.local.y), min(in.size.x - in.local.x, in.size.y - in.local.y));
  let aa = fwidth(d);
  if (in.kind == 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.55);
  }
  if (in.kind == 0.0) {
    // The page recedes: dimmed, the panels lifted from it read in front.
    return vec4<f32>(texel * scene.params.y, 1.0);
  }
  let ink = 1.0 - smoothstep(scene.params.z - aa, scene.params.z + aa, d);
  return vec4<f32>(mix(texel, vec3<f32>(0.0), ink), 1.0);
}
";

/// GPU side of the scene: the page texture, the quads and the pipeline.
pub struct MangaScenePipeline {
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    quads: wgpu::Buffer,
    quad_count: u32,
    bind_group: wgpu::BindGroup,
    page_aspect: f32,
}

impl MangaScenePipeline {
    /// Uploads the page (`rgba`, `width × height`) and the quads of `panels`.
    #[must_use]
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        format: wgpu::TextureFormat,
        rgba: &[u8],
        width: u32,
        height: u32,
        panels: &[PanelRect],
    ) -> Self {
        let size = wgpu::Extent3d { width, height, depth_or_array_layers: 1 };
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("manga page"),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            rgba,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            size,
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("manga page"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("manga scene uniforms"),
            size: size_of::<SceneUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let quad_data = scene_quads(panels);
        let quads = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("manga scene quads"),
            size: (quad_data.len() * size_of::<SceneQuad>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        queue.write_buffer(&quads, 0, bytemuck::cast_slice(&quad_data));
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("manga scene"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("manga scene"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: uniforms.as_entire_binding() },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("manga scene"),
            source: wgpu::ShaderSource::Wgsl(MANGA_SCENE_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("manga scene"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        const ATTRIBUTES: [wgpu::VertexAttribute; 2] =
            wgpu::vertex_attr_array![0 => Float32x4, 1 => Float32x4];
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("manga scene"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: size_of::<SceneQuad>() as u64,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &ATTRIBUTES,
                })],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        Self {
            pipeline,
            uniforms,
            quads,
            quad_count: quad_data.len() as u32,
            bind_group,
            page_aspect: width as f32 / height as f32,
        }
    }

    /// Records one frame into `view`; `canvas_aspect` is the target width / height.
    pub fn draw(
        &self,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        canvas_aspect: f32,
        time: f32,
        tilt: (f32, f32),
    ) {
        let camera = scene_camera(canvas_aspect, self.page_aspect, time, tilt.0, tilt.1);
        let uniforms = SceneUniforms {
            view_proj: camera.to_cols_array_2d(),
            params: [self.page_aspect, 0.38, 0.0035, 0.0],
        };
        queue.write_buffer(&self.uniforms, 0, bytemuck::bytes_of(&uniforms));
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("manga scene"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_vertex_buffer(0, self.quads.slice(..));
        pass.draw(0..6, 0..self.quad_count);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quads_are_back_to_front_with_one_shadow_per_panel() {
        let panels = [
            PanelRect { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
            PanelRect { x: 0.1, y: 0.5, w: 0.35, h: 0.4 },
            PanelRect { x: 0.55, y: 0.5, w: 0.35, h: 0.4 },
        ];
        let quads = scene_quads(&panels);
        assert_eq!(quads.len(), 1 + 2 * panels.len());
        assert_eq!(quads[0].meta[1], 0.0);
        let depths: Vec<f32> = quads.iter().map(|q| q.meta[0]).collect();
        assert!(depths.windows(2).all(|w| w[0] <= w[1]), "{depths:?}");
        assert_eq!(size_of::<SceneUniforms>(), 80);
        assert_eq!(size_of::<SceneQuad>(), 32);
    }

    #[test]
    fn the_camera_keeps_the_page_centre_in_view() {
        let m = scene_camera(1662.0 / 2560.0, 1662.0 / 2560.0, 0.0, 0.0, 0.0);
        let clip = m * glam::Vec4::new(0.0, 0.0, 0.0, 1.0);
        let ndc = clip / clip.w;
        assert!(ndc.x.abs() < 1e-4 && ndc.y.abs() < 1e-4 && (0.0..1.0).contains(&ndc.z));
        // The page corners stay inside the frame.
        let corner = m * glam::Vec4::new(1662.0 / 2560.0, 1.0, 0.0, 1.0);
        assert!((corner.x / corner.w).abs() < 1.0 && (corner.y / corner.w).abs() < 1.0);
    }

    #[test]
    fn the_shader_is_valid_wgsl() {
        crate::render::toriyama3d::validate_wgsl(MANGA_SCENE_WGSL);
    }
}
