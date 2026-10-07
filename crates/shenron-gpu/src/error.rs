// SPDX-License-Identifier: Apache-2.0
//! Errors of the wgpu backend.
//!
//! Every variant carries plain strings: the wgpu error types are not `Send` on every target and
//! not `Clone`, while a GPU failure has to cross threads (the device-loss callback runs on a
//! driver thread) and be stored for later inspection.

/// What can go wrong between "this machine has no GPU" and "the GPU stopped answering".
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum GpuError {
    /// No adapter matched the request (backends, power preference, name filter, surface).
    #[error("no usable GPU adapter ({0})")]
    NoAdapter(String),
    /// The adapter lacks a feature the caller declared as required.
    #[error("adapter `{adapter}` does not support the required features: {missing}")]
    MissingFeatures { adapter: String, missing: String },
    /// The adapter cannot meet a minimum the caller declared.
    #[error("adapter `{adapter}` cannot provide the required limits: {detail}")]
    UnsupportedLimits { adapter: String, detail: String },
    /// `Adapter::request_device` failed.
    #[error("the GPU device request failed: {0}")]
    RequestDevice(String),
    /// A surface could not be created or configured.
    #[error("GPU surface error: {0}")]
    Surface(String),
    /// The device was destroyed or lost; every later call on it fails.
    #[error("the GPU device was lost ({reason}): {message}")]
    DeviceLost { reason: String, message: String },
    /// A validation error: a bug in the code or data given to wgpu.
    #[error("GPU validation error: {0}")]
    Validation(String),
    /// The GPU or the driver ran out of memory.
    #[error("GPU out of memory: {0}")]
    OutOfMemory(String),
    /// A failure wgpu does not classify (driver or system limit).
    #[error("GPU internal error: {0}")]
    Internal(String),
    /// A render target larger than the device allows.
    #[error("render surface {width}x{height} exceeds the device limit {limit}")]
    SurfaceTooLarge { width: u32, height: u32, limit: u32 },
    /// A render target with a zero side or a size that overflows.
    #[error("invalid render surface {width}x{height}")]
    InvalidSurface { width: u32, height: u32 },
    /// Mapping or reading a buffer back failed.
    #[error("GPU readback failed: {0}")]
    Readback(String),
    /// Vello refused to build a renderer or to render a scene.
    #[error("Vello: {0}")]
    Vello(String),
}

/// `Result` of the backend.
pub type Result<T, E = GpuError> = core::result::Result<T, E>;

impl From<wgpu::Error> for GpuError {
    fn from(error: wgpu::Error) -> Self {
        match error {
            wgpu::Error::OutOfMemory { source } => Self::OutOfMemory(source.to_string()),
            wgpu::Error::Validation { description, .. } => Self::Validation(description),
            wgpu::Error::Internal { description, .. } => Self::Internal(description),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_are_plain_data() {
        let error = GpuError::SurfaceTooLarge { width: 9000, height: 12000, limit: 8192 };
        assert_eq!(error.clone(), error);
        assert_eq!(error.to_string(), "render surface 9000x12000 exceeds the device limit 8192");
    }

    #[test]
    fn a_device_loss_names_its_reason() {
        let error = GpuError::DeviceLost { reason: "Unknown".into(), message: "TDR".into() };
        assert_eq!(error.to_string(), "the GPU device was lost (Unknown): TDR");
    }
}
