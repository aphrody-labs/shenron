// SPDX-License-Identifier: Apache-2.0
//! The one wgpu backend of Shenron.
//!
//! Every GPU job of the workspace (the exporters of manga pages, the desktop app, the browser
//! viewport of Shenron Studio, whatever comes next) runs on a [`GpuContext`] opened here, so the
//! choice of adapter, the environment overrides, error handling and diagnostics are decided once.
//!
//! | Module | What it owns |
//! | --- | --- |
//! | [`options`] | [`GpuOptions`] (backends, power, adapter name, features, limits policy) and the `SHENRON_GPU_*` variables |
//! | [`context`] | [`GpuContext`]: instance, adapter, device, queue, device loss, uncaptured errors, error scopes, pipeline cache |
//! | [`report`] | [`AdapterReport`] and [`GpuReport`]: serialisable description of the adapters, for doctors and health endpoints |
//! | [`target`] | [`RenderTarget`], [`TargetPool`], [`RowLayout`]: offscreen targets and CPU readback |
//! | [`present`] | [`SurfaceBlitter`], [`acquire`], [`surface_configuration`]: presenting to a window or canvas |
//! | `vello_backend` | [`VelloBackend`]: Vello renderer on the shared device (feature `vello`, default) |
//! | `testing` | noop and software contexts for tests (feature `testing`) |
//!
//! `wgpu` and `vello` are re-exported: dependent crates use `shenron_gpu::wgpu` so the whole
//! workspace names one wgpu version, the one Vello was built against (the pair is bumped together,
//! see docs/architecture/gpu.md).
//!
//! ```no_run
//! # fn main() -> shenron_gpu::Result<()> {
//! use shenron_gpu::{GpuContext, GpuOptions, RenderTarget};
//!
//! let context = GpuContext::new_blocking(&GpuOptions::native().for_vello().with_env())?;
//! println!("rendering on {}", context.report().summary());
//! let target = RenderTarget::new(context.device(), "page", 2048, 3072)?;
//! # let _ = target;
//! # Ok(())
//! # }
//! ```

#![deny(unsafe_code)]

mod cache;
pub mod context;
pub mod error;
pub mod options;
pub mod present;
pub mod report;
pub mod target;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
#[cfg(feature = "vello")]
pub mod vello_backend;

#[cfg(test)]
mod integration_tests;

#[cfg(feature = "vello")]
pub use vello;
pub use wgpu;

pub use context::{DeviceLoss, GpuContext, create_instance};
pub use error::{GpuError, Result};
pub use options::{GpuOptions, LimitsPolicy, NoopOptions};
pub use present::{Acquired, SurfaceBlitter, acquire, surface_configuration};
pub use report::{AdapterReport, GpuReport, LimitsReport, is_software_adapter};
pub use target::{RenderTarget, RowLayout, TARGET_FORMAT, TargetPool};
#[cfg(feature = "vello")]
pub use vello_backend::VelloBackend;
