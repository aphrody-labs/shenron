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
    EanAnimation, EanChannel, EanFile, EmbRgbaTexture, EmdFile, EskBone, LocalPose,
};

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

impl SkinnedCharacter {
    /// Builds a character from its skeleton and `(model, textures)` parts. Every submesh
    /// samples the part's texture named by its first sampler.
    pub fn new(bones: Vec<EskBone>, parts: Vec<(EmdFile, Vec<EmbRgbaTexture>)>) -> Self {
        let rest_locals: Vec<Mat4> = rest_pose(&bones).iter().map(local_matrix).collect();
        let rest_inverse = world_matrices(&bones, &rest_locals).iter().map(Mat4::inverse).collect();
        let mut textures = Vec::new();
        let mut out = Vec::new();
        for (emd, part_textures) in parts {
            let base = textures.len();
            let available = part_textures.len();
            textures.extend(part_textures);
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

/// GPU buffers of a [`SkinnedCharacter`]: one dynamic vertex buffer per part, rewritten by
/// [`Self::update`] and drawn through [`super::ModelServePipeline`].
pub struct SkinnedGpuCharacter {
    parts: Vec<(wgpu::Buffer, wgpu::Buffer, u32, wgpu::BindGroup)>,
    scratch: Vec<ModelVertex>,
}

impl SkinnedGpuCharacter {
    pub fn upload(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        character: &SkinnedCharacter,
        layout: &wgpu::BindGroupLayout,
    ) -> Self {
        use wgpu::util::DeviceExt;
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("xv2 sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            ..super::nearest_sampler_descriptor()
        });
        let texture = |width: u32, height: u32, rgba: &[u8]| {
            device
                .create_texture_with_data(
                    queue,
                    &wgpu::TextureDescriptor {
                        label: Some("xv2 texture"),
                        size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
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
                .create_view(&wgpu::TextureViewDescriptor::default())
        };
        let fallback = texture(1, 1, &[200, 200, 200, 255]);
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
                let view = part.texture.and_then(|t| views.get(t)).unwrap_or(&fallback);
                let material = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("xv2 material"),
                    layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::Sampler(&sampler),
                        },
                    ],
                });
                (vertices, indices, part.indices.len() as u32, material)
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

    /// Draws every part; the caller has bound the pipeline and its uniform group 0.
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
    fn rest_pose_leaves_vertices_in_place() {
        let emd =
            EmdFile::parse(&encode_emd("m", &[[2.0, 0.0, 0.0]; 3], &[0, 1, 2], &["arm"])).unwrap();
        let character = SkinnedCharacter::new(bones(), vec![(emd, Vec::new())]);
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
        let mut character = SkinnedCharacter::new(bones(), vec![(emd, Vec::new())]);
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
        let character = SkinnedCharacter::new(esk.bones, vec![(emd, textures)]);
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
    use crate::render::{GpuContext, ModelServePipeline, TurntableCamera};
    use shenron_re::formats::{EmbFile, EskFile};

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
            parts.push((emd, (0..emb.count).map(|i| emb.decode_rgba(i).unwrap()).collect()));
        }
        let esk = EskFile::parse(&read("APL_000.esk")).unwrap();
        let ean = EanFile::parse(&read("APL.ean")).unwrap();
        let character = SkinnedCharacter::new(esk.bones, parts);
        let animation = std::env::var("SHENRON_REAL_ANIM").unwrap_or("GOK_BAS_WALK".into());
        let bound = character.bind(&ean, ean.find(&animation).expect("animation"));

        let gpu = pollster::block_on(GpuContext::new_headless()).expect("adapter");
        let (device, queue) = (&gpu.device, &gpu.queue);
        let format = wgpu::TextureFormat::Rgba8UnormSrgb;
        let pipeline = ModelServePipeline::new(device, format);
        let mut model = SkinnedGpuCharacter::upload(
            device,
            queue,
            &character,
            &pipeline.material_bind_group_layout,
        );
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
        pipeline.update_camera(queue, &camera, Mat4::IDENTITY);
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
