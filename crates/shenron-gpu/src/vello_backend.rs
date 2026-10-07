// SPDX-License-Identifier: Apache-2.0
//! Vello on the shared device.
//!
//! One place builds a `vello::Renderer` (with the persistent pipeline cache and the antialiasing
//! modes the caller needs, so only those pipelines are compiled) and renders scenes into
//! [`crate::target::RenderTarget`] views.

use vello::peniko::Color;
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions, Scene};
use wgpu::TextureView;

use crate::context::GpuContext;
use crate::error::{GpuError, Result};

/// A Vello renderer bound to a [`GpuContext`]'s device.
pub struct VelloBackend {
    renderer: Renderer,
}

impl VelloBackend {
    /// Builds the renderer, compiling only the pipelines of `antialiasing` (area antialiasing
    /// alone is what page rendering uses: [`AaSupport::area_only`]).
    pub fn new(context: &GpuContext, antialiasing: AaSupport) -> Result<Self> {
        context.ensure_alive()?;
        let renderer = Renderer::new(
            context.device(),
            RendererOptions {
                antialiasing_support: antialiasing,
                pipeline_cache: context.pipeline_cache().cloned(),
                ..RendererOptions::default()
            },
        )
        .map_err(|error| GpuError::Vello(format!("creating the renderer failed: {error:?}")))?;
        Ok(Self { renderer })
    }

    /// The renderer, for callers that drive Vello themselves (compositors, image registration).
    pub fn renderer_mut(&mut self) -> &mut Renderer {
        &mut self.renderer
    }

    /// Renders `scene` into `view` (a storage-capable `Rgba8Unorm` view) over `base_color`.
    pub fn render(
        &mut self,
        context: &GpuContext,
        scene: &Scene,
        view: &TextureView,
        size: (u32, u32),
        base_color: Color,
        antialiasing: AaConfig,
    ) -> Result<()> {
        context.ensure_alive()?;
        let (width, height) = size;
        self.renderer
            .render_to_texture(
                context.device(),
                context.queue(),
                scene,
                view,
                &RenderParams { base_color, width, height, antialiasing_method: antialiasing },
            )
            .map_err(|error| GpuError::Vello(format!("rendering failed: {error:?}")))
    }
}
