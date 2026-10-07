// SPDX-License-Identifier: Apache-2.0
//! Presenting a rendered frame to a window or a browser canvas.
//!
//! Vello cannot render into a swap-chain image (it writes with a compute shader), so a frame is
//! rendered into a [`crate::target::RenderTarget`] and copied to the surface by the
//! [`SurfaceBlitter`]. [`acquire`] turns wgpu's seven-way answer for "give me the next image"
//! into the four things a caller does: draw, draw and reconfigure, skip, reconfigure.

use wgpu::{
    Adapter, CurrentSurfaceTexture, Surface, SurfaceConfiguration, SurfaceTexture, TextureFormat,
};

use crate::error::{GpuError, Result};

/// The next image of a surface, classified.
pub enum Acquired {
    /// Draw into it, then present it.
    Ready(SurfaceTexture),
    /// Draw into it and present it, then reconfigure the surface: it no longer matches the window.
    Suboptimal(SurfaceTexture),
    /// Nothing to draw this time (timeout, window occluded): try again on the next frame.
    Retry,
    /// The surface is outdated or lost: reconfigure it, then try again.
    Reconfigure,
}

/// Asks the surface for its next image. A validation error is the only failure.
pub fn acquire(surface: &Surface<'_>) -> Result<Acquired> {
    match surface.get_current_texture() {
        CurrentSurfaceTexture::Success(texture) => Ok(Acquired::Ready(texture)),
        CurrentSurfaceTexture::Suboptimal(texture) => Ok(Acquired::Suboptimal(texture)),
        CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(Acquired::Retry),
        CurrentSurfaceTexture::Lost | CurrentSurfaceTexture::Outdated => Ok(Acquired::Reconfigure),
        CurrentSurfaceTexture::Validation => {
            Err(GpuError::Surface("acquiring the next surface image failed validation".into()))
        },
    }
}

/// The configuration of a surface of `width` x `height` pixels for `adapter`.
///
/// The format is a non-sRGB 8-bit one (`Rgba8Unorm`, `Bgra8Unorm`) whenever the surface offers it:
/// the blitter copies already encoded pixels, and an sRGB surface would encode them twice. The
/// present mode, alpha mode and color space keep wgpu's defaults.
pub fn surface_configuration(
    surface: &Surface<'_>,
    adapter: &Adapter,
    width: u32,
    height: u32,
) -> Result<SurfaceConfiguration> {
    let mut config = surface
        .get_default_config(adapter, width.max(1), height.max(1))
        .ok_or_else(|| GpuError::Surface("the adapter cannot present to this surface".into()))?;
    let formats = surface.get_capabilities(adapter).formats;
    let preferred = formats
        .iter()
        .copied()
        .find(|format| matches!(format, TextureFormat::Rgba8Unorm | TextureFormat::Bgra8Unorm))
        .or_else(|| formats.iter().copied().find(|format| !format.is_srgb()));
    if let Some(format) = preferred {
        config.format = format;
    }
    Ok(config)
}

/// Copies a rendered texture to a surface texture with a full-screen triangle.
pub struct SurfaceBlitter {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
}

const BLIT_SHADER: &str = r"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    var output: VertexOutput;
    output.uv = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    output.position = vec4<f32>(output.uv * 2.0 - 1.0, 0.0, 1.0);
    output.uv.y = 1.0 - output.uv.y;
    return output;
}

@group(0) @binding(0)
var source_texture: texture_2d<f32>;
@group(0) @binding(1)
var source_sampler: sampler;

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(source_texture, source_sampler, input.uv);
}
";

impl SurfaceBlitter {
    /// A blitter that writes surface textures of `format`.
    #[must_use]
    pub fn new(device: &wgpu::Device, format: TextureFormat) -> Self {
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("shenron blit sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("shenron blit bind group layout"),
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
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("shenron blit pipeline layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("shenron blit shader"),
            source: wgpu::ShaderSource::Wgsl(BLIT_SHADER.into()),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("shenron blit pipeline"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vertex"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fragment"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        Self { pipeline, bind_group_layout, sampler }
    }

    /// Records a pass that clears `target` and, when there is a `source`, draws it over the whole
    /// target. `source: None` presents a cleared (transparent) frame.
    pub fn copy(
        &self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        source: Option<&wgpu::TextureView>,
        target: &wgpu::TextureView,
    ) {
        let bind_group = source.map(|source| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("shenron blit bind group"),
                layout: &self.bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(source),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                ],
            })
        });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("shenron blit pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
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
        if let Some(bind_group) = bind_group.as_ref() {
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
    }
}
