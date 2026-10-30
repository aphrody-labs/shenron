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
use std::collections::HashMap;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Canvas base formats are non-sRGB in WebGPU. Register a compatible view so linear
/// shader output receives hardware sRGB encoding; already encoded vector art keeps Unorm.
/// Only the browser (wasm32) canvases use it; native builds compile it for the tests alone.
#[cfg(any(target_arch = "wasm32", test))]
pub(crate) fn canvas_view_format(
    surface_format: wgpu::TextureFormat,
    view_formats: &mut Vec<wgpu::TextureFormat>,
    linear_output: bool,
) -> wgpu::TextureFormat {
    let view = if linear_output {
        surface_format.add_srgb_suffix()
    } else {
        surface_format.remove_srgb_suffix()
    };
    if view != surface_format && !view_formats.contains(&view) {
        view_formats.push(view);
    }
    view
}

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
    pub camera_position: [f32; 4],
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
    pub instance_buffer: Arc<wgpu::Buffer>,
    pub instance_count: u32,
}

/// Original layout placement and its inverse-transpose normal transform.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct ModelInstance {
    pub model: [[f32; 4]; 4],
    pub normal: [[f32; 4]; 3],
}

impl ModelInstance {
    pub const LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Self>() as u64,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &wgpu::vertex_attr_array![3 => Float32x4, 4 => Float32x4, 5 => Float32x4,
            6 => Float32x4, 7 => Float32x4, 8 => Float32x4, 9 => Float32x4],
    };

    pub fn from_columns(columns: [f32; 16]) -> Result<Self, &'static str> {
        let matrix = Mat4::from_cols_array(&columns);
        if !matrix.is_finite()
            || columns[3].abs() > 1e-6
            || columns[7].abs() > 1e-6
            || columns[11].abs() > 1e-6
            || (columns[15] - 1.0).abs() > 1e-6
        {
            return Err("Instance matrix must be a finite affine column-major mat4");
        }
        let linear = glam::Mat3::from_mat4(matrix);
        if linear.determinant().abs() < 1e-12 {
            return Err("Instance matrix is singular");
        }
        let normal = linear.inverse().transpose();
        if !normal.is_finite() {
            return Err("Instance normal matrix is not finite");
        }
        Ok(Self {
            model: matrix.to_cols_array_2d(),
            normal: [
                normal.x_axis.extend(0.0).to_array(),
                normal.y_axis.extend(0.0).to_array(),
                normal.z_axis.extend(0.0).to_array(),
            ],
        })
    }
}

/// A GPU-resident character model containing one or more primitives.
pub struct GpuCharacterModel {
    pub name: String,
    pub primitives: Vec<GpuPrimitive>,
}

/// EMD packs U/min in the low nibble and V/mag in the high nibble.
/// Format evidence: LibXenoverse EMDSubmeshDefinition and XV2-Tools EMD_TextureSamplerDef.
fn emd_sampler_descriptor(
    sampler: shenron_re::formats::emd::EmdSampler,
) -> Result<wgpu::SamplerDescriptor<'static>, &'static str> {
    let address = |value| match value {
        0 => Ok(wgpu::AddressMode::Repeat),
        1 => Ok(wgpu::AddressMode::MirrorRepeat),
        2 => Ok(wgpu::AddressMode::ClampToEdge),
        _ => Err("Unsupported EMD texture addressing mode"),
    };
    let filter = |value| match value {
        0 | 1 => Ok(wgpu::FilterMode::Nearest),
        2 => Ok(wgpu::FilterMode::Linear),
        _ => Err("Unsupported EMD texture filtering mode"),
    };
    Ok(wgpu::SamplerDescriptor {
        label: Some("original_emd_sampler"),
        address_mode_u: address(sampler.addressing & 0x0f)?,
        address_mode_v: address(sampler.addressing >> 4)?,
        min_filter: filter(sampler.filtering & 0x0f)?,
        mag_filter: filter(sampler.filtering >> 4)?,
        ..nearest_sampler_descriptor()
    })
}

