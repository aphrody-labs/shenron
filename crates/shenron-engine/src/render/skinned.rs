// SPDX-License-Identifier: Apache-2.0

//! Skinned DBXV2 characters: an `.esk` skeleton, `.emd` parts with their `.emb` textures and
//! `.ean` animations sampled on the CPU into skinned vertices.
//!
//! Each bone's local transform is `T · R · S`; world transforms compose from the root. A skin
//! matrix is `world(pose) · world(rest)⁻¹`, and a vertex blends up to four of them by weight.
//! Animation nodes address the `.ean` skeleton and are matched to the model's bones by name.

use super::model_serve::ModelVertex;
use glam::{Mat4, Quat, Vec3};
use shenron_re::formats::{
    EanAnimation, EanChannel, EanFile, EmbRgbaTexture, EmdFile, EmmFile, EmmMaterial, EskBone,
    LocalPose,
};

/// One `.emd` model of a character with its `.emb` textures, optional `.emm` materials and
/// the selected ramp of its `.dyt.emb` dye package.
#[derive(Debug, Clone)]
pub struct CharacterPart {
    pub model: EmdFile,
    pub textures: Vec<EmbRgbaTexture>,
    pub materials: Option<EmmFile>,
    pub dye: Option<EmbRgbaTexture>,
}

impl CharacterPart {
    pub fn new(model: EmdFile, textures: Vec<EmbRgbaTexture>) -> Self {
        Self { model, textures, materials: None, dye: None }
    }
}

/// One drawable submesh with its rest geometry and skinning data in skeleton bone indices.
#[derive(Debug, Clone)]
pub struct SkinnedPart {
    pub name: String,
    pub positions: Vec<Vec3>,
    pub normals: Vec<Vec3>,
    pub uv: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
    pub joints: Vec<[u16; 4]>,
    pub weights: Vec<[f32; 4]>,
    /// Index into [`SkinnedCharacter::textures`].
    pub texture: Option<usize>,
    /// Dye ramp texture (index into [`SkinnedCharacter::textures`]) and its line.
    pub dye: Option<(usize, u32)>,
    /// Original named material, retained for the verified STAIN shader parameters.
    pub material: Option<EmmMaterial>,
}

/// A character ready to pose: skeleton, rest inverses, parts and decoded textures.
#[derive(Debug, Clone)]
pub struct SkinnedCharacter {
    pub bones: Vec<EskBone>,
    rest_inverse: Vec<Mat4>,
    pub parts: Vec<SkinnedPart>,
    pub textures: Vec<EmbRgbaTexture>,
}

/// Animation nodes resolved to the character's bones.
#[derive(Debug, Clone)]
pub struct BoundAnimation {
    pub name: String,
    pub frame_count: u32,
    animation: EanAnimation,
    /// For each animation-skeleton bone, the character bone with the same name.
    bone_map: Vec<Option<usize>>,
}

fn local_matrix(pose: &LocalPose) -> Mat4 {
    let r = Quat::from_array(pose.rotation);
    let r = if r.length_squared() > f32::EPSILON { r.normalize() } else { Quat::IDENTITY };
    Mat4::from_scale_rotation_translation(
        Vec3::from_array(pose.scale),
        r,
        Vec3::from_array(pose.translation),
    )
}

/// World matrices of every bone; parents may follow their children in the table.
fn world_matrices(bones: &[EskBone], locals: &[Mat4]) -> Vec<Mat4> {
    let mut world: Vec<Option<Mat4>> = vec![None; bones.len()];
    fn resolve(
        i: usize,
        bones: &[EskBone],
        locals: &[Mat4],
        world: &mut [Option<Mat4>],
        depth: usize,
    ) -> Mat4 {
        if let Some(m) = world[i] {
            return m;
        }
        let parent = match bones[i].parent_index {
            Some(p) if p != i && depth < bones.len() => resolve(p, bones, locals, world, depth + 1),
            _ => Mat4::IDENTITY,
        };
        let m = parent * locals[i];
        world[i] = Some(m);
        m
    }
    (0..bones.len()).map(|i| resolve(i, bones, locals, &mut world, 0)).collect()
}

