// SPDX-License-Identifier: Apache-2.0

//! Unified GPU Backend Adapters and Hardware Initialization.
//!
//! Provides direct API compatibility with `aphrody-gpu-backend`:
//! - wgpu instance, device, adapter, queue, and surface configuration boundaries
//! - Explicit device limits policies (`Adapter`, `DownlevelWithAdapterResolution`)
//! - Surface format negotiation (preferred, linear, required fallback)
//! - GPU adapter inspection reports and compute limits
//! - Headless WGSL compute shader job execution

use std::fmt;
use serde::Serialize;
use wgpu::{
    Adapter, Backends, CompositeAlphaMode, Device, DeviceDescriptor, Features,
    Instance, InstanceDescriptor, Limits, MemoryHints,
    PresentMode, Queue, RequestAdapterError, RequestAdapterOptions, RequestDeviceError,
    SurfaceCapabilities, SurfaceColorSpace, SurfaceConfiguration, TextureFormat, TextureUsages,
};

/// NVIDIA PCI Vendor ID for vendor identification.
pub const NVIDIA_VENDOR_ID: u32 = 0x10de;

/// Maximum buffer size admitted for a single WGSL compute job.
pub const MAX_JOB_BYTES: usize = 64 * 1024 * 1024;

/// Create a wgpu instance through the unified engine backend.
#[must_use]
pub fn create_instance(descriptor: InstanceDescriptor) -> Instance {
    Instance::new(descriptor)
}

/// Request a GPU adapter using the given options.
pub async fn request_adapter(
    instance: &Instance,
    options: &RequestAdapterOptions<'_, '_>,
) -> Result<Adapter, RequestAdapterError> {
    instance.request_adapter(options).await
}

/// Enumerate available adapters for the specified backends.
pub async fn enumerate_adapters(instance: &Instance, backends: Backends) -> Vec<Adapter> {
    instance.enumerate_adapters(backends).await
}

/// Limits policy to use when creating a logical device for an adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeviceLimits {
    /// Request the maximum limits reported by the selected adapter.
    Adapter,
    /// Request wgpu downlevel defaults with texture resolution raised to adapter capacity.
    DownlevelWithAdapterResolution,
}

/// Shared device-creation profile.
#[derive(Clone, Copy, Debug)]
pub struct DeviceRequest<'a> {
    /// Optional debug label for the device.
    pub label: Option<&'a str>,
    /// Limit policy to apply.
    pub limits: DeviceLimits,
}

impl<'a> DeviceRequest<'a> {
    /// Constructs a new device request.
    #[must_use]
    pub const fn new(label: Option<&'a str>, limits: DeviceLimits) -> Self {
        Self { label, limits }
    }
}

/// A logical device and its command queue.
pub struct GpuDevice {
    /// The logical wgpu device.
    pub device: Device,
    /// The primary execution command queue.
    pub queue: Queue,
}

/// Request a logical GPU device with conservative defaults and the requested limits.
pub async fn request_device(
    adapter: &Adapter,
    request: DeviceRequest<'_>,
) -> Result<GpuDevice, RequestDeviceError> {
    let required_limits = match request.limits {
        DeviceLimits::Adapter => adapter.limits(),
        DeviceLimits::DownlevelWithAdapterResolution => {
            Limits::downlevel_defaults().using_resolution(adapter.limits())
        }
    };

    let descriptor = DeviceDescriptor {
        label: request.label,
        required_features: Features::empty(),
        required_limits,
        memory_hints: MemoryHints::default(),
        trace: wgpu::Trace::Off,
        ..Default::default()
    };

    let (device, queue) = adapter.request_device(&descriptor).await?;
    Ok(GpuDevice { device, queue })
}

/// Surface format negotiation strategy.
#[derive(Clone, Copy, Debug)]
pub enum SurfaceFormat<'a> {
    /// Select the first supported format reported by the surface.
    Preferred,
    /// Prefer a non-sRGB linear format, falling back to the first supported.
    Linear,
    /// Require one of the specified formats; fails if none are supported.
    Require(&'a [TextureFormat]),
}

