// SPDX-License-Identifier: Apache-2.0
//! What the backend asks of the machine, and the environment variables that override it.
//!
//! Precedence, strongest first: an explicit field set by the caller, then `SHENRON_GPU_*`, then
//! wgpu's own `WGPU_*` variables (read by wgpu itself: `WGPU_BACKEND`, `WGPU_POWER_PREF`,
//! `WGPU_ADAPTER_NAME`, `WGPU_DX12_COMPILER`, `WGPU_DEBUG`, `WGPU_VALIDATION`…), then the defaults
//! below. Browsers have no environment: the browser preset ignores all of it.

use std::path::PathBuf;

use wgpu::{
    Backends, DeviceType, Features, InstanceFlags, Limits, MemoryHints, NoopBackendOptions,
    PowerPreference,
};

/// Comma-separated backends: `vulkan`, `metal`, `dx12`, `gl`, `webgpu`, `noop`, `primary`,
/// `secondary`, `all` (wgpu's own names, plus the three groups).
pub const ENV_BACKEND: &str = "SHENRON_GPU_BACKEND";
/// `high`, `low` or `none`.
pub const ENV_POWER: &str = "SHENRON_GPU_POWER";
/// Case-insensitive substring of the adapter name to use (`rtx`, `llvmpipe`, `lavapipe`).
pub const ENV_ADAPTER: &str = "SHENRON_GPU_ADAPTER";
/// `1` asks for a software adapter (llvmpipe, lavapipe, WARP, SwiftShader).
pub const ENV_FALLBACK: &str = "SHENRON_GPU_FALLBACK";
/// Directory of the persistent pipeline cache (native only); empty disables it.
pub const ENV_PIPELINE_CACHE: &str = "SHENRON_GPU_PIPELINE_CACHE";

/// Largest texture side the rendering policy asks for, whatever the adapter offers.
pub const RENDER_MAX_TEXTURE_DIMENSION: u32 = 16_384;
/// Largest buffer the rendering policy asks for (a 16384 x 16384 RGBA readback is 1 GiB).
pub const RENDER_MAX_BUFFER_SIZE: u64 = 1 << 30;

/// How the limits requested from the adapter are chosen.
#[derive(Clone, Debug, PartialEq)]
pub enum LimitsPolicy {
    /// The WebGPU default limits: what every WebGPU implementation has to offer.
    Default,
    /// The defaults, raised to what the adapter offers for the resources that bound the size of
    /// an exported page: texture sides, buffer size, storage-buffer binding size.
    RaisedForRendering,
    /// Exactly these limits (clamped to the adapter, which would reject anything better).
    Exact(Box<Limits>),
}

impl LimitsPolicy {
    /// The limits to request from an adapter that offers `adapter`.
    ///
    /// The result is always valid for that adapter: each limit is clamped to the adapter's.
    #[must_use]
    pub fn resolve(&self, adapter: &Limits) -> Limits {
        let requested = match self {
            Self::Default => Limits::default(),
            Self::RaisedForRendering => {
                let limits = Limits {
                    max_texture_dimension_1d: adapter
                        .max_texture_dimension_1d
                        .min(RENDER_MAX_TEXTURE_DIMENSION),
                    max_texture_dimension_2d: adapter
                        .max_texture_dimension_2d
                        .min(RENDER_MAX_TEXTURE_DIMENSION),
                    max_buffer_size: adapter.max_buffer_size.min(RENDER_MAX_BUFFER_SIZE),
                    max_storage_buffer_binding_size: adapter
                        .max_storage_buffer_binding_size
                        .min(RENDER_MAX_BUFFER_SIZE),
                    ..Limits::default()
                };
                // Never ask for less than the WebGPU defaults, nor for more than the adapter has.
                limits.or_better_values_from(&Limits::default())
            },
            Self::Exact(limits) => (**limits).clone(),
        };
        requested.or_worse_values_from(adapter)
    }
}

