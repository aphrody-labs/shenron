// SPDX-License-Identifier: Apache-2.0

//! Low-level GPU hardware abstraction and wgpu 30 context.
//!
//! Provides device initialization, feature detection (indirect multi-draw,
//! compute shaders, float32 filtering), queue management, and surface configuration.

use std::sync::Arc;
use thiserror::Error;
use wgpu::{
    Adapter, Backends, Device, DeviceDescriptor, Features, Instance, InstanceDescriptor, Limits,
    PowerPreference, Queue, RequestAdapterOptions, TextureFormat, TextureUsages,
};

/// Errors encountered during GPU initialization.
#[derive(Debug, Error)]
pub enum GpuError {
    /// Failed to find a suitable GPU adapter.
    #[error("Failed to find a compatible GPU adapter matching requirements")]
    AdapterNotFound,
    /// Failed to request logical device.
    #[error("Failed to request logical device: {0}")]
    DeviceRequestFailed(#[from] wgpu::RequestDeviceError),
    /// Surface creation error.
    #[error("Surface creation error: {0}")]
    SurfaceError(#[from] wgpu::CreateSurfaceError),
}

/// Core GPU context encapsulating wgpu device, queue, and capabilities.
pub struct GpuContext {
    /// The wgpu logical device.
    pub device: Arc<Device>,
    /// The primary GPU command queue.
    pub queue: Arc<Queue>,
    /// Adapter metadata and capabilities.
    pub adapter: Adapter,
    /// Backing wgpu instance.
    pub instance: Instance,
    /// Indicates whether Multi-Draw Indirect is natively supported on hardware.
    pub supports_multi_draw_indirect: bool,
    /// Indicates whether bindless texture arrays are supported.
    pub supports_bindless: bool,
}

impl GpuContext {
    /// Initializes a headless or compute-focused GPU context.
    pub async fn new_headless() -> Result<Self, GpuError> {
        let instance = Instance::new(InstanceDescriptor {
            backends: Backends::PRIMARY,
            ..InstanceDescriptor::new_without_display_handle()
        });

        let adapter = instance
            .request_adapter(&RequestAdapterOptions {
                power_preference: PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(|_| GpuError::AdapterNotFound)?;

        let supported_features = adapter.features();
        let supports_multi_draw_indirect =
            supported_features.contains(Features::MULTI_DRAW_INDIRECT_COUNT);
        let supports_bindless = supported_features.contains(Features::TEXTURE_BINDING_ARRAY);

        let mut required_features = Features::empty();
        if supports_multi_draw_indirect {
            required_features |= Features::MULTI_DRAW_INDIRECT_COUNT;
        }

        let (device, queue) = adapter
            .request_device(&DeviceDescriptor {
                label: Some("ShenronEngine_Device"),
                required_features,
                required_limits: Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
                ..Default::default()
            })
            .await?;

        Ok(Self {
            device: Arc::new(device),
            queue: Arc::new(queue),
            adapter,
            instance,
            supports_multi_draw_indirect,
            supports_bindless,
        })
    }

    /// Initializes a GPU context with a custom `DeviceRequest` (compatible with aphrody-gpu-backend).
    pub async fn new_with_request(
        request: super::gpu_backend::DeviceRequest<'_>,
    ) -> Result<Self, GpuError> {
        let instance = Instance::new(InstanceDescriptor {
            backends: Backends::PRIMARY,
            ..InstanceDescriptor::new_without_display_handle()
        });

        let adapter = instance
            .request_adapter(&RequestAdapterOptions {
                power_preference: PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(|_| GpuError::AdapterNotFound)?;

        let supported_features = adapter.features();
        let supports_multi_draw_indirect =
            supported_features.contains(Features::MULTI_DRAW_INDIRECT_COUNT);
        let supports_bindless = supported_features.contains(Features::TEXTURE_BINDING_ARRAY);

        let required_limits = match request.limits {
            super::gpu_backend::DeviceLimits::Adapter => adapter.limits(),
            super::gpu_backend::DeviceLimits::DownlevelWithAdapterResolution => {
                Limits::downlevel_defaults().using_resolution(adapter.limits())
            },
        };

        let mut required_features = Features::empty();
        if supports_multi_draw_indirect {
            required_features |= Features::MULTI_DRAW_INDIRECT_COUNT;
        }

        let (device, queue) = adapter
            .request_device(&DeviceDescriptor {
                label: request.label,
                required_features,
                required_limits,
                memory_hints: wgpu::MemoryHints::Performance,
                ..Default::default()
            })
            .await?;

        Ok(Self {
            device: Arc::new(device),
            queue: Arc::new(queue),
            adapter,
            instance,
            supports_multi_draw_indirect,
            supports_bindless,
        })
    }

    /// Generates a structured hardware and capabilities report.
    #[must_use]
    pub fn report(&self) -> super::gpu_backend::GpuReport {
        let limits = self.device.limits();
        let info = self.adapter.get_info();
        super::gpu_backend::GpuReport {
            adapters: vec![super::gpu_backend::AdapterReport::new(&info)],
            selected: Some(super::gpu_backend::AdapterReport::new(&info)),
            limits: Some(super::gpu_backend::ComputeLimits {
                max_storage_buffer_binding_size: limits.max_storage_buffer_binding_size,
                max_compute_workgroups_per_dimension: limits.max_compute_workgroups_per_dimension,
                max_compute_invocations_per_workgroup: limits.max_compute_invocations_per_workgroup,
                max_buffer_size: limits.max_buffer_size,
            }),
            error: None,
        }
    }

    /// Runs a WGSL compute job using this context's device and queue.
    pub fn run_compute(
        &self,
        job: super::gpu_backend::WgslJob<'_>,
    ) -> Result<Vec<u8>, super::gpu_backend::GpuBackendError> {
        super::gpu_backend::run_wgsl_compute(&self.device, &self.queue, job)
    }

    /// Creates a 2D depth texture suitable for 32-bit floating point depth rendering.
    #[must_use]
    pub fn create_depth_texture(
        &self,
        width: u32,
        height: u32,
        label: Option<&str>,
    ) -> wgpu::Texture {
        self.device.create_texture(&wgpu::TextureDescriptor {
            label,
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TextureFormat::Depth32Float,
            usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
    }
}
