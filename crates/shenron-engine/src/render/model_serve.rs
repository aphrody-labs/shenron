// SPDX-License-Identifier: Apache-2.0

//! 3D Model Serving and GPU Mesh Rendering Pipeline.
//!
//! Adapts the 3D model serving architecture from `aphrody-nie-model-serve` and
//! the wgpu viewport renderer from `aphrody-nie-render3d::gpu` for Dragon Ball Xenoverse 2.
//!
//! Provides:
//! - GPU vertex and index buffer staging (`GpuPrimitive`, `GpuCharacterModel`)
//! - Cel-shading / toon anime WGSL shader pipeline with rim lighting
//! - Turntable orbit camera controls (`TurntableCamera`)
//! - Off-screen headless rendering and pixel readback (`render_offscreen_rgba`)

use super::pixel_perfect::{AlphaMode, blend_state, nearest_sampler_descriptor};
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use shenron_re::formats::AssembledCharacterModel;
use wgpu::util::DeviceExt;

/// Standard 3D vertex attribute layout for Xenoverse models.
#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct ModelVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

impl ModelVertex {
    pub const LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Self>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &wgpu::vertex_attr_array![
            0 => Float32x3, // position
            1 => Float32x3, // normal
            2 => Float32x2  // uv
        ],
    };
}

/// Uniforms buffer passed to the anime cel-shading pipeline.
#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct ModelUniforms {
    pub view_proj: [[f32; 4]; 4],
    pub model: [[f32; 4]; 4],
    pub light_dir: [f32; 3],
    pub rim_power: f32,
    pub ambient_color: [f32; 4],
    pub rim_color: [f32; 4],
}

/// Turntable orbit camera for model inspection and viewport display.
#[derive(Debug, Clone)]
pub struct TurntableCamera {
    pub azimuth: f32,
    pub elevation: f32,
    pub distance: f32,
    pub target: Vec3,
    pub fov_y: f32,
    pub aspect_ratio: f32,
    pub z_near: f32,
    pub z_far: f32,
}

impl Default for TurntableCamera {
    fn default() -> Self {
        Self {
            azimuth: 0.0,
            elevation: 0.15,
            distance: 2.5,
            target: Vec3::new(0.0, 0.9, 0.0), // Character torso center
            fov_y: 45.0f32.to_radians(),
            aspect_ratio: 1.0,
            z_near: 0.1,
            z_far: 100.0,
        }
    }
}

impl TurntableCamera {
    /// Eye position in world space.
    pub fn eye_position(&self) -> Vec3 {
        let x = self.distance * self.elevation.cos() * self.azimuth.sin();
        let y = self.distance * self.elevation.sin();
        let z = self.distance * self.elevation.cos() * self.azimuth.cos();
        self.target + Vec3::new(x, y, z)
    }

    /// View matrix.
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.eye_position(), self.target, Vec3::Y)
    }

    /// Perspective projection matrix.
    pub fn proj_matrix(&self) -> Mat4 {
        Mat4::perspective_rh(self.fov_y, self.aspect_ratio, self.z_near, self.z_far)
    }

    /// Combined View-Projection matrix.
    pub fn view_proj_matrix(&self) -> Mat4 {
        self.proj_matrix() * self.view_matrix()
    }
}

/// A GPU-resident mesh primitive ready for drawing.
pub struct GpuPrimitive {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub index_count: u32,
    pub index_format: wgpu::IndexFormat,
    pub bind_group: Option<wgpu::BindGroup>,
}

/// A GPU-resident character model containing one or more primitives.
pub struct GpuCharacterModel {
    pub name: String,
    pub primitives: Vec<GpuPrimitive>,
}

impl GpuCharacterModel {
    /// Uploads an `AssembledCharacterModel` into GPU memory buffers.
    pub fn upload(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        model: &AssembledCharacterModel,
        bind_group_layout: &wgpu::BindGroupLayout,
    ) -> Self {
        let mut gpu_prims = Vec::new();

        // Create default 1x1 white texture for untextured materials
        let default_texture = create_solid_texture(device, queue, [220, 220, 220, 255]);
        let default_view = default_texture.create_view(&wgpu::TextureViewDescriptor::default());
        // Pixel perfect contract: nearest, no mip, clamp to edge.
        let default_sampler = device.create_sampler(&nearest_sampler_descriptor());

        // Upload textures
        let mut texture_views = Vec::new();
        for tex in &model.textures {
            // Native size, single mip level, `Rgba8UnormSrgb` (EMB color data).
            let gpu_tex = upload_rgba_texture(device, queue, tex.width, tex.height, &tex.rgba);
            let view = gpu_tex.create_view(&wgpu::TextureViewDescriptor::default());
            texture_views.push(view);
        }

        for prim in &model.primitives {
            if prim.positions.is_empty() || prim.indices.is_empty() {
                continue;
            }

            // Interleave vertices
            let mut vertices = Vec::with_capacity(prim.positions.len());
            for i in 0..prim.positions.len() {
                let pos = prim.positions[i];
                let norm = prim.normals.get(i).copied().unwrap_or([0.0, 1.0, 0.0]);
                let uv = prim.uv.get(i).copied().unwrap_or([0.0, 0.0]);
                vertices.push(ModelVertex { position: pos, normal: norm, uv });
            }

            let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("{}_vbuf", prim.name)),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });

            let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("{}_ibuf", prim.name)),
                contents: bytemuck::cast_slice(&prim.indices),
                usage: wgpu::BufferUsages::INDEX,
            });

            // Bind group with texture & sampler
            let view_ref = if let Some(tex_idx) = prim.texture_index {
                texture_views.get(tex_idx).unwrap_or(&default_view)
            } else {
                &default_view
            };

            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some(&format!("{}_mat_bg", prim.name)),
                layout: bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(view_ref),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&default_sampler),
                    },
                ],
            });

            gpu_prims.push(GpuPrimitive {
                vertex_buffer,
                index_buffer,
                index_count: prim.indices.len() as u32,
                index_format: wgpu::IndexFormat::Uint32,
                bind_group: Some(bind_group),
            });
        }

        Self { name: model.name.clone(), primitives: gpu_prims }
    }
}