/// The reported capabilities of the noop backend (tests only): which limits, features and device
/// type a pretend adapter claims, so negotiation can be tested without hardware.
#[derive(Clone, Debug, Default)]
pub struct NoopOptions {
    /// Reported limits; `None` reports maximally permissive limits.
    pub limits: Option<Limits>,
    /// Reported features; `None` reports every feature.
    pub features: Option<Features>,
    /// Reported device type; `None` reports `DeviceType::Other`.
    pub device_type: Option<DeviceType>,
}

impl NoopOptions {
    pub(crate) fn to_wgpu(&self) -> NoopBackendOptions {
        NoopBackendOptions {
            limits: self.limits.clone(),
            features: self.features,
            device_type: self.device_type,
            ..NoopBackendOptions::enabled()
        }
    }
}

/// Everything `GpuContext::new` needs to pick an adapter and open a device.
#[derive(Clone, Debug)]
pub struct GpuOptions {
    /// Label of the device, shown by graphics debuggers and in wgpu errors.
    pub label: String,
    /// Backends the instance may use.
    pub backends: Backends,
    /// Which adapter to prefer when several match.
    pub power_preference: PowerPreference,
    /// Ask for a software adapter (deterministic output, no driver crashes, slow).
    pub force_fallback_adapter: bool,
    /// Case-insensitive substring of the adapter name; takes precedence over the power preference.
    pub adapter_name: Option<String>,
    /// Features the adapter must support; a missing one is an error.
    pub required_features: Features,
    /// Features enabled when the adapter has them; a missing one is not an error.
    pub optional_features: Features,
    /// How the limits are chosen.
    pub limits: LimitsPolicy,
    /// Allocation strategy hints for the driver.
    pub memory_hints: MemoryHints,
    /// Instance flags; `None` takes the build configuration (validation in debug builds) and
    /// `WGPU_DEBUG`, `WGPU_VALIDATION`… from the environment.
    pub instance_flags: Option<InstanceFlags>,
    /// Round the adapter limits to coarse buckets (fingerprinting resistance; web).
    pub apply_limit_buckets: bool,
    /// Directory of the persistent pipeline cache (native; needs `Features::PIPELINE_CACHE`).
    pub pipeline_cache_dir: Option<PathBuf>,
    /// Pretend adapter of the noop backend; set it together with `Backends::NOOP` (tests).
    pub noop: Option<NoopOptions>,
}

impl Default for GpuOptions {
    fn default() -> Self {
        #[cfg(target_arch = "wasm32")]
        return Self::browser();
        #[cfg(not(target_arch = "wasm32"))]
        return Self::native();
    }
}

impl GpuOptions {
    fn base(label: &str, backends: Backends, limits: LimitsPolicy) -> Self {
        Self {
            label: label.to_owned(),
            backends,
            power_preference: PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            adapter_name: None,
            required_features: Features::empty(),
            optional_features: Features::empty(),
            limits,
            memory_hints: MemoryHints::default(),
            instance_flags: None,
            apply_limit_buckets: false,
            pipeline_cache_dir: None,
            noop: None,
        }
    }

    /// The browser WebGPU viewport: WebGPU only, the portable default limits.
    #[must_use]
    pub fn browser() -> Self {
        Self::base("shenron browser WebGPU device", Backends::BROWSER_WEBGPU, LimitsPolicy::Default)
    }

    /// Native rendering and exports: the primary backends (Vulkan, Metal, DX12), limits raised so
    /// a supersampled page fits.
    #[must_use]
    pub fn native() -> Self {
        Self::base("shenron native device", Backends::PRIMARY, LimitsPolicy::RaisedForRendering)
    }

    /// Adds what Vello can use when present: `CLEAR_TEXTURE` and `PIPELINE_CACHE`.
    #[must_use]
    pub fn for_vello(mut self) -> Self {
        self.optional_features |= Features::CLEAR_TEXTURE | Features::PIPELINE_CACHE;
        self
    }

    /// Applies `SHENRON_GPU_*` from the process environment (native; a no-op in a browser).
    #[must_use]
    pub fn with_env(self) -> Self {
        #[cfg(target_arch = "wasm32")]
        return self;
        #[cfg(not(target_arch = "wasm32"))]
        return self.with_lookup(|name| std::env::var(name).ok());
    }

