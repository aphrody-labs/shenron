// SPDX-License-Identifier: Apache-2.0
//! The device every Shenron GPU job runs on.
//!
//! [`GpuContext`] is the one place that creates a wgpu instance, picks an adapter, negotiates
//! features and limits, opens the device and watches it. Everything else in the workspace
//! receives a context (or clones of its `device` and `queue`) and never builds an instance of its
//! own, so the choice of adapter, the environment overrides, the error handling and the
//! diagnostics are the same for the manga exporter, the desktop app and the browser viewport.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use wgpu::{Adapter, Device, Features, Instance, Queue, Surface};

use crate::error::{GpuError, Result};
use crate::options::GpuOptions;
use crate::report::AdapterReport;

/// How many uncaptured errors are kept for inspection (the oldest are dropped).
const ERROR_LOG_CAPACITY: usize = 32;

/// A device that was destroyed or lost.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceLoss {
    /// `Unknown` (driver failure, timeout, hot-unplug) or `Destroyed`.
    pub reason: String,
    pub message: String,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// State shared with the callbacks wgpu runs on its own threads.
#[derive(Default)]
struct DeviceState {
    lost: Mutex<Option<DeviceLoss>>,
    errors: Mutex<VecDeque<GpuError>>,
    error_count: AtomicU64,
}

impl DeviceState {
    fn record_error(&self, error: GpuError) {
        // wgpu panics on an uncaptured error unless a handler is installed: log it loudly instead,
        // keep it for `GpuContext::take_errors` and let the caller decide what to do.
        log::error!("wgpu uncaptured error: {error}");
        self.error_count.fetch_add(1, Ordering::Relaxed);
        let mut errors = lock(&self.errors);
        if errors.len() == ERROR_LOG_CAPACITY {
            errors.pop_front();
        }
        errors.push_back(error);
    }

    fn record_loss(&self, reason: String, message: String) {
        log::error!("wgpu device lost ({reason}): {message}");
        lock(&self.lost).get_or_insert(DeviceLoss { reason, message });
    }
}

/// Creates the wgpu instance `options` describe. In a browser this probes `navigator.gpu` first:
/// some browsers define it without being able to create an adapter.
pub async fn create_instance(options: &GpuOptions) -> Instance {
    let descriptor = options.instance_descriptor();
    #[cfg(target_arch = "wasm32")]
    if descriptor.backends.contains(wgpu::Backends::BROWSER_WEBGPU) {
        return wgpu::util::new_instance_with_webgpu_detection(descriptor).await;
    }
    Instance::new(descriptor)
}

/// Picks the adapter: by name when `options.adapter_name` is set, else by power preference.
async fn select_adapter(
    instance: &Instance,
    options: &GpuOptions,
    surface: Option<&Surface<'_>>,
) -> Result<Adapter> {
    if let Some(wanted) = options.adapter_name.as_deref() {
        let needle = wanted.to_ascii_lowercase();
        let adapters = instance.enumerate_adapters(options.backends).await;
        let available: Vec<String> =
            adapters.iter().map(|adapter| adapter.get_info().name).collect();
        return adapters
            .into_iter()
            .filter(|adapter| surface.is_none_or(|surface| adapter.is_surface_supported(surface)))
            .find(|adapter| adapter.get_info().name.to_ascii_lowercase().contains(&needle))
            .ok_or_else(|| {
                GpuError::NoAdapter(format!(
                    "no adapter name contains {wanted:?}; available: {}",
                    if available.is_empty() { "none".to_owned() } else { available.join(", ") }
                ))
            });
    }
    instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: options.power_preference,
            force_fallback_adapter: options.force_fallback_adapter,
            compatible_surface: surface,
            apply_limit_buckets: options.apply_limit_buckets,
        })
        .await
        .map_err(|error| {
            GpuError::NoAdapter(format!(
                "{error}; backends {:?}, power {:?}, software adapter {}",
                options.backends,
                options.power_preference,
                if options.force_fallback_adapter { "required" } else { "not required" },
            ))
        })
}

/// An open GPU device with its adapter, queue, diagnostics and optional pipeline cache.
///
/// Cloning is cheap (the wgpu handles are reference counted). On native targets a context is
/// `Send + Sync`; in a browser the handles stay on the main thread.
#[derive(Clone)]
pub struct GpuContext {
    instance: Instance,
    adapter: Adapter,
    device: Device,
    queue: Queue,
    report: Arc<AdapterReport>,
    state: Arc<DeviceState>,
    pipeline_cache: Option<crate::cache::PipelineCacheStore>,
}

impl GpuContext {
    /// Opens a device as `options` describe.
    pub async fn new(options: &GpuOptions) -> Result<Self> {
        let instance = create_instance(options).await;
        Self::with_instance(instance, options, None).await
    }