fn rest_pose(bones: &[EskBone]) -> Vec<LocalPose> {
    bones
        .iter()
        .map(|b| LocalPose { translation: b.translation, rotation: b.rotation, scale: b.scale })
        .collect()
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum SkeletonMergeError {
    #[error("Ambiguous skeleton bone: {0}")]
    Ambiguous(String),
    #[error("Secondary bone has no existing attachment: {0}")]
    Unattached(String),
    #[error("Invalid secondary skeleton hierarchy or transform: {0}")]
    Invalid(String),
    #[error("Character skeleton exceeds 65535 bones")]
    TooManyBones,
}

/// Attach required secondary bones to exact shared names in the main skeleton.
/// Shared bones are attachment markers, not replacements for the main character rig.
/// New descendants retain their original local rest transforms; no SCD physics is inferred.
/// Validation is atomic: an incompatible part leaves the caller's skeleton unchanged.
pub fn merge_secondary_skeleton(
    bones: &mut Vec<EskBone>,
    secondary: &[EskBone],
    required: &[String],
) -> Result<(), SkeletonMergeError> {
    use std::collections::{HashMap, HashSet};
    let mut names = HashMap::new();
    for (index, bone) in bones.iter().enumerate() {
        if names.insert(bone.name.clone(), index).is_some() {
            return Err(SkeletonMergeError::Ambiguous(bone.name.clone()));
        }
    }
    let mut source_names = HashMap::new();
    for (index, bone) in secondary.iter().enumerate() {
        if source_names.insert(bone.name.as_str(), index).is_some() {
            return Err(SkeletonMergeError::Ambiguous(bone.name.clone()));
        }
    }
    fn attach(
        index: usize,
        source: &[EskBone],
        merged: &mut Vec<EskBone>,
        names: &mut HashMap<String, usize>,
        visiting: &mut HashSet<usize>,
    ) -> Result<usize, SkeletonMergeError> {
        let bone =
            source.get(index).ok_or_else(|| SkeletonMergeError::Invalid(index.to_string()))?;
        if let Some(&target) = names.get(&bone.name) {
            return Ok(target);
        }
        if !visiting.insert(index) || visiting.len() > 256 {
            return Err(SkeletonMergeError::Invalid(bone.name.clone()));
        }
        let pose =
            LocalPose { translation: bone.translation, rotation: bone.rotation, scale: bone.scale };
        if !bone.translation.iter().chain(&bone.rotation).chain(&bone.scale).all(|v| v.is_finite())
            || Quat::from_array(bone.rotation).length_squared() <= f32::EPSILON
            || bone.scale.iter().any(|v| v.abs() <= f32::EPSILON)
            || !local_matrix(&pose).is_finite()
        {
            return Err(SkeletonMergeError::Invalid(bone.name.clone()));
        }
        let parent =
            bone.parent_index.ok_or_else(|| SkeletonMergeError::Unattached(bone.name.clone()))?;
        let parent = attach(parent, source, merged, names, visiting)?;
        if merged.len() >= u16::MAX as usize {
            return Err(SkeletonMergeError::TooManyBones);
        }
        visiting.remove(&index);
        let index = merged.len();
        let mut appended = bone.clone();
        appended.index = index;
        appended.parent_index = Some(parent);
        merged.push(appended);
        names.insert(bone.name.clone(), index);
        Ok(index)
    }
    let mut merged = bones.clone();
    for name in required {
        if names.contains_key(name) {
            continue;
        }
        let index = source_names
            .get(name.as_str())
            .ok_or_else(|| SkeletonMergeError::Unattached(name.clone()))?;
        attach(*index, secondary, &mut merged, &mut names, &mut HashSet::new())?;
    }
    *bones = merged;
    Ok(())
}

impl SkinnedCharacter {
    /// Builds a character from its skeleton and parts. Every submesh samples the part's
    /// texture named by its first sampler, and the dye line of its same-named material.
    pub fn new(bones: Vec<EskBone>, parts: Vec<CharacterPart>) -> Self {
        let rest_locals: Vec<Mat4> = rest_pose(&bones).iter().map(local_matrix).collect();
        let rest_inverse = world_matrices(&bones, &rest_locals).iter().map(Mat4::inverse).collect();
        let mut textures = Vec::new();
        let mut out = Vec::new();
        for CharacterPart { model: emd, textures: part_textures, materials, dye } in parts {
            let base = textures.len();
            let available = part_textures.len();
            textures.extend(part_textures);
            let dye_texture = dye.map(|d| {
                textures.push(d);
                textures.len() - 1
            });
            for sub in emd.submeshes() {
                let palette: Vec<u16> = sub
                    .bone_names
                    .iter()
                    .map(|n| bones.iter().position(|b| b.name == *n).unwrap_or(0) as u16)
                    .collect();
                let count = sub.vertices.len();
                let mut part = SkinnedPart {
                    name: sub.name.clone(),
                    positions: Vec::with_capacity(count),
                    normals: Vec::with_capacity(count),
                    uv: Vec::with_capacity(count),
                    indices: sub.indices.clone(),
                    joints: Vec::with_capacity(count),
                    weights: Vec::with_capacity(count),
                    texture: sub
                        .samplers
                        .first()
                        .map(|s| s.texture_index as usize)
                        .filter(|&t| t < available)
                        .map(|t| base + t),
                    dye: dye_texture.zip(
                        materials
                            .as_ref()
                            .and_then(|m| m.find(&sub.material_name))
                            .and_then(|m| m.dye_line()),
                    ),
                    material: materials.as_ref().and_then(|m| m.find(&sub.material_name)).cloned(),
                };
                for v in &sub.vertices {
                    part.positions.push(Vec3::from_array(v.position));
                    part.normals.push(Vec3::from_array(v.normal).normalize_or(Vec3::Y));
                    part.uv.push(v.uv);
                    let local = v.bone_indices.unwrap_or([0; 4]);
                    part.joints.push(local.map(|j| *palette.get(j as usize).unwrap_or(&0)));
                    part.weights.push(v.bone_weights.unwrap_or([1.0, 0.0, 0.0, 0.0]));
                }
                out.push(part);
            }
        }
        Self { bones, rest_inverse, parts: out, textures }
    }

    /// Resolves one animation of `ean` against this character's bones by name.
    pub fn bind(&self, ean: &EanFile, animation: &EanAnimation) -> BoundAnimation {
        let bone_map = ean
            .skeleton
            .iter()
            .map(|b| self.bones.iter().position(|own| own.name == b.name))
            .collect();
        BoundAnimation {
            name: animation.name.clone(),
            frame_count: animation.frame_count,
            animation: animation.clone(),
            bone_map,
        }
    }

    /// Skin matrices at `frame` (rest pose when `animation` is `None`).
    pub fn skin_matrices(&self, animation: Option<&BoundAnimation>, frame: f32) -> Vec<Mat4> {
        let mut pose = rest_pose(&self.bones);
        if let Some(bound) = animation {
            for node in &bound.animation.nodes {
                let Some(Some(target)) = bound.bone_map.get(node.bone_index) else { continue };
                let local = &mut pose[*target];
                for component in &node.components {
                    let Some(v) = component.sample(frame) else { continue };
                    match component.channel {
                        EanChannel::Translation => local.translation = [v[0], v[1], v[2]],
                        EanChannel::Rotation => local.rotation = v,
                        EanChannel::Scale => local.scale = [v[0], v[1], v[2]],
                        EanChannel::Other(_) => {},
                    }
                }
            }
        }
        let locals: Vec<Mat4> = pose.iter().map(local_matrix).collect();
        world_matrices(&self.bones, &locals)
            .into_iter()
            .zip(&self.rest_inverse)
            .map(|(world, inverse)| world * *inverse)
            .collect()
    }

    /// Skinned vertices of `part` for the given skin matrices.
    pub fn skin(&self, part: &SkinnedPart, skin: &[Mat4], out: &mut Vec<ModelVertex>) {
        out.clear();
        out.reserve(part.positions.len());
        for i in 0..part.positions.len() {
            let mut m = Mat4::ZERO;
            let mut total = 0.0;
            for k in 0..4 {
                let w = part.weights[i][k];
                if w > 0.0
                    && let Some(s) = skin.get(part.joints[i][k] as usize)
                {
                    m += *s * w;
                    total += w;
                }
            }
            if total <= f32::EPSILON {
                m = Mat4::IDENTITY;
            } else if (total - 1.0).abs() > 1e-4 {
                m *= 1.0 / total;
            }
            out.push(ModelVertex {
                position: m.transform_point3(part.positions[i]).to_array(),
                normal: m.transform_vector3(part.normals[i]).normalize_or(Vec3::Y).to_array(),
                uv: part.uv[i],
            });
        }
    }

    /// Center and radius of the rest-pose bounds, for framing.
    pub fn bounds(&self) -> (Vec3, f32) {
        self.posed_bounds(&self.skin_matrices(None, 0.0))
    }

    /// Center and radius of the bounds once skinned by `skin`.
    pub fn posed_bounds(&self, skin: &[Mat4]) -> (Vec3, f32) {
        let mut min = Vec3::splat(f32::MAX);
        let mut max = Vec3::splat(f32::MIN);
        let mut out = Vec::new();
        for part in &self.parts {
            self.skin(part, skin, &mut out);
            for v in &out {
                let p = Vec3::from_array(v.position);
                min = min.min(p);
                max = max.max(p);
            }
        }
        if min.x > max.x {
            return (Vec3::new(0.0, 0.9, 0.0), 1.0);
        }
        ((min + max) * 0.5, ((max - min).length() * 0.5).max(0.01))
    }
}

/// Camera and light uniforms of the toon pipeline (same layout as [`super::ModelUniforms`]).
pub type ToonUniforms = super::ModelUniforms;

/// Per-part material uniforms: dye ramp row (texture v), whether a dye ramp applies.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ToonMaterial {
    pub dye_v: f32,
    pub has_dye: f32,
    pub stain_count: f32,
    pub edge_scale: f32,
    pub stain0: [f32; 4],
    pub stain1: [f32; 4],
    pub stain2: [f32; 4],
    pub stain_weights: [f32; 4],
}