    /// Applies the `SHENRON_GPU_*` variables found by `lookup`. Unparseable values are ignored
    /// with a warning rather than failing a process at startup.
    #[must_use]
    pub fn with_lookup(mut self, lookup: impl Fn(&str) -> Option<String>) -> Self {
        let get = |name: &str| {
            lookup(name).map(|value| value.trim().to_owned()).filter(|v| !v.is_empty())
        };
        if let Some(text) = get(ENV_BACKEND) {
            match parse_backends(&text) {
                Some(backends) => self.backends = backends,
                None => log::warn!("{ENV_BACKEND}={text:?}: no valid backend, ignored"),
            }
        }
        if let Some(text) = get(ENV_POWER) {
            match parse_power(&text) {
                Some(power) => self.power_preference = power,
                None => log::warn!("{ENV_POWER}={text:?}: expected high, low or none, ignored"),
            }
        }
        if let Some(name) = get(ENV_ADAPTER) {
            self.adapter_name = Some(name);
        }
        if let Some(text) = get(ENV_FALLBACK) {
            match parse_bool(&text) {
                Some(on) => self.force_fallback_adapter = on,
                None => log::warn!("{ENV_FALLBACK}={text:?}: expected 1 or 0, ignored"),
            }
        }
        // An empty value disables the cache, so it is read before the emptiness filter.
        if let Some(dir) = lookup(ENV_PIPELINE_CACHE) {
            let dir = dir.trim();
            self.pipeline_cache_dir = (!dir.is_empty()).then(|| PathBuf::from(dir));
        }
        self
    }

    /// The instance descriptor these options describe (no display handle).
    #[must_use]
    pub fn instance_descriptor(&self) -> wgpu::InstanceDescriptor {
        let mut backend_options = wgpu::BackendOptions::from_env_or_default();
        if let Some(noop) = &self.noop {
            backend_options.noop = noop.to_wgpu();
        }
        wgpu::InstanceDescriptor {
            backends: self.backends,
            flags: self
                .instance_flags
                .unwrap_or_else(|| InstanceFlags::from_build_config().with_env()),
            backend_options,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        }
    }
}

/// Parses a backend list: wgpu's names plus the groups `primary`, `secondary` and `all`.
#[must_use]
pub fn parse_backends(text: &str) -> Option<Backends> {
    let mut backends = Backends::empty();
    let mut named = Vec::new();
    for token in text.split(',').map(str::trim).filter(|t| !t.is_empty()) {
        match token.to_ascii_lowercase().as_str() {
            "primary" => backends |= Backends::PRIMARY,
            "secondary" => backends |= Backends::SECONDARY,
            "all" => backends |= Backends::all(),
            other => named.push(other.to_owned()),
        }
    }
    if !named.is_empty() {
        backends |= Backends::from_comma_list(&named.join(","));
    }
    (!backends.is_empty()).then_some(backends)
}

/// Parses `high`/`performance`, `low`/`power`, `none`.
#[must_use]
pub fn parse_power(text: &str) -> Option<PowerPreference> {
    match text.to_ascii_lowercase().as_str() {
        "high" | "performance" | "high-performance" => Some(PowerPreference::HighPerformance),
        "low" | "power" | "low-power" => Some(PowerPreference::LowPower),
        "none" => Some(PowerPreference::None),
        _ => None,
    }
}