    /// Blocking [`GpuContext::new`] for native programs.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn new_blocking(options: &GpuOptions) -> Result<Self> {
        pollster::block_on(Self::new(options))
    }

    /// Opens a device on an existing instance, optionally compatible with a surface (a canvas
    /// created from that same instance).
    pub async fn with_instance(
        instance: Instance,
        options: &GpuOptions,
        compatible_surface: Option<&Surface<'_>>,
    ) -> Result<Self> {
        let adapter = select_adapter(&instance, options, compatible_surface).await?;
        let report = AdapterReport::of(&adapter);

        let supported = adapter.features();
        let missing = options.required_features - supported;
        if !missing.is_empty() {
            return Err(GpuError::MissingFeatures {
                adapter: report.name.clone(),
                missing: format!("{missing:?}"),
            });
        }
        let features: Features =
            options.required_features | (options.optional_features & supported);
        let limits = options.limits.resolve(&adapter.limits());

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some(&options.label),
                required_features: features,
                required_limits: limits,
                memory_hints: options.memory_hints.clone(),
                ..Default::default()
            })
            .await
            .map_err(|error| GpuError::RequestDevice(format!("{error} on {}", report.summary())))?;

        let state = Arc::new(DeviceState::default());
        let on_error = Arc::clone(&state);
        device.on_uncaptured_error(Arc::new(move |error: wgpu::Error| {
            on_error.record_error(GpuError::from(error));
        }));
        let on_loss = Arc::clone(&state);
        device.set_device_lost_callback(move |reason, message| {
            on_loss.record_loss(format!("{reason:?}"), message);
        });

        let pipeline_cache = crate::cache::PipelineCacheStore::open(&device, &adapter, options);
        log::info!(
            "GPU device `{}` on {}{}",
            options.label,
            report.summary(),
            if report.is_software { " (software adapter)" } else { "" },
        );
        Ok(Self {
            instance,
            adapter,
            device,
            queue,
            report: Arc::new(report),
            state,
            pipeline_cache,
        })
    }

    /// The wgpu instance (needed to create surfaces).
    #[must_use]
    pub fn instance(&self) -> &Instance {
        &self.instance
    }

    /// The adapter the device was opened on.
    #[must_use]
    pub fn adapter(&self) -> &Adapter {
        &self.adapter
    }

    /// The device. Clone it freely; it is a reference-counted handle.
    #[must_use]
    pub fn device(&self) -> &Device {
        &self.device
    }

    /// The queue of the device.
    #[must_use]
    pub fn queue(&self) -> &Queue {
        &self.queue
    }

    /// What the adapter is, for logs, health endpoints and bug reports.
    #[must_use]
    pub fn report(&self) -> &AdapterReport {
        &self.report
    }

    /// The persistent pipeline cache, when enabled and supported.
    #[must_use]
    pub fn pipeline_cache(&self) -> Option<&wgpu::PipelineCache> {
        self.pipeline_cache.as_ref().map(crate::cache::PipelineCacheStore::cache)
    }

    /// Writes the pipeline cache next to the previous ones (native; a no-op elsewhere or when
    /// the cache is disabled). Call it once the pipelines of a session are built.
    pub fn save_pipeline_cache(&self) -> Result<()> {
        match &self.pipeline_cache {
            Some(store) => {
                store.save().map_err(|error| GpuError::Internal(format!("pipeline cache: {error}")))
            },
            None => Ok(()),
        }
    }

    /// The loss of the device, once it happened.
    #[must_use]
    pub fn lost(&self) -> Option<DeviceLoss> {
        lock(&self.state.lost).clone()
    }

    /// `Err(DeviceLost)` once the device was destroyed or lost, `Ok` while it answers.
    pub fn ensure_alive(&self) -> Result<()> {
        match self.lost() {
            Some(DeviceLoss { reason, message }) => Err(GpuError::DeviceLost { reason, message }),
            None => Ok(()),
        }
    }

    /// Errors wgpu reported outside any error scope since the last call (oldest first).
    pub fn take_errors(&self) -> Vec<GpuError> {
        lock(&self.state.errors).drain(..).collect()
    }

    /// How many uncaptured errors the device has reported since it was opened.
    #[must_use]
    pub fn error_count(&self) -> u64 {
        self.state.error_count.load(Ordering::Relaxed)
    }

    /// Runs `work` inside a validation error scope: a validation error becomes an `Err`
    /// instead of reaching the uncaptured-error handler.
    pub async fn validated<T>(&self, work: impl FnOnce() -> T) -> Result<T> {
        let scope = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let value = work();
        match scope.pop().await {
            Some(error) => Err(GpuError::from(error)),
            None => Ok(value),
        }
    }

    /// Blocking [`GpuContext::validated`] for native programs.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn validated_blocking<T>(&self, work: impl FnOnce() -> T) -> Result<T> {
        pollster::block_on(self.validated(work))
    }

    /// Waits for a submission to finish (native). A lost device or a timeout is an error rather
    /// than a hang.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn wait_for(
        &self,
        submission: wgpu::SubmissionIndex,
        timeout: std::time::Duration,
    ) -> Result<()> {
        self.ensure_alive()?;
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(submission),
                timeout: Some(timeout),
            })
            .map(|_| ())
            .map_err(|error| GpuError::Readback(format!("waiting for the GPU failed: {error}")))
    }
}

impl core::fmt::Debug for GpuContext {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("GpuContext")
            .field("adapter", &self.report.summary())
            .field("lost", &self.lost())
            .field("errors", &self.error_count())
            .finish_non_exhaustive()
    }
}
