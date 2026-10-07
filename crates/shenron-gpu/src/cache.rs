// SPDX-License-Identifier: Apache-2.0
//! Persistent pipeline cache: the driver's compiled shaders survive the process, so the second
//! start of an exporter or of the desktop app does not recompile Vello's pipelines.
//!
//! Native only. A browser keeps its own shader cache. The cache is keyed by
//! `wgpu::util::pipeline_cache_key` (adapter and driver identity): a blob from another GPU or a
//! driver update is not used, and a rejected blob is a cold cache, never an error.

use wgpu::{Adapter, Device, PipelineCache};

use crate::options::GpuOptions;

#[derive(Clone)]
pub(crate) struct PipelineCacheStore {
    cache: PipelineCache,
    #[cfg(not(target_arch = "wasm32"))]
    path: std::path::PathBuf,
}

/// A file name made of the cache key with every character outside `[A-Za-z0-9._-]` replaced.
#[cfg(not(target_arch = "wasm32"))]
fn file_name(key: &str) -> String {
    let safe: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '_' })
        .collect();
    format!("{safe}.bin")
}

impl PipelineCacheStore {
    #[cfg(target_arch = "wasm32")]
    pub(crate) fn open(
        _device: &Device,
        _adapter: &Adapter,
        _options: &GpuOptions,
    ) -> Option<Self> {
        None
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn open(device: &Device, adapter: &Adapter, options: &GpuOptions) -> Option<Self> {
        let dir = options.pipeline_cache_dir.as_ref()?;
        if !device.features().contains(wgpu::Features::PIPELINE_CACHE) {
            log::debug!("pipeline cache requested but the adapter lacks PIPELINE_CACHE");
            return None;
        }
        let key = wgpu::util::pipeline_cache_key(&adapter.get_info())?;
        let path = dir.join(file_name(&key));
        let data = std::fs::read(&path).ok();
        // SAFETY: the blob is absent or one this program wrote from `PipelineCache::get_data`
        // into a directory the operator controls; wgpu only uses it for an adapter with the same
        // cache key, and `fallback: true` turns a rejected blob into a cold cache.
        #[allow(unsafe_code)]
        let cache = unsafe {
            device.create_pipeline_cache(&wgpu::PipelineCacheDescriptor {
                label: Some("shenron pipeline cache"),
                data: data.as_deref(),
                fallback: true,
            })
        };
        log::debug!(
            "pipeline cache {} ({} bytes loaded)",
            path.display(),
            data.as_ref().map_or(0, Vec::len)
        );
        Some(Self { cache, path })
    }

    pub(crate) fn cache(&self) -> &PipelineCache {
        &self.cache
    }

    #[cfg(target_arch = "wasm32")]
    pub(crate) fn save(&self) -> std::io::Result<()> {
        Ok(())
    }

    /// Writes the cache atomically (temporary file, then rename) so a crash never leaves a
    /// truncated blob behind.
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn save(&self) -> std::io::Result<()> {
        let Some(bytes) = self.cache.get_data().filter(|bytes| !bytes.is_empty()) else {
            return Ok(());
        };
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = self.path.with_extension("tmp");
        std::fs::write(&temporary, &bytes)?;
        std::fs::rename(&temporary, &self.path)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn the_cache_key_becomes_a_safe_file_name() {
        assert_eq!(
            file_name("wgpu_pipeline_cache_vulkan_v1_10de:2786/drv 616.92"),
            "wgpu_pipeline_cache_vulkan_v1_10de_2786_drv_616.92.bin"
        );
        assert_eq!(file_name("../../etc/passwd"), ".._.._etc_passwd.bin");
    }
}
