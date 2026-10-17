// SPDX-License-Identifier: Apache-2.0

//! Shared wgpu pipeline of the Toriyama 3D models (Dragon Ball, Kinto-Un).
//!
//! Every model is one full-screen triangle and one fragment shader that ray-casts its signed
//! distance field, with a single uniform block. The models only differ by their WGSL and the
//! size of that block, so the pipeline, bind group and draw are written once here.

/// The 3D models of the measured Toriyama vectors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToriyamaModel {
    /// The crystal ball (`render::dragon_ball`).
    DragonBall,
    /// The flying nimbus (`render::kinto_un`).
    KintoUn,
}

impl ToriyamaModel {
    /// Parses the model name used by the JavaScript bindings.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "dragon-ball" => Some(Self::DragonBall),
            "kinto-un" => Some(Self::KintoUn),
            _ => None,
        }
    }

    /// WGSL source of the model.
    #[must_use]
    pub fn wgsl(self) -> &'static str {
        match self {
            Self::DragonBall => super::dragon_ball::DRAGON_BALL_WGSL,
            Self::KintoUn => super::kinto_un::KINTO_UN_WGSL,
        }
    }

    /// Builds the uniform bytes from the flat parameters, or `None` when they are invalid.
    #[must_use]
    pub fn uniforms(self, params: &[f32]) -> Option<ToriyamaUniforms> {
        match self {
            Self::DragonBall => super::dragon_ball::DragonBallUniforms::from_params(params)
                .map(ToriyamaUniforms::DragonBall),
            Self::KintoUn => {
                super::kinto_un::KintoUnUniforms::from_params(params).map(ToriyamaUniforms::KintoUn)
            },
        }
    }
}

/// Uniform block of one model.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ToriyamaUniforms {
    /// See [`super::dragon_ball::DragonBallUniforms`].
    DragonBall(super::dragon_ball::DragonBallUniforms),
    /// See [`super::kinto_un::KintoUnUniforms`].
    KintoUn(super::kinto_un::KintoUnUniforms),
}

impl ToriyamaUniforms {
    /// Sets the animation time (seconds) and the pointer tilt.
    pub fn set_frame(&mut self, time: f32, tilt_x: f32, tilt_y: f32) {
        match self {
            Self::DragonBall(u) => u.set_frame(time, tilt_x, tilt_y),
            Self::KintoUn(u) => u.set_frame(time, tilt_x, tilt_y),
        }
    }

    /// The bytes uploaded to the uniform buffer.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        match self {
            Self::DragonBall(u) => bytemuck::bytes_of(u),
            Self::KintoUn(u) => bytemuck::bytes_of(u),
        }
    }
}

/// Render pipeline of one model for one colour format (premultiplied alpha output).
pub struct ToriyamaPipeline {
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
}

impl ToriyamaPipeline {
    /// Compiles `model` and builds its pipeline; `uniform_size` is the byte size of its block.
    #[must_use]
    pub fn new(
        device: &wgpu::Device,
        format: wgpu::TextureFormat,
        model: ToriyamaModel,
        uniform_size: u64,
    ) -> Self {
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("toriyama 3d"),
            source: wgpu::ShaderSource::Wgsl(model.wgsl().into()),
        });
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("toriyama 3d uniforms"),
            size: uniform_size,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("toriyama 3d"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("toriyama 3d"),
            layout: &layout,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: uniforms.as_entire_binding() }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("toriyama 3d"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("toriyama 3d"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        Self { pipeline, uniforms, bind_group }
    }

    /// Uploads `uniforms` and records one draw into `view`, cleared to transparent.
    pub fn draw(
        &self,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        uniforms: &[u8],
    ) {
        queue.write_buffer(&self.uniforms, 0, uniforms);
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("toriyama 3d"),
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
        pass.draw(0..3, 0..1);
    }
}

/// Validates a WGSL source with naga, as wgpu does before compiling it (tests only).
#[cfg(test)]
pub(crate) fn validate_wgsl(source: &str) {
    let module = naga::front::wgsl::parse_str(source).expect("WGSL parses");
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&module)
    .expect("WGSL validates");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_names_round_trip() {
        assert_eq!(ToriyamaModel::from_name("dragon-ball"), Some(ToriyamaModel::DragonBall));
        assert_eq!(ToriyamaModel::from_name("kinto-un"), Some(ToriyamaModel::KintoUn));
        assert_eq!(ToriyamaModel::from_name("senzu"), None);
    }
}