impl ToonMaterial {
    pub fn for_line(line: Option<u32>, dye_height: u32) -> Self {
        match line {
            Some(l) if dye_height > 0 => Self {
                // Original TOON_UNIF_STAIN2_DFD pixel shader: line * 0.125 + 0.015625.
                // Normalized addressing is independent of the DDS raster dimensions.
                dye_v: l as f32 * 0.125 + 0.015625,
                has_dye: 1.0,
                stain_count: 0.0,
                edge_scale: 0.0,
                stain0: [0.0; 4],
                stain1: [0.0; 4],
                stain2: [0.0; 4],
                stain_weights: [0.0; 4],
            },
            _ => Self {
                dye_v: 0.0,
                has_dye: 0.0,
                stain_count: 0.0,
                edge_scale: 0.0,
                stain0: [0.0; 4],
                stain1: [0.0; 4],
                stain2: [0.0; 4],
                stain_weights: [0.0; 4],
            },
        }
    }

    /// Only the three original STAIN1/2/3_DFD programs inspected in the CPK are supported.
    /// Other programs keep their palette without an invented ink or stain multiplier.
    pub fn for_material(
        line: Option<u32>,
        dye_height: u32,
        material: Option<&EmmMaterial>,
    ) -> Self {
        let mut uniforms = Self::for_line(line, dye_height);
        let Some(material) = material else { return uniforms };
        uniforms.stain_count = match material.shader_program.as_str() {
            "TOON_UNIF_STAIN1_DFD" => 1.0,
            "TOON_UNIF_STAIN2_DFD" => 2.0,
            "TOON_UNIF_STAIN3_DFD" => 3.0,
            _ => return uniforms,
        };
        let color = |index| {
            [
                material.parameter(&format!("MatCol{index}R")).unwrap_or(0.0),
                material.parameter(&format!("MatCol{index}G")).unwrap_or(0.0),
                material.parameter(&format!("MatCol{index}B")).unwrap_or(0.0),
                material.parameter(&format!("MatCol{index}A")).unwrap_or(1.0),
            ]
        };
        uniforms.stain0 = color(0);
        uniforms.stain1 = color(1);
        uniforms.stain2 = color(2);
        uniforms.stain_weights = [
            material.parameter("MatCol3R").unwrap_or(0.0),
            material.parameter("MatCol3G").unwrap_or(0.0),
            0.0,
            0.0,
        ];
        uniforms.edge_scale = material.parameter("MatScale1W").unwrap_or(1.0);
        uniforms
    }
}

