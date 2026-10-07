// SPDX-License-Identifier: Apache-2.0
//! Contexts for tests, here and in the crates that depend on this one (feature `testing`).
//!
//! - [`noop_context`]: wgpu's noop backend with limits and features of your choosing. It stubs
//!   everything except buffers, but wgpu-core still validates every call: perfect for testing
//!   negotiation, error handling and API usage without a GPU.
//! - [`software_context`]: a CPU rasteriser (llvmpipe, lavapipe, WARP, SwiftShader) when the
//!   machine has one: real rendering, deterministic, no driver crashes (the hardware adapters of
//!   WSL do crash). `None` when there is none, so the test can skip.

use wgpu::Backends;

use crate::context::GpuContext;
use crate::options::{GpuOptions, NoopOptions};

/// Options for a noop device reporting `noop`.
#[must_use]
pub fn noop_options(noop: NoopOptions) -> GpuOptions {
    let mut options = GpuOptions::native();
    options.backends = Backends::NOOP;
    options.noop = Some(noop);
    options.pipeline_cache_dir = None;
    options
}

/// A noop context reporting `noop`.
#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn noop_context(noop: NoopOptions) -> GpuContext {
    GpuContext::new_blocking(&noop_options(noop)).expect("the noop backend always has an adapter")
}

/// Options that select a software adapter on any native backend.
#[must_use]
pub fn software_options() -> GpuOptions {
    let mut options = GpuOptions::native();
    options.backends = Backends::PRIMARY | Backends::SECONDARY;
    options.force_fallback_adapter = true;
    options.pipeline_cache_dir = None;
    options
}

/// A context on a software adapter, or `None` (with a log line) when the machine has none.
#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn software_context() -> Option<GpuContext> {
    match GpuContext::new_blocking(&software_options().for_vello()) {
        Ok(context) if context.report().is_software => Some(context),
        Ok(context) => {
            log::warn!(
                "`{}` is not a software adapter: software tests skipped",
                context.report().summary()
            );
            None
        },
        Err(error) => {
            log::warn!("no software adapter ({error}): software tests skipped");
            None
        },
    }
}