impl GpuCharacterModel {
    /// Reject invalid or over-limit source data before creating any GPU resource.
    pub fn validate_for_upload(
        model: &AssembledCharacterModel,
        limits: &wgpu::Limits,
    ) -> Result<(), &'static str> {
        for texture in &model.textures {
            if texture.width == 0
                || texture.height == 0
                || texture.width > limits.max_texture_dimension_2d
                || texture.height > limits.max_texture_dimension_2d
            {
                return Err("Model texture exceeds the device's 2D texture limit");
            }
            let expected = (texture.width as usize)
                .checked_mul(texture.height as usize)
                .and_then(|pixels| pixels.checked_mul(4));
            if expected != Some(texture.rgba.len()) {
                return Err("Model texture does not contain the declared RGBA pixels");
            }
        }
        for primitive in &model.primitives {
            let count = primitive.positions.len();
            if primitive.normals.len() != count || primitive.uv.len() != count {
                return Err("Model vertex attributes have different lengths");
            }
            if primitive.indices.len() % 3 != 0
                || primitive.indices.iter().any(|&index| index as usize >= count)
            {
                return Err("Model contains invalid triangle indices");
            }
            if primitive
                .positions
                .iter()
                .flatten()
                .chain(primitive.normals.iter().flatten())
                .chain(primitive.uv.iter().flatten())
                .any(|value| !value.is_finite())
            {
                return Err("Model vertex attribute is not finite");
            }
            let vertex_bytes = count.checked_mul(std::mem::size_of::<ModelVertex>());
            let index_bytes = primitive.indices.len().checked_mul(std::mem::size_of::<u32>());
            if [vertex_bytes, index_bytes]
                .iter()
                .any(|size| size.is_none_or(|size| size as u64 > limits.max_buffer_size))
                || primitive.indices.len() > u32::MAX as usize
            {
                return Err("Model buffer exceeds the device's buffer limit");
            }
            if primitive.texture_index.is_some_and(|index| index >= model.textures.len()) {
                return Err("Model primitive references a missing texture");
            }
            if let Some(sampler) = primitive.sampler {
                emd_sampler_descriptor(sampler)?;
            }
        }
        Ok(())
    }

    /// Uploads an `AssembledCharacterModel` into GPU memory buffers.
    pub fn upload(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        model: &AssembledCharacterModel,
        bind_group_layout: &wgpu::BindGroupLayout,
    ) -> Self {
        Self::upload_instanced(device, queue, model, bind_group_layout, &[])
    }

    /// An empty outer list preserves the historical single identity placement.
    pub fn validate_instances(
        placements: &[Vec<[f32; 16]>],
        primitive_count: usize,
        limits: &wgpu::Limits,
    ) -> Result<(), &'static str> {
        if !placements.is_empty() && placements.len() != primitive_count {
            return Err("Instance placement count differs from primitive count");
        }
        if limits.max_vertex_buffers < 2
            || limits.max_vertex_attributes < 10
            || limits.max_vertex_buffer_array_stride < std::mem::size_of::<ModelInstance>() as u32
        {
            return Err("Device cannot bind the model instance vertex layout");
        }
        for instances in placements {
            if instances.is_empty()
                || instances.len() > 4096
                || (instances.len() as u64 * std::mem::size_of::<ModelInstance>() as u64)
                    > limits.max_buffer_size
            {
                return Err("Instance buffer exceeds the supported count or device limit");
            }
            for matrix in instances {
                ModelInstance::from_columns(*matrix)?;
            }
        }
        Ok(())
    }

    /// Upload each geometry once; equal placement arrays share a single GPU buffer.
    pub fn upload_instanced(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        model: &AssembledCharacterModel,
        bind_group_layout: &wgpu::BindGroupLayout,
        placements: &[Vec<[f32; 16]>],
    ) -> Self {
        let mut gpu_prims = Vec::new();
        let mut instance_buffers: HashMap<Vec<u32>, Arc<wgpu::Buffer>> = HashMap::new();

        // Create default 1x1 white texture for untextured materials
        let default_texture = create_solid_texture(device, queue, [220, 220, 220, 255]);
        let default_view = default_texture.create_view(&wgpu::TextureViewDescriptor::default());
        // Pixel perfect contract: nearest, no mip, clamp to edge.
        let default_sampler = device.create_sampler(&nearest_sampler_descriptor());
        let mut samplers = HashMap::new();

        // Upload textures
        let mut texture_views = Vec::new();
        for tex in &model.textures {
            // Native size, single mip level, `Rgba8UnormSrgb` (EMB color data).
            let gpu_tex = upload_rgba_texture(device, queue, tex.width, tex.height, &tex.rgba);
            let view = gpu_tex.create_view(&wgpu::TextureViewDescriptor::default());
            texture_views.push(view);
        }

        for (primitive_index, prim) in model.primitives.iter().enumerate() {
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
            let sampler: &wgpu::Sampler = if let Some(source) = prim.sampler {
                let key = (source.addressing, source.filtering);
                samplers.entry(key).or_insert_with(|| {
                    device.create_sampler(
                        &emd_sampler_descriptor(source)
                            .expect("EMD sampler must pass validate_for_upload before upload"),
                    )
                })
            } else {
                &default_sampler
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
                        resource: wgpu::BindingResource::Sampler(sampler),
                    },
                ],
            });

            let identity = [Mat4::IDENTITY.to_cols_array()];
            let matrices =
                placements.get(primitive_index).map_or(identity.as_slice(), Vec::as_slice);
            let key = matrices.iter().flatten().map(|value| value.to_bits()).collect::<Vec<_>>();
            let instance_buffer = Arc::clone(instance_buffers.entry(key).or_insert_with(|| {
                let instances = matrices
                    .iter()
                    .map(|matrix| {
                        ModelInstance::from_columns(*matrix)
                            .expect("instance placement must pass preflight")
                    })
                    .collect::<Vec<_>>();
                Arc::new(device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("original_stage_instances"),
                    contents: bytemuck::cast_slice(&instances),
                    usage: wgpu::BufferUsages::VERTEX,
                }))
            }));
            gpu_prims.push(GpuPrimitive {
                vertex_buffer,
                index_buffer,
                index_count: prim.indices.len() as u32,
                index_format: wgpu::IndexFormat::Uint32,
                bind_group: Some(bind_group),
                instance_buffer,
                instance_count: matrices.len() as u32,
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
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
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
                buffers: &[Some(ModelVertex::LAYOUT), Some(ModelInstance::LAYOUT)],
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
            camera_position: camera.eye_position().extend(1.0).to_array(),
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
    camera_position: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var t_diffuse: texture_2d<f32>;
@group(1) @binding(1) var s_diffuse: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) model0: vec4<f32>,
    @location(4) model1: vec4<f32>,
    @location(5) model2: vec4<f32>,
    @location(6) model3: vec4<f32>,
    @location(7) normal0: vec4<f32>,
    @location(8) normal1: vec4<f32>,
    @location(9) normal2: vec4<f32>,
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
    let placement = mat4x4<f32>(in.model0, in.model1, in.model2, in.model3);
    let normal_placement = mat3x3<f32>(in.normal0.xyz, in.normal1.xyz, in.normal2.xyz);
    let world_pos = u.model * placement * vec4<f32>(in.position, 1.0);
    out.clip_position = u.view_proj * world_pos;
    out.world_normal = normalize((u.model * vec4<f32>(normal_placement * in.normal, 0.0)).xyz);
    out.uv = in.uv;
    out.view_dir = normalize(u.camera_position.xyz - world_pos.xyz);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base_color = textureSampleLevel(t_diffuse, s_diffuse, in.uv, 0.0);
    // Fully transparent source pixels must not write depth and hide the world behind them.
    if (base_color.a <= 0.001) { discard; }

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
    fn canvas_views_encode_linear_texture_rendering_without_double_encoding_vector_art() {
        let mut views = Vec::new();
        assert_eq!(
            canvas_view_format(wgpu::TextureFormat::Bgra8Unorm, &mut views, true),
            wgpu::TextureFormat::Bgra8UnormSrgb
        );
        assert_eq!(views, vec![wgpu::TextureFormat::Bgra8UnormSrgb]);
        canvas_view_format(wgpu::TextureFormat::Bgra8Unorm, &mut views, true);
        assert_eq!(views.len(), 1);
        assert_eq!(
            canvas_view_format(wgpu::TextureFormat::Bgra8Unorm, &mut views, false),
            wgpu::TextureFormat::Bgra8Unorm
        );
        assert_eq!(
            canvas_view_format(wgpu::TextureFormat::Rgba8Unorm, &mut views, true),
            wgpu::TextureFormat::Rgba8UnormSrgb
        );
        assert_eq!(
            canvas_view_format(wgpu::TextureFormat::Rgba16Float, &mut views, true),
            wgpu::TextureFormat::Rgba16Float
        );
    }

    /// Exercises the actual compatible-view hardware conversion, not a CPU-only palette check.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn srgb_output_view_encodes_source_colour_when_gpu_test_enabled() {
        if std::env::var("SHENRON_GPU_COLOR_TEST").as_deref() != Ok("1") {
            return;
        }
        let gpu = pollster::block_on(crate::render::GpuContext::new_headless())
            .expect("GPU colour adapter");
        let (device, queue) = (&gpu.device, &gpu.queue);
        let mut formats = Vec::new();
        let format = canvas_view_format(wgpu::TextureFormat::Rgba8Unorm, &mut formats, true);
        let size = wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 };
        let target = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("unorm canvas with srgb view"),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &formats,
        });
        let view = target.create_view(&wgpu::TextureViewDescriptor {
            format: Some(format),
            ..Default::default()
        });
        let readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 256,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let decode = |value: u8| {
            let encoded = value as f64 / 255.0;
            if encoded <= 0.04045 { encoded / 12.92 } else { ((encoded + 0.055) / 1.055).powf(2.4) }
        };
        for source in [[255u8, 99, 33], [55, 79, 109]] {
            let mut encoder = device.create_command_encoder(&Default::default());
            {
                let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("linear clear through canvas srgb view"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &view,
                        depth_slice: None,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color {
                                r: decode(source[0]),
                                g: decode(source[1]),
                                b: decode(source[2]),
                                a: 1.0,
                            }),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
            }
            encoder.copy_texture_to_buffer(
                target.as_image_copy(),
                wgpu::TexelCopyBufferInfo {
                    buffer: &readback,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(256),
                        rows_per_image: None,
                    },
                },
                size,
            );
            queue.submit([encoder.finish()]);
            readback.slice(..).map_async(wgpu::MapMode::Read, |result| result.unwrap());
            device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            let actual = readback.slice(..).get_mapped_range().unwrap()[..4].to_vec();
            readback.unmap();
            for channel in 0..3 {
                assert!(
                    (actual[channel] as i32 - source[channel] as i32).abs() <= 1,
                    "sRGB output mismatch: {source:?} -> {actual:?}"
                );
            }
            assert_eq!(actual[3], 255);
        }
    }

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

    #[test]
    fn emd_sampler_preserves_independent_axes_and_filters() {
        use shenron_re::formats::emd::EmdSampler;
        let sampler =
            EmdSampler { texture_index: 0, addressing: 0x21, filtering: 0x12, scale: [2.0, 3.0] };
        let descriptor = emd_sampler_descriptor(sampler).unwrap();
        assert_eq!(descriptor.address_mode_u, wgpu::AddressMode::MirrorRepeat);
        assert_eq!(descriptor.address_mode_v, wgpu::AddressMode::ClampToEdge);
        assert_eq!(descriptor.min_filter, wgpu::FilterMode::Linear);
        assert_eq!(descriptor.mag_filter, wgpu::FilterMode::Nearest);
        assert_eq!(
            emd_sampler_descriptor(EmdSampler { addressing: 0, ..sampler }).unwrap().address_mode_u,
            wgpu::AddressMode::Repeat
        );
        assert!(emd_sampler_descriptor(EmdSampler { addressing: 0x30, ..sampler }).is_err());
        assert!(emd_sampler_descriptor(EmdSampler { filtering: 0xf0, ..sampler }).is_err());
    }

    #[test]
    fn model_upload_preflight_rejects_device_limit_and_corrupt_pixels() {
        use shenron_re::formats::{EmbRgbaTexture, TexturePixelFormat};
        let mut model = AssembledCharacterModel {
            name: "stage".into(),
            primitives: vec![],
            textures: vec![EmbRgbaTexture {
                width: 2,
                height: 2,
                rgba: vec![255; 16],
                format: TexturePixelFormat::Rgba8,
            }],
            skeleton: None,
        };
        let mut limits = wgpu::Limits::default();
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_ok());
        limits.max_texture_dimension_2d = 1;
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_err());
        limits.max_texture_dimension_2d = 2;
        model.textures[0].rgba.pop();
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_err());
    }

    #[test]
    fn model_upload_preflight_rejects_oversized_geometry_buffers() {
        let bytes = shenron_re::formats::emd::encode_emd(
            "stage",
            &[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            &[0, 1, 2],
            &[],
        );
        let emd = shenron_re::formats::EmdFile::parse(&bytes).unwrap();
        let mut model = AssembledCharacterModel::assemble("stage", &emd, None, None, None);
        let mut limits = wgpu::Limits::default();
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_ok());
        limits.max_buffer_size = 16;
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_err());
        limits.max_buffer_size = 1024;
        model.primitives[0].uv[0][0] = f32::NAN;
        assert!(GpuCharacterModel::validate_for_upload(&model, &limits).is_err());
    }

    #[test]
    fn cel_shader_and_camera_uniform_layout_are_valid() {
        assert_eq!(std::mem::size_of::<ModelUniforms>(), 192);
        let module = naga::front::wgsl::parse_str(CEL_SHADING_WGSL).expect("parse cel shader");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::empty(),
        )
        .validate(&module)
        .expect("validate cel shader");
    }

    #[test]
    fn instances_preserve_placement_and_inverse_transpose_normals() {
        let matrix = Mat4::from_scale_rotation_translation(
            Vec3::new(2.0, 3.0, 4.0),
            glam::Quat::from_rotation_y(0.7),
            Vec3::new(10.0, 20.0, 30.0),
        );
        let instance = ModelInstance::from_columns(matrix.to_cols_array()).unwrap();
        assert_eq!(std::mem::size_of::<ModelInstance>(), 112);
        assert_eq!(ModelInstance::LAYOUT.array_stride, 112);
        assert_eq!(Mat4::from_cols_array_2d(&instance.model), matrix);
        let normal = glam::Mat3::from_cols_array_2d(
            &instance.normal.map(|column| [column[0], column[1], column[2]]),
        );
        let tangent = matrix.transform_vector3(Vec3::new(1.0, 1.0, 0.0));
        let perpendicular = normal * Vec3::new(1.0, -1.0, 0.0);
        assert!(tangent.dot(perpendicular).abs() < 1e-5);
        let limits = wgpu::Limits::default();
        assert!(
            GpuCharacterModel::validate_instances(&[vec![matrix.to_cols_array(); 173]], 1, &limits)
                .is_ok()
        );
        assert!(GpuCharacterModel::validate_instances(&[vec![]], 1, &limits).is_err());
        assert!(
            GpuCharacterModel::validate_instances(&[vec![matrix.to_cols_array()]], 2, &limits)
                .is_err()
        );
        let mut small = limits.clone();
        small.max_vertex_attributes = 9;
        assert!(GpuCharacterModel::validate_instances(&[], 1, &small).is_err());
        let mut bad = matrix.to_cols_array();
        bad[3] = 1.0;
        assert!(ModelInstance::from_columns(bad).is_err());
        assert!(ModelInstance::from_columns(Mat4::ZERO.to_cols_array()).is_err());
        bad[3] = 0.0;
        bad[0] = f32::NAN;
        assert!(ModelInstance::from_columns(bad).is_err());
    }
}