/// The original STAIN2 diffuse ramp maps the full clamped half-Lambert term to DYT U.
/// The source mask is sampled as data; its channels must not receive sRGB decoding.
pub const XV2_TOON_WGSL: &str = r#"
struct Uniforms {
    view_proj: mat4x4<f32>,
    model: mat4x4<f32>,
    light_dir: vec3<f32>,
    rim_power: f32,
    ambient: vec4<f32>,
    rim_color: vec4<f32>,
};
struct Material {
    dye_v: f32, has_dye: f32, stain_count: f32, edge_scale: f32,
    stain0: vec4<f32>, stain1: vec4<f32>, stain2: vec4<f32>, stain_weights: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var t_line: texture_2d<f32>;
@group(1) @binding(1) var s_linear: sampler;
@group(1) @binding(2) var t_dye: texture_2d<f32>;
@group(1) @binding(3) var<uniform> m: Material;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) clip_w: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world = u.model * vec4<f32>(in.position, 1.0);
    out.clip_position = u.view_proj * world;
    out.clip_w = out.clip_position.w;
    out.world_normal = normalize((u.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.uv = in.uv;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let line = textureSampleLevel(t_line, s_linear, in.uv, 0.0);
    let n_dot_l = dot(normalize(in.world_normal), normalize(u.light_dir));
    var color: vec3<f32>;
    if (m.has_dye > 0.5) {
        let ramp_u = clamp((n_dot_l + 1.0) * 0.5, 0.0, 1.0);
        color = textureSampleLevel(t_dye, s_linear, vec2<f32>(ramp_u, m.dye_v), 0.0).rgb;
        if (m.stain_count > 0.5) {
            // Original STAIN pixel shader with unit-scale character transforms.
            // XenoKit's g_vParam7 = (0, 23.2558, 0.04587, 0) controls the detail threshold.
            let detail = 0.04587 * (1.0 - smoothstep(0.0, 23.2558, in.clip_w)) * m.edge_scale;
            var stain = mix(vec3<f32>(1.0), m.stain0.rgb, step(0.5 + detail, line.a));
            if (m.stain_count > 1.5) {
                stain = mix(stain, m.stain1.rgb, line.r * m.stain_weights.x);
            }
            if (m.stain_count > 2.5) {
                stain = mix(stain, m.stain2.rgb, line.g * m.stain_weights.y);
            }
            color *= stain;
        }
    } else {
        color = line.rgb * (u.ambient.rgb + vec3<f32>(select(0.55, 1.0, n_dot_l > 0.15)));
    }
    return vec4<f32>(color, 1.0);
}
"#;

/// Render pipeline for [`XV2_TOON_WGSL`].
pub struct Xv2ToonPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub material_layout: wgpu::BindGroupLayout,
}

impl Xv2ToonPipeline {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("xv2 toon"),
            source: wgpu::ShaderSource::Wgsl(XV2_TOON_WGSL.into()),
        });
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("xv2 toon uniforms"),
            size: std::mem::size_of::<ToonUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let uniform = |binding, visibility| wgpu::BindGroupLayoutEntry {
            binding,
            visibility,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        };
        let texture = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("xv2 toon camera"),
            entries: &[uniform(0, wgpu::ShaderStages::VERTEX_FRAGMENT)],
        });
        let material_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("xv2 toon material"),
            entries: &[
                texture(0),
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                texture(2),
                uniform(3, wgpu::ShaderStages::FRAGMENT),
            ],
        });
        let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("xv2 toon camera"),
            layout: &uniform_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("xv2 toon"),
            bind_group_layouts: &[Some(&uniform_layout), Some(&material_layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("xv2 toon"),
            layout: Some(&layout),
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
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState { cull_mode: None, ..Default::default() },
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
        Self { pipeline, uniform_buffer, uniform_bind_group, material_layout }
    }

    /// Camera uniforms; the key light sits above the camera.
    pub fn update_camera(&self, queue: &wgpu::Queue, camera: &super::TurntableCamera) {
        let toward_eye = (camera.eye_position() - camera.target).normalize_or(Vec3::Z);
        let uniforms = ToonUniforms {
            view_proj: camera.view_proj_matrix().to_cols_array_2d(),
            model: Mat4::IDENTITY.to_cols_array_2d(),
            light_dir: (toward_eye + Vec3::Y).normalize().to_array(),
            rim_power: 3.5,
            ambient_color: [0.25, 0.25, 0.28, 1.0],
            rim_color: [1.0, 0.88, 0.6, 1.0],
            camera_position: camera.eye_position().extend(1.0).to_array(),
        };
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));
    }
}

/// GPU buffers of a [`SkinnedCharacter`]: one dynamic vertex buffer per part, rewritten by
/// [`Self::update`] and drawn through [`Xv2ToonPipeline`].
pub struct SkinnedGpuCharacter {
    parts: Vec<(wgpu::Buffer, wgpu::Buffer, u32, wgpu::BindGroup)>,
    scratch: Vec<ModelVertex>,
}