/// Configuration settings for creating/reconfiguring a presentation surface.
#[derive(Clone, Copy, Debug)]
pub struct SurfaceRequest<'a> {
    /// Surface width in pixels.
    pub width: u32,
    /// Surface height in pixels.
    pub height: u32,
    /// Format strategy.
    pub format: SurfaceFormat<'a>,
    /// Optional present mode.
    pub present_mode: Option<PresentMode>,
    /// Optional alpha compositing mode.
    pub alpha_mode: Option<CompositeAlphaMode>,
    /// Maximum frame latency desired.
    pub desired_maximum_frame_latency: u32,
}

/// Build a surface configuration matching capabilities and requested parameters.
pub fn surface_configuration(
    capabilities: &SurfaceCapabilities,
    request: SurfaceRequest<'_>,
) -> Option<SurfaceConfiguration> {
    if request.width == 0 || request.height == 0 {
        return None;
    }

    let format = match request.format {
        SurfaceFormat::Preferred => capabilities.formats.first().copied(),
        SurfaceFormat::Linear => capabilities
            .formats
            .iter()
            .copied()
            .find(|fmt| !fmt.is_srgb())
            .or_else(|| capabilities.formats.first().copied()),
        SurfaceFormat::Require(preferred) => {
            capabilities.formats.iter().copied().find(|fmt| preferred.contains(fmt))
        }
    }?;

    let present_mode = request
        .present_mode
        .filter(|mode| capabilities.present_modes.contains(mode))
        .or_else(|| capabilities.present_modes.first().copied())?;

    let alpha_mode = request
        .alpha_mode
        .filter(|mode| capabilities.alpha_modes.contains(mode))
        .or_else(|| capabilities.alpha_modes.first().copied())?;

    Some(SurfaceConfiguration {
        usage: TextureUsages::RENDER_ATTACHMENT,
        format,
        color_space: SurfaceColorSpace::Auto,
        width: request.width,
        height: request.height,
        present_mode,
        desired_maximum_frame_latency: request.desired_maximum_frame_latency,
        alpha_mode,
        view_formats: Vec::new(),
    })
}

/// Description of a single GPU adapter.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterReport {
    pub name: String,
    pub vendor: u32,
    pub device: u32,
    pub device_type: String,
    pub backend: String,
    pub driver: String,
    pub driver_info: String,
    pub nvidia: bool,
}

impl AdapterReport {
    /// Builds an adapter report from adapter info.
    #[must_use]
    pub fn new(info: &wgpu::AdapterInfo) -> Self {
        Self {
            name: info.name.clone(),
            vendor: info.vendor,
            device: info.device,
            device_type: format!("{:?}", info.device_type),
            backend: format!("{:?}", info.backend),
            driver: info.driver.clone(),
            driver_info: info.driver_info.clone(),
            nvidia: info.vendor == NVIDIA_VENDOR_ID,
        }
    }
}

/// Limits of the selected GPU that matter to compute workloads.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeLimits {
    pub max_storage_buffer_binding_size: u64,
    pub max_compute_workgroups_per_dimension: u32,
    pub max_compute_invocations_per_workgroup: u32,
    pub max_buffer_size: u64,
}

/// Full GPU hardware state report.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuReport {
    pub adapters: Vec<AdapterReport>,
    pub selected: Option<AdapterReport>,
    pub limits: Option<ComputeLimits>,
    pub error: Option<String>,
}

/// WGSL compute job descriptor over a single read-write storage buffer.
#[derive(Clone, Copy, Debug)]
pub struct WgslJob<'a> {
    /// WGSL shader source code.
    pub shader: &'a str,
    /// Entry point function name.
    pub entry_point: &'a str,
    /// Number of workgroups `[X, Y, Z]`.
    pub workgroups: [u32; 3],
    /// Initial data written to `@group(0) @binding(0)`.
    pub data: &'a [u8],
}

/// Error returned by GPU hub operations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GpuBackendError {
    InvalidJob(String),
    ExecutionError(String),
}

