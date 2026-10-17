// SPDX-License-Identifier: Apache-2.0

//! Headless GPU path of the pixel perfect contract: a pixel-aligned textured quad drawn with the
//! nearest sampler, then read back byte for byte. [`render_sprite_rgba`] is what the golden
//! tests compare to the software reference ([`super::pixel_perfect::Framebuffer`]).

use super::pixel_perfect::{
    PixelTexture, blend_state, nearest_sampler_descriptor, pixel_rect_to_clip,
};
use wgpu::util::DeviceExt;

const SPRITE_WGSL: &str = r#"
struct Rect { clip: vec4<f32> };
@group(0) @binding(0) var<uniform> r: Rect;
@group(0) @binding(1) var t: texture_2d<f32>;
@group(0) @binding(2) var s: sampler;

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VOut {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    );
    let c = corners[i];
    var o: VOut;
    o.pos = vec4<f32>(mix(r.clip.x, r.clip.z, c.x), mix(r.clip.y, r.clip.w, c.y), 0.0, 1.0);
    o.uv = c;
    return o;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
    return textureSampleLevel(t, s, in.uv, 0.0);
}
"#;

#[derive(Debug, thiserror::Error)]
pub enum SpriteGpuError {
    #[error("readback failed: {0}")]
    Readback(String),
}

/// Draws `tex` at whole-pixel `(x, y)` magnified by the integer `scale` into a transparent
/// `width x height` target whose format matches the texture color space, and returns the tightly
/// packed RGBA8 bytes read back from it.
#[allow(clippy::too_many_arguments)]
pub fn render_sprite_rgba(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    tex: &PixelTexture,
    x: i32,
    y: i32,
    scale: u32,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, SpriteGpuError> {
    let format = tex.wgpu_format();
    let clip = pixel_rect_to_clip(x, y, tex.width * scale, tex.height * scale, width, height);
    let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("sprite_rect"),
        contents: bytemuck::cast_slice(&clip),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let gpu_tex = tex.upload(device, queue);
    let view = gpu_tex.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = device.create_sampler(&nearest_sampler_descriptor());

    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("sprite_bgl"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
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
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::NonFiltering),
                count: None,
            },
        ],
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("sprite_bg"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: uniform.as_entire_binding() },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("sprite_shader"),
        source: wgpu::ShaderSource::Wgsl(SPRITE_WGSL.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("sprite_pl"),
        bind_group_layouts: &[Some(&layout)],
        immediate_size: 0,
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("sprite_pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(blend_state(tex.alpha)),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    });

    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("sprite_target"),
        size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let padded = (width * 4).div_ceil(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT)
        * wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("sprite_readback"),
        size: u64::from(padded) * u64::from(height),
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let mut encoder = device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("sprite_encoder") });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("sprite_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &target_view,
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
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..6, 0..1);
    }
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &target,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded),
                rows_per_image: None,
            },
        },
        wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
    );
    let submission = queue.submit(Some(encoder.finish()));

    let (sender, receiver) = std::sync::mpsc::channel();
    readback.slice(..).map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    device
        .poll(wgpu::PollType::Wait { submission_index: Some(submission), timeout: None })
        .map_err(|e| SpriteGpuError::Readback(e.to_string()))?;
    receiver
        .recv()
        .map_err(|_| SpriteGpuError::Readback("channel closed".into()))?
        .map_err(|e| SpriteGpuError::Readback(e.to_string()))?;
    let mapped = readback
        .slice(..)
        .get_mapped_range()
        .map_err(|e| SpriteGpuError::Readback(e.to_string()))?;
    let mut out = Vec::with_capacity(width as usize * height as usize * 4);
    for row in 0..height as usize {
        let start = row * padded as usize;
        out.extend_from_slice(&mapped[start..start + width as usize * 4]);
    }
    drop(mapped);
    readback.unmap();
    Ok(out)
}