impl SkinnedGpuCharacter {
    pub fn upload(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        character: &SkinnedCharacter,
        pipeline: &Xv2ToonPipeline,
    ) -> Self {
        use wgpu::util::DeviceExt;
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("xv2 sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let texture = |width: u32, height: u32, rgba: &[u8]| {
            let texture = device.create_texture_with_data(
                queue,
                &wgpu::TextureDescriptor {
                    label: Some("xv2 texture"),
                    size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                    view_formats: &[wgpu::TextureFormat::Rgba8UnormSrgb],
                },
                wgpu::util::TextureDataOrder::LayerMajor,
                rgba,
            );
            // One upload, two compatible views: masks are data, diffuse/DYT are sRGB colors.
            (
                texture.create_view(&wgpu::TextureViewDescriptor::default()),
                texture.create_view(&wgpu::TextureViewDescriptor {
                    format: Some(wgpu::TextureFormat::Rgba8UnormSrgb),
                    ..Default::default()
                }),
            )
        };
        let fallback = texture(1, 1, &[200, 200, 200, 0]);
        let views: Vec<_> =
            character.textures.iter().map(|t| texture(t.width, t.height, &t.rgba)).collect();
        let skin = character.skin_matrices(None, 0.0);
        let mut scratch = Vec::new();
        let parts = character
            .parts
            .iter()
            .filter(|p| !p.indices.is_empty())
            .map(|part| {
                character.skin(part, &skin, &mut scratch);
                let vertices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(&part.name),
                    contents: bytemuck::cast_slice(&scratch),
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                });
                let indices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(&part.name),
                    contents: bytemuck::cast_slice(&part.indices),
                    usage: wgpu::BufferUsages::INDEX,
                });
                let line = part.texture.and_then(|t| views.get(t)).unwrap_or(&fallback);
                let line = if part.dye.is_some() { &line.0 } else { &line.1 };
                let dye = &part.dye.and_then(|(t, _)| views.get(t)).unwrap_or(&fallback).1;
                let dye_height =
                    part.dye.and_then(|(t, _)| character.textures.get(t)).map_or(0, |t| t.height);
                let material = ToonMaterial::for_material(
                    part.dye.map(|(_, l)| l),
                    dye_height,
                    part.material.as_ref(),
                );
                let material = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("xv2 material"),
                    contents: bytemuck::cast_slice(&[material]),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
                let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("xv2 material"),
                    layout: &pipeline.material_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(line),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::Sampler(&sampler),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::TextureView(dye),
                        },
                        wgpu::BindGroupEntry { binding: 3, resource: material.as_entire_binding() },
                    ],
                });
                (vertices, indices, part.indices.len() as u32, group)
            })
            .collect();
        Self { parts, scratch }
    }

    /// Re-skins every part with `skin` and uploads the vertices.
    pub fn update(&mut self, queue: &wgpu::Queue, character: &SkinnedCharacter, skin: &[Mat4]) {
        let drawn = character.parts.iter().filter(|p| !p.indices.is_empty());
        for (part, (buffer, ..)) in drawn.zip(&self.parts) {
            character.skin(part, skin, &mut self.scratch);
            queue.write_buffer(buffer, 0, bytemuck::cast_slice(&self.scratch));
        }
    }

    /// Draws every part; the caller has bound the pipeline and its camera group 0.
    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>) {
        for (vertices, indices, count, material) in &self.parts {
            pass.set_bind_group(1, material, &[]);
            pass.set_vertex_buffer(0, vertices.slice(..));
            pass.set_index_buffer(indices.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..*count, 0, 0..1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shenron_re::formats::EskFile;
    use shenron_re::formats::emd::encode_emd;

    fn bones() -> Vec<EskBone> {
        vec![
            EskBone { name: "root".into(), ..Default::default() },
            EskBone {
                index: 1,
                name: "arm".into(),
                parent_index: Some(0),
                translation: [1.0, 0.0, 0.0],
                ..Default::default()
            },
        ]
    }

    #[test]
    fn toon_shader_validates_and_material_uniform_layout_matches_wgsl() {
        let module =
            naga::front::wgsl::parse_str(XV2_TOON_WGSL).expect("parse original-ramp shader");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::empty(),
        )
        .validate(&module)
        .expect("validate original-ramp shader");
        let material =
            module.types.iter().find(|(_, ty)| ty.name.as_deref() == Some("Material")).unwrap().1;
        let naga::TypeInner::Struct { members, span } = &material.inner else {
            panic!("material must be a struct")
        };
        assert_eq!(*span as usize, std::mem::size_of::<ToonMaterial>());
        assert_eq!(
            members.iter().map(|member| member.offset).collect::<Vec<_>>(),
            [0, 4, 8, 12, 16, 32, 48, 64]
        );
        for line in 0..8 {
            let expected = line as f32 / 8.0 + 1.0 / 64.0;
            assert_eq!(ToonMaterial::for_line(Some(line), 128).dye_v, expected);
            assert_eq!(ToonMaterial::for_line(Some(line), 256).dye_v, expected);
        }
        assert_eq!(ToonMaterial::for_line(None, 128).has_dye, 0.0);
        assert_eq!(ToonMaterial::for_line(Some(0), 0).has_dye, 0.0);
    }

    #[test]
    fn original_goku_material_rows_select_orange_gi_and_blue_boots_when_provided() {
        use shenron_re::formats::{EmbFile, EmmFile};
        let Ok(dir) = std::env::var("SHENRON_REAL_GOK_MATERIALS") else { return };
        for (part, name, normal_dot_light, expected) in [
            ("Bust", "dougi_syatu", 0.6875f32, [224u8, 53, 0]),
            ("Boots", "boots_A", 0.90625, [55, 79, 109]),
        ] {
            let read = |extension: &str| {
                std::fs::read(format!("{dir}/GOK_000_{part}.{extension}")).unwrap()
            };
            let materials = EmmFile::parse(&read("emm")).unwrap();
            let material = materials.find(name).unwrap();
            let palette = EmbFile::parse(&read("dyt.emb")).unwrap().decode_rgba(0).unwrap();
            let uniforms =
                ToonMaterial::for_material(material.dye_line(), palette.height, Some(material));
            assert_eq!(uniforms.stain_count, 2.0);
            assert_eq!(uniforms.stain0, [0.0, 0.0, 0.0, 1.0]);
            assert_eq!(uniforms.stain1, [0.0, 0.0, 0.0, 1.0]);
            assert_eq!(uniforms.stain_weights[0], 0.0);
            assert_eq!(uniforms.edge_scale, 1.0);
            // Original DXBC add +1, mul_sat *0.5, then sample t4 at the material row.
            let u = ((normal_dot_light + 1.0) * 0.5).clamp(0.0, 1.0);
            let x = (u * palette.width as f32).floor() as usize;
            let y = (uniforms.dye_v * palette.height as f32).floor() as usize;
            let pixel = &palette.rgba[(y * palette.width as usize + x) * 4..][..3];
            for (&actual, expected) in pixel.iter().zip(expected) {
                assert!(actual.abs_diff(expected) <= 2, "{part}/{name}: {pixel:?}");
            }
        }
    }

    #[test]
    fn stains_are_selected_by_verified_shader_and_keep_authored_colors_and_weights() {
        use shenron_re::formats::emm::encode_emm;
        let materials = EmmFile::parse(&encode_emm(&[
            (
                "skin",
                "TOON_UNIF_STAIN3_DFD",
                &[
                    ("MatScale1X", 3.0),
                    ("MatCol0R", 0.1),
                    ("MatCol1G", 0.25),
                    ("MatCol2B", 0.75),
                    ("MatCol3R", 0.0),
                    ("MatCol3G", 0.5),
                    ("MatScale1W", 0.8),
                ],
            ),
            ("unverified", "TOON_UNIF_STAIN3_UNKNOWN", &[("MatScale1X", 0.0)]),
        ]))
        .unwrap();
        let skin = materials.find("skin").unwrap();
        let material = ToonMaterial::for_material(skin.dye_line(), 128, Some(skin));
        assert_eq!(material.stain_count, 3.0);
        assert_eq!(material.stain0[0], 0.1);
        assert_eq!(material.stain1[1], 0.25);
        assert_eq!(material.stain2[2], 0.75);
        assert_eq!(material.stain_weights, [0.0, 0.5, 0.0, 0.0]);
        assert_eq!(material.edge_scale, 0.8);
        let unknown = materials.find("unverified").unwrap();
        assert_eq!(
            ToonMaterial::for_material(unknown.dye_line(), 128, Some(unknown)).stain_count,
            0.0
        );
    }

    #[test]
    fn secondary_bones_follow_the_real_attachment_and_preserve_rest_vertices() {
        let mut main = bones();
        let secondary = vec![
            EskBone { name: "arm".into(), ..Default::default() },
            EskBone {
                index: 1,
                name: "hair".into(),
                parent_index: Some(0),
                translation: [0.0, 0.5, 0.0],
                ..Default::default()
            },
        ];
        merge_secondary_skeleton(&mut main, &secondary, &["hair".into()]).unwrap();
        assert_eq!(main.len(), 3);
        assert_eq!(main[1].translation, [1.0, 0.0, 0.0]);
        assert_eq!(main[2].parent_index, Some(1));
        assert_eq!(main[2].translation, [0.0, 0.5, 0.0]);
        let model =
            EmdFile::parse(&encode_emd("hair", &[[1.0, 0.5, 0.0]; 3], &[0, 1, 2], &["hair"]))
                .unwrap();
        let mut character =
            SkinnedCharacter::new(main, vec![CharacterPart::new(model, Vec::new())]);
        let mut output = Vec::new();
        character.skin(&character.parts[0], &character.skin_matrices(None, 0.0), &mut output);
        assert!((Vec3::from_array(output[0].position) - Vec3::new(1.0, 0.5, 0.0)).length() < 1e-5);
        character.bones[1].rotation = Quat::from_rotation_z(std::f32::consts::FRAC_PI_2).to_array();
        character.skin(&character.parts[0], &character.skin_matrices(None, 0.0), &mut output);
        assert!((Vec3::from_array(output[0].position) - Vec3::new(0.5, 0.0, 0.0)).length() < 1e-5);
    }

    #[test]
    fn secondary_merge_rejects_ambiguous_unattached_cyclic_and_invalid_rigs_atomically() {
        let mut main = bones();
        let before = main.len();
        let mut secondary = vec![
            EskBone { name: "arm".into(), ..Default::default() },
            EskBone { index: 1, name: "hair".into(), parent_index: Some(0), ..Default::default() },
        ];
        assert!(merge_secondary_skeleton(&mut main, &secondary, &["missing".into()]).is_err());
        secondary[1].parent_index = Some(1);
        assert!(merge_secondary_skeleton(&mut main, &secondary, &["hair".into()]).is_err());
        secondary[1].parent_index = None;
        assert!(merge_secondary_skeleton(&mut main, &secondary, &["hair".into()]).is_err());
        secondary[1].parent_index = Some(0);
        secondary[1].translation[0] = f32::NAN;
        assert!(merge_secondary_skeleton(&mut main, &secondary, &["hair".into()]).is_err());
        secondary[1].translation[0] = 0.0;
        secondary.push(secondary[1].clone());
        assert!(merge_secondary_skeleton(&mut main, &secondary, &["hair".into()]).is_err());
        assert_eq!(main.len(), before);
    }

    #[test]
    fn merges_real_goku_hair_when_provided() {
        let Ok(dir) = std::env::var("SHENRON_REAL_GOK_HAIR") else { return };
        let read = |name: &str| std::fs::read(format!("{dir}/{name}")).unwrap();
        let mut main = EskFile::parse(&read("GOK_000.esk")).unwrap().bones;
        let original_len = main.len();
        let secondary = EskFile::parse(&read("GOK_000_hair_scd.esk")).unwrap();
        let model = EmdFile::parse(&read("GOK_000_hair_scd.emd")).unwrap();
        let required: Vec<String> =
            model.submeshes().flat_map(|sub| sub.bone_names.clone()).collect();
        merge_secondary_skeleton(&mut main, &secondary.bones, &required).unwrap();
        assert_eq!(main.len(), original_len + 10);
        for name in &required {
            assert!(main.iter().any(|bone| &bone.name == name));
        }
        let head = main.iter().position(|bone| bone.name == "b_C_Head").unwrap();
        let character = SkinnedCharacter::new(main, vec![CharacterPart::new(model, Vec::new())]);
        let ean = EanFile::parse(&read("GOK.ean")).unwrap();
        let animation = character.bind(&ean, ean.find("GOK_BAS_WALK").unwrap());
        assert!(animation.bone_map.iter().flatten().all(|index| *index < original_len));
        let rest_locals: Vec<Mat4> = rest_pose(&character.bones).iter().map(local_matrix).collect();
        let rest_world = world_matrices(&character.bones, &rest_locals);
        let source_head = secondary.bones.iter().position(|bone| bone.name == "b_C_Head").unwrap();
        let mut relative_rest = Vec::new();
        for (source_index, source) in secondary.bones.iter().enumerate() {
            if !source.name.starts_with("SCD_Hair_") {
                continue;
            }
            let mut cursor = source_index;
            let mut relative = Mat4::IDENTITY;
            while cursor != source_head {
                let bone = &secondary.bones[cursor];
                let pose = LocalPose {
                    translation: bone.translation,
                    rotation: bone.rotation,
                    scale: bone.scale,
                };
                relative = local_matrix(&pose) * relative;
                cursor = bone.parent_index.expect("hair chain must reach original head marker");
            }
            let target = character.bones.iter().position(|bone| bone.name == source.name).unwrap();
            relative_rest.push((target, relative));
        }
        assert_eq!(relative_rest.len(), 10);
        let mut output = Vec::new();
        let mut initial_head: Option<Vec3> = None;
        let mut moved_head = false;
        for frame in [0.0, 10.0, 35.0, 69.0] {
            let matrices = character.skin_matrices(Some(&animation), frame);
            assert!(matrices[head].is_finite());
            let head_world = matrices[head] * rest_world[head];
            let head_position = head_world.transform_point3(Vec3::ZERO);
            if let Some(initial) = initial_head {
                moved_head |= (head_position - initial).length() > 1e-5;
            } else {
                initial_head = Some(head_position);
            }
            for (target, relative) in &relative_rest {
                let expected = head_world * *relative;
                let actual = matrices[*target] * rest_world[*target];
                let error = actual
                    .to_cols_array()
                    .iter()
                    .zip(expected.to_cols_array())
                    .map(|(a, b)| (a - b).abs())
                    .fold(0.0f32, f32::max);
                assert!(error < 1e-4, "{} frame {frame}: {error}", character.bones[*target].name);
            }
            for part in &character.parts {
                assert!(part.joints.iter().all(|joints| joints.iter().all(|joint| *joint != 0)));
                character.skin(part, &matrices, &mut output);
                assert!(!output.is_empty());
                assert!(output.iter().all(|v| Vec3::from_array(v.position).is_finite()));
            }
        }
        assert!(moved_head, "the original walk animation must actually move the attachment");
    }

    #[test]
    fn rest_pose_leaves_vertices_in_place() {
        let emd =
            EmdFile::parse(&encode_emd("m", &[[2.0, 0.0, 0.0]; 3], &[0, 1, 2], &["arm"])).unwrap();
        let character = SkinnedCharacter::new(bones(), vec![CharacterPart::new(emd, Vec::new())]);
        let skin = character.skin_matrices(None, 0.0);
        let mut out = Vec::new();
        character.skin(&character.parts[0], &skin, &mut out);
        assert!((Vec3::from_array(out[0].position) - Vec3::new(2.0, 0.0, 0.0)).length() < 1e-5);
        assert_eq!(character.parts[0].joints[0][0], 1);
    }

    #[test]
    fn rotating_a_bone_moves_its_vertices() {
        let emd =
            EmdFile::parse(&encode_emd("m", &[[2.0, 0.0, 0.0]; 3], &[0, 1, 2], &["arm"])).unwrap();
        let mut character =
            SkinnedCharacter::new(bones(), vec![CharacterPart::new(emd, Vec::new())]);
        // Rotate the arm 90° around Z: the vertex one unit along the arm swings to +Y.
        let q = Quat::from_rotation_z(std::f32::consts::FRAC_PI_2);
        character.bones[1].rotation = q.to_array();
        let skin = character.skin_matrices(None, 0.0);
        let mut out = Vec::new();
        character.skin(&character.parts[0], &skin, &mut out);
        assert!((Vec3::from_array(out[0].position) - Vec3::new(1.0, 1.0, 0.0)).length() < 1e-5);
    }
}

/// `SHENRON_REAL_CHARA=<dir>` with `APL_000.esk`, `APL_000_Bust.emd`, `APL_000_Bust.emb` and
/// `APL.ean` from the game poses a real character through every frame of its first animations.
#[cfg(test)]
mod real {
    use super::*;
    use shenron_re::formats::{EmbFile, EskFile};

    #[test]
    fn poses_real_character_when_provided() {
        let Ok(dir) = std::env::var("SHENRON_REAL_CHARA") else { return };
        let read = |name: &str| std::fs::read(format!("{dir}/{name}")).unwrap();
        let esk = EskFile::parse(&read("APL_000.esk")).unwrap();
        let emd = EmdFile::parse(&read("APL_000_Bust.emd")).unwrap();
        let emb = EmbFile::parse(&read("APL_000_Bust.emb")).unwrap();
        let textures = (0..emb.count).map(|i| emb.decode_rgba(i).unwrap()).collect();
        let ean = EanFile::parse(&read("APL.ean")).unwrap();
        let character = SkinnedCharacter::new(esk.bones, vec![CharacterPart::new(emd, textures)]);
        let (center, radius) = character.bounds();
        assert!(character.parts.iter().all(|p| p.texture.is_some()));
        let mut out = Vec::new();
        for animation in ean.animations.iter().take(8) {
            let bound = character.bind(&ean, animation);
            assert!(bound.bone_map.iter().filter(|m| m.is_some()).count() > 10);
            for frame in 0..bound.frame_count {
                let skin = character.skin_matrices(Some(&bound), frame as f32);
                for part in &character.parts {
                    character.skin(part, &skin, &mut out);
                    for v in &out {
                        let p = Vec3::from_array(v.position);
                        assert!(p.is_finite());
                        assert!((p - center).length() < radius * 6.0, "{} {p}", bound.name);
                    }
                }
            }
        }
    }
}

/// `SHENRON_REAL_CHARA=<dir>` and `SHENRON_RENDER_OUT=<png>` render the real character
/// mid-animation on a native adapter, for visual inspection.
#[cfg(all(test, not(target_arch = "wasm32")))]
mod render_real {
    use super::*;
    use crate::render::{GpuContext, TurntableCamera};
    use shenron_re::formats::{EmbFile, EmmFile, EskFile};

    #[test]
    fn renders_real_character_when_provided() {
        let (Ok(dir), Ok(out)) =
            (std::env::var("SHENRON_REAL_CHARA"), std::env::var("SHENRON_RENDER_OUT"))
        else {
            return;
        };
        let read = |name: &str| std::fs::read(format!("{dir}/{name}")).unwrap();
        let mut parts = Vec::new();
        for name in std::env::var("SHENRON_REAL_PARTS").unwrap_or("APL_000_Bust".into()).split(',')
        {
            let emd = EmdFile::parse(&read(&format!("{name}.emd"))).unwrap();
            let emb = EmbFile::parse(&read(&format!("{name}.emb"))).unwrap();
            let mut part = CharacterPart::new(
                emd,
                (0..emb.count).map(|i| emb.decode_rgba(i).unwrap()).collect(),
            );
            let optional = |name: String| std::fs::read(format!("{dir}/{name}")).ok();
            part.materials = optional(format!("{name}.emm")).map(|b| EmmFile::parse(&b).unwrap());
            part.dye = optional(format!("{name}.dyt.emb"))
                .map(|b| EmbFile::parse(&b).unwrap().decode_rgba(0).unwrap());
            parts.push(part);
        }
        let esk = EskFile::parse(&read("APL_000.esk")).unwrap();
        let ean = EanFile::parse(&read("APL.ean")).unwrap();
        let character = SkinnedCharacter::new(esk.bones, parts);
        let animation = std::env::var("SHENRON_REAL_ANIM").unwrap_or("GOK_BAS_WALK".into());
        let bound = character.bind(&ean, ean.find(&animation).expect("animation"));

        let gpu = pollster::block_on(GpuContext::new_headless()).expect("adapter");
        let (device, queue) = (&gpu.device, &gpu.queue);
        let format = wgpu::TextureFormat::Rgba8UnormSrgb;
        let pipeline = Xv2ToonPipeline::new(device, format);
        let mut model = SkinnedGpuCharacter::upload(device, queue, &character, &pipeline);
        let skin = character.skin_matrices(Some(&bound), 20.0);
        model.update(queue, &character, &skin);
        let (center, radius) = character.posed_bounds(&skin);
        let camera = TurntableCamera {
            target: center,
            distance: radius * 3.0,
            aspect_ratio: 1.0,
            z_near: 0.01,
            ..Default::default()
        };
        pipeline.update_camera(queue, &camera);
        let size = wgpu::Extent3d { width: 512, height: 512, depth_or_array_layers: 1 };
        let target = device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let depth = device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let (view, depth_view) =
            (target.create_view(&Default::default()), depth.create_view(&Default::default()));
        let readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 512 * 512 * 4,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.05, g: 0.06, b: 0.1, a: 1.0 }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &depth_view,
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
            model.draw(&mut pass);
        }
        encoder.copy_texture_to_buffer(
            target.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(512 * 4),
                    rows_per_image: None,
                },
            },
            size,
        );
        queue.submit([encoder.finish()]);
        readback.slice(..).map_async(wgpu::MapMode::Read, |r| r.unwrap());
        device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
        let pixels = readback.slice(..).get_mapped_range().unwrap().to_vec();
        let background =
            pixels.as_chunks::<4>().0.iter().filter(|p| p[2] < 40 && p[0] < 20).count();
        assert!(background < 512 * 512 * 98 / 100, "nothing drawn");
        image::save_buffer(out, &pixels, 512, 512, image::ColorType::Rgba8).unwrap();
    }
}