/// Parses a boolean flag: `1`, `true`, `yes`, `on` / `0`, `false`, `no`, `off`.
#[must_use]
pub fn parse_bool(text: &str) -> Option<bool> {
    match text.to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| pairs.iter().find(|(k, _)| *k == name).map(|(_, v)| (*v).to_owned())
    }

    #[test]
    fn backends_accept_wgpu_names_and_groups() {
        assert_eq!(parse_backends("vulkan"), Some(Backends::VULKAN));
        assert_eq!(parse_backends(" vk , DX12 "), Some(Backends::VULKAN | Backends::DX12));
        assert_eq!(parse_backends("primary"), Some(Backends::PRIMARY));
        assert_eq!(
            parse_backends("secondary, vulkan"),
            Some(Backends::SECONDARY | Backends::VULKAN)
        );
        assert_eq!(parse_backends("all"), Some(Backends::all()));
        assert_eq!(parse_backends("webgpu"), Some(Backends::BROWSER_WEBGPU));
        assert_eq!(parse_backends("quantum"), None);
        assert_eq!(parse_backends(""), None);
    }

    #[test]
    fn power_and_flags_parse_strictly() {
        assert_eq!(parse_power("HIGH"), Some(PowerPreference::HighPerformance));
        assert_eq!(parse_power("low-power"), Some(PowerPreference::LowPower));
        assert_eq!(parse_power("turbo"), None);
        assert_eq!(parse_bool("on"), Some(true));
        assert_eq!(parse_bool("0"), Some(false));
        assert_eq!(parse_bool("maybe"), None);
    }

    #[test]
    fn the_environment_overrides_the_preset() {
        let lookup = env(&[
            (ENV_BACKEND, "gl"),
            (ENV_POWER, "low"),
            (ENV_ADAPTER, "lavapipe"),
            (ENV_FALLBACK, "1"),
            (ENV_PIPELINE_CACHE, "/var/cache/shenron/gpu"),
        ]);
        let options = GpuOptions::native().with_lookup(lookup);
        assert_eq!(options.backends, Backends::GL);
        assert_eq!(options.power_preference, PowerPreference::LowPower);
        assert_eq!(options.adapter_name.as_deref(), Some("lavapipe"));
        assert!(options.force_fallback_adapter);
        assert_eq!(options.pipeline_cache_dir, Some(PathBuf::from("/var/cache/shenron/gpu")));
    }

    #[test]
    fn a_bad_value_keeps_the_preset() {
        let options = GpuOptions::native()
            .with_lookup(env(&[(ENV_BACKEND, "quantum"), (ENV_POWER, "turbo")]));
        assert_eq!(options.backends, Backends::PRIMARY);
        assert_eq!(options.power_preference, PowerPreference::HighPerformance);
    }

    #[test]
    fn an_empty_cache_directory_disables_the_cache() {
        let mut options = GpuOptions::native();
        options.pipeline_cache_dir = Some(PathBuf::from("/tmp/gpu"));
        let options = options.with_lookup(env(&[(ENV_PIPELINE_CACHE, "")]));
        assert_eq!(options.pipeline_cache_dir, None);
    }

    #[test]
    fn the_default_policy_never_exceeds_the_adapter() {
        let weak = Limits { max_texture_dimension_2d: 4096, ..Limits::default() };
        let limits = LimitsPolicy::Default.resolve(&weak);
        assert_eq!(limits.max_texture_dimension_2d, 4096);
    }

    #[test]
    fn the_rendering_policy_raises_sizes_up_to_the_cap() {
        let big = Limits {
            max_texture_dimension_2d: 32_768,
            max_buffer_size: 8 << 30,
            ..Limits::default()
        };
        let limits = LimitsPolicy::RaisedForRendering.resolve(&big);
        assert_eq!(limits.max_texture_dimension_2d, RENDER_MAX_TEXTURE_DIMENSION);
        assert_eq!(limits.max_buffer_size, RENDER_MAX_BUFFER_SIZE);
        let modest = Limits { max_texture_dimension_2d: 8192, ..Limits::default() };
        let limits = LimitsPolicy::RaisedForRendering.resolve(&modest);
        assert_eq!(limits.max_texture_dimension_2d, 8192);
    }

    #[test]
    fn the_rendering_policy_never_goes_below_the_webgpu_defaults() {
        let limits = LimitsPolicy::RaisedForRendering.resolve(&Limits::default());
        assert!(limits.max_texture_dimension_2d >= Limits::default().max_texture_dimension_2d);
        assert!(limits.max_buffer_size >= Limits::default().max_buffer_size);
    }
}