impl fmt::Display for GpuBackendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJob(msg) => write!(f, "Invalid WGSL compute job: {msg}"),
            Self::ExecutionError(msg) => write!(f, "GPU execution failed: {msg}"),
        }
    }
}

impl std::error::Error for GpuBackendError {}

/// Runs a single-pass WGSL compute job synchronously and reads back the resulting buffer.
pub fn run_wgsl_compute(
    device: &Device,
    queue: &Queue,
    job: WgslJob<'_>,
) -> Result<Vec<u8>, GpuBackendError> {
    let size = job.data.len();
    if size == 0 || !size.is_multiple_of(4) {
        return Err(GpuBackendError::InvalidJob(
            "Input data must be a non-empty multiple of 4 bytes".into(),
        ));
    }

    let limits = device.limits();
    let max_binding = usize::try_from(limits.max_storage_buffer_binding_size).unwrap_or(usize::MAX);
    let max_buffer = usize::try_from(limits.max_buffer_size).unwrap_or(usize::MAX);
    let job_limit = MAX_JOB_BYTES.min(max_binding).min(max_buffer);

    if size > job_limit {
        return Err(GpuBackendError::InvalidJob(format!(
            "Job data size {size} exceeds allowed hardware limit of {job_limit} bytes"
        )));
    }

    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("shenron_compute_shader"),
        source: wgpu::ShaderSource::Wgsl(job.shader.into()),
    });

    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("shenron_compute_pipeline"),
        layout: None,
        module: &module,
        entry_point: Some(job.entry_point),
        compilation_options: Default::default(),
        cache: None,
    });

    let size_u64 = size as u64;
    let storage_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("shenron_compute_storage"),
        size: size_u64,
        usage: wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_SRC
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("shenron_compute_readback"),
        size: size_u64,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    queue.write_buffer(&storage_buffer, 0, job.data);

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("shenron_compute_bind_group"),
        layout: &pipeline.get_bind_group_layout(0),
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: storage_buffer.as_entire_binding(),
        }],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("shenron_compute_encoder"),
    });

    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("shenron_compute_pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        let [x, y, z] = job.workgroups;
        pass.dispatch_workgroups(x, y, z);
    }

    encoder.copy_buffer_to_buffer(&storage_buffer, 0, &readback_buffer, 0, size_u64);
    let submission = queue.submit(Some(encoder.finish()));

    let (sender, receiver) = std::sync::mpsc::channel();
    readback_buffer.slice(..).map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });

    device
        .poll(wgpu::PollType::Wait {
            submission_index: Some(submission),
            timeout: None,
        })
        .map_err(|e| GpuBackendError::ExecutionError(e.to_string()))?;

    receiver
        .recv()
        .map_err(|_| GpuBackendError::ExecutionError("GPU readback dropped".into()))?
        .map_err(|e| GpuBackendError::ExecutionError(e.to_string()))?;

    let mapped_view = readback_buffer
        .slice(..)
        .get_mapped_range()
        .map_err(|e| GpuBackendError::ExecutionError(e.to_string()))?;
    let result = mapped_view.to_vec();
    drop(mapped_view);
    readback_buffer.unmap();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_limits_and_request() {
        let req = DeviceRequest::new(Some("test_device"), DeviceLimits::Adapter);
        assert_eq!(req.label, Some("test_device"));
        assert_eq!(req.limits, DeviceLimits::Adapter);
    }

    #[test]
    fn test_surface_configuration_empty_rejection() {
        let caps = SurfaceCapabilities {
            formats: vec![TextureFormat::Rgba8Unorm],
            present_modes: vec![PresentMode::Fifo],
            alpha_modes: vec![CompositeAlphaMode::Opaque],
            usages: TextureUsages::RENDER_ATTACHMENT,
            format_capabilities: Default::default(),
        };

        let req = SurfaceRequest {
            width: 0,
            height: 1080,
            format: SurfaceFormat::Preferred,
            present_mode: None,
            alpha_mode: None,
            desired_maximum_frame_latency: 2,
        };

        assert!(surface_configuration(&caps, req).is_none());
    }
}