/// Anime cel-shading render pipeline manager for Xenoverse 3D character serving.
pub struct ModelServePipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
}

impl ModelServePipeline {
    /// Compiles the WGSL cel-shading pipeline.
    pub fn new(device: &wgpu::Device, target_format: wgpu::TextureFormat) -> Self {
        Self::with_alpha(device, target_format, AlphaMode::Straight)
    }

    /// Same as [`Self::new`] with the blend state of the declared texture alpha mode.
    pub fn with_alpha(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        alpha: AlphaMode,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("cel_shading_shader"),
            source: wgpu::ShaderSource::Wgsl(CEL_SHADING_WGSL.into()),
        });

        let uniform_size = std::mem::size_of::<ModelUniforms>() as wgpu::BufferAddress;
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("model_uniform_buffer"),
            size: uniform_size,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let uniform_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("model_uniform_bgl"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });

        let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("model_uniform_bg"),
            layout: &uniform_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let material_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("model_material_bgl"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: false },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::NonFiltering),
                        count: None,
                    },
                ],
            });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("model_pipeline_layout"),
            bind_group_layouts: &[
                Some(&uniform_bind_group_layout),
                Some(&material_bind_group_layout),
            ],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("model_render_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[Some(ModelVertex::LAYOUT)],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(blend_state(alpha)),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None, // Disable culling for double-sided anime clothes/hair
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self { pipeline, uniform_buffer, uniform_bind_group, material_bind_group_layout }
    }

    /// Updates uniform buffer with camera and anime lighting state.
    pub fn update_camera(&self, queue: &wgpu::Queue, camera: &TurntableCamera, model_matrix: Mat4) {
        let uniforms = ModelUniforms {
            view_proj: camera.view_proj_matrix().to_cols_array_2d(),
            model: model_matrix.to_cols_array_2d(),
            light_dir: Vec3::new(0.5, 0.8, 0.3).normalize().to_array(),
            rim_power: 3.5,
            ambient_color: [0.25, 0.25, 0.28, 1.0],
            rim_color: [1.0, 0.88, 0.60, 1.0], // Super Saiyan gold / sunlight rim
        };
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));
    }
}

/// Anime cel-shading shader in WGSL.
pub const CEL_SHADING_WGSL: &str = r#"
struct Uniforms {
    view_proj: mat4x4<f32>,
    model: mat4x4<f32>,
    light_dir: vec3<f32>,
    rim_power: f32,
    ambient: vec4<f32>,
    rim_color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var t_diffuse: texture_2d<f32>;
@group(1) @binding(1) var s_diffuse: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) view_dir: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = u.model * vec4<f32>(in.position, 1.0);
    out.clip_position = u.view_proj * world_pos;
    out.world_normal = normalize((u.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.uv = in.uv;
    out.view_dir = normalize(-world_pos.xyz);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base_color = textureSampleLevel(t_diffuse, s_diffuse, in.uv, 0.0);

    // Anime 2-tone Cel Shading ramp
    let n_dot_l = dot(in.world_normal, normalize(u.light_dir));
    var shade: f32;
    if (n_dot_l > 0.15) {
        shade = 1.0;
    } else {
        shade = 0.55; // Shadow tone
    }

    // Rim lighting (Aura / backlight glow)
    let n_dot_v = max(0.0, dot(in.world_normal, in.view_dir));
    let rim = pow(1.0 - n_dot_v, u.rim_power);
    let rim_term = u.rim_color.rgb * rim * 0.6;

    let lit_color = base_color.rgb * (u.ambient.rgb + vec3<f32>(shade)) + rim_term;
    return vec4<f32>(lit_color, base_color.a);
}
"#;

fn create_solid_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    color: [u8; 4],
) -> wgpu::Texture {
    device.create_texture_with_data(
        queue,
        &wgpu::TextureDescriptor {
            label: Some("solid_texture"),
            size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        },
        wgpu::util::TextureDataOrder::LayerMajor,
        &color,
    )
}

fn upload_rgba_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    width: u32,
    height: u32,
    rgba: &[u8],
) -> wgpu::Texture {
    device.create_texture_with_data(
        queue,
        &wgpu::TextureDescriptor {
            label: Some("uploaded_rgba_texture"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        },
        wgpu::util::TextureDataOrder::LayerMajor,
        rgba,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turntable_camera_matrices() {
        let cam = TurntableCamera::default();
        let view = cam.view_matrix();
        let proj = cam.proj_matrix();
        let vp = cam.view_proj_matrix();

        assert!(!view.is_nan());
        assert!(!proj.is_nan());
        assert!(!vp.is_nan());

        let eye = cam.eye_position();
        assert!(eye.length() > 0.0);
    }

    #[test]
    fn test_model_vertex_pod_size() {
        assert_eq!(std::mem::size_of::<ModelVertex>(), 32);
        assert_eq!(ModelVertex::LAYOUT.array_stride, 32);
    }
}
