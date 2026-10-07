// SPDX-License-Identifier: Apache-2.0
//! What this machine's GPUs are: a serialisable description for doctors, health endpoints and bug
//! reports.

use serde::Serialize;
use wgpu::{Adapter, DeviceType, Features};

use crate::options::GpuOptions;

/// Name fragments of the software adapters (CPU rasterisers).
const SOFTWARE_NAMES: [&str; 6] =
    ["llvmpipe", "lavapipe", "swiftshader", "warp", "software", "basic render"];

/// The limits that decide whether a page can be rendered and read back.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LimitsReport {
    pub max_texture_dimension_2d: u32,
    pub max_buffer_size: u64,
    pub max_storage_buffer_binding_size: u64,
    pub max_storage_textures_per_shader_stage: u32,
    pub max_compute_invocations_per_workgroup: u32,
    pub max_compute_workgroup_storage_size: u32,
}

/// One adapter, as wgpu reports it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AdapterReport {
    pub name: String,
    /// `vulkan`, `metal`, `dx12`, `gl`, `browser_webgpu`, `noop`.
    pub backend: String,
    /// `discrete`, `integrated`, `virtual`, `cpu`, `other`.
    pub device_type: String,
    pub vendor: u32,
    pub device: u32,
    pub driver: String,
    pub driver_info: String,
    /// A CPU rasteriser (llvmpipe, lavapipe, SwiftShader, WARP): correct but slow.
    pub is_software: bool,
    pub limits: LimitsReport,
    /// Names of the wgpu features the adapter supports.
    pub features: Vec<String>,
    /// Names of the downlevel capabilities the adapter supports.
    pub downlevel: Vec<String>,
}

/// Whether an adapter name or type denotes a CPU rasteriser.
#[must_use]
pub fn is_software_adapter(name: &str, device_type: DeviceType) -> bool {
    if device_type == DeviceType::Cpu {
        return true;
    }
    let name = name.to_ascii_lowercase();
    SOFTWARE_NAMES.iter().any(|fragment| name.contains(fragment))
}

fn device_type_name(device_type: DeviceType) -> &'static str {
    match device_type {
        DeviceType::DiscreteGpu => "discrete",
        DeviceType::IntegratedGpu => "integrated",
        DeviceType::VirtualGpu => "virtual",
        DeviceType::Cpu => "cpu",
        DeviceType::Other => "other",
    }
}

fn feature_names(features: Features) -> Vec<String> {
    features.iter_names().map(|(name, _)| name.to_owned()).collect()
}

impl AdapterReport {
    /// Describes `adapter`.
    #[must_use]
    pub fn of(adapter: &Adapter) -> Self {
        let info = adapter.get_info();
        let limits = adapter.limits();
        Self {
            is_software: is_software_adapter(&info.name, info.device_type),
            backend: format!("{:?}", info.backend).to_ascii_lowercase(),
            device_type: device_type_name(info.device_type).to_owned(),
            vendor: info.vendor,
            device: info.device,
            driver: info.driver.clone(),
            driver_info: info.driver_info.clone(),
            limits: LimitsReport {
                max_texture_dimension_2d: limits.max_texture_dimension_2d,
                max_buffer_size: limits.max_buffer_size,
                max_storage_buffer_binding_size: limits.max_storage_buffer_binding_size,
                max_storage_textures_per_shader_stage: limits.max_storage_textures_per_shader_stage,
                max_compute_invocations_per_workgroup: limits.max_compute_invocations_per_workgroup,
                max_compute_workgroup_storage_size: limits.max_compute_workgroup_storage_size,
            },
            features: feature_names(adapter.features()),
            downlevel: adapter
                .get_downlevel_capabilities()
                .flags
                .iter_names()
                .map(|(name, _)| name.to_owned())
                .collect(),
            name: info.name,
        }
    }

    /// One line for logs: `NVIDIA GeForce RTX 4070 (vulkan, discrete, driver 616.92)`.
    #[must_use]
    pub fn summary(&self) -> String {
        let driver = if self.driver.is_empty() {
            String::new()
        } else {
            format!(", driver {}", self.driver)
        };
        format!("{} ({}, {}{driver})", self.name, self.backend, self.device_type)
    }
}

/// Every adapter the instance can see, for `doctor` commands and health endpoints.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GpuReport {
    /// The backends that were asked for.
    pub backends: String,
    pub adapters: Vec<AdapterReport>,
}

impl GpuReport {
    /// Enumerates the adapters `options` would consider (no device is created).
    pub async fn probe(options: &GpuOptions) -> Self {
        let instance = crate::context::create_instance(options).await;
        let adapters = instance.enumerate_adapters(options.backends).await;
        Self {
            backends: format!("{:?}", options.backends),
            adapters: adapters.iter().map(AdapterReport::of).collect(),
        }
    }

    /// Blocking [`GpuReport::probe`] for native tools.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn probe_blocking(options: &GpuOptions) -> Self {
        pollster::block_on(Self::probe(options))
    }

    /// Whether at least one adapter is a real GPU (not a CPU rasteriser).
    #[must_use]
    pub fn has_hardware(&self) -> bool {
        self.adapters.iter().any(|adapter| !adapter.is_software)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn software_adapters_are_recognised_by_type_or_name() {
        assert!(is_software_adapter("anything", DeviceType::Cpu));
        assert!(is_software_adapter("llvmpipe (LLVM 19.1.1, 256 bits)", DeviceType::Other));
        assert!(is_software_adapter("Microsoft Basic Render Driver", DeviceType::Other));
        assert!(is_software_adapter("lavapipe", DeviceType::Other));
        assert!(!is_software_adapter("NVIDIA GeForce RTX 4070", DeviceType::DiscreteGpu));
    }

    #[test]
    fn feature_names_preserve_wgpu_and_webgpu_flags() {
        let names = feature_names(Features::CLEAR_TEXTURE | Features::TIMESTAMP_QUERY);
        assert!(names.iter().any(|name| name == "CLEAR_TEXTURE"));
        assert!(names.iter().any(|name| name == "TIMESTAMP_QUERY"));
        assert!(feature_names(Features::empty()).is_empty());
    }

    #[test]
    fn the_summary_names_backend_and_driver() {
        let report = AdapterReport {
            name: "NVIDIA GeForce RTX 4070".into(),
            backend: "vulkan".into(),
            device_type: "discrete".into(),
            vendor: 0x10de,
            device: 0x2786,
            driver: "NVIDIA".into(),
            driver_info: "616.92".into(),
            is_software: false,
            limits: LimitsReport {
                max_texture_dimension_2d: 32768,
                max_buffer_size: 1 << 32,
                max_storage_buffer_binding_size: 1 << 31,
                max_storage_textures_per_shader_stage: 8,
                max_compute_invocations_per_workgroup: 1024,
                max_compute_workgroup_storage_size: 49152,
            },
            features: vec![],
            downlevel: vec![],
        };
        assert_eq!(report.summary(), "NVIDIA GeForce RTX 4070 (vulkan, discrete, driver NVIDIA)");
        let json = serde_json::to_value(&report).expect("serialises");
        assert_eq!(json["limits"]["max_texture_dimension_2d"], 32768);
        assert_eq!(json["is_software"], false);
    }
}
