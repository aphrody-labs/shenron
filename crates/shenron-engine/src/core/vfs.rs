// SPDX-License-Identifier: Apache-2.0

//! Memory-mapped Virtual Filesystem (VFS) with zero-copy binary streaming.
//!
//! Provides URI mount mapping (`assets://`, `shaders://`), memory mapping
//! via `memmap2`, and zero-allocation slice parsing.

use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use memmap2::Mmap;
use parking_lot::RwLock;

/// Represents a loaded asset slice backed by either a memory-mapped file or in-memory bytes.
pub enum AssetData {
    /// Zero-copy memory-mapped file view.
    Mmap(Mmap),
    /// In-memory byte buffer for embedded or procedural assets.
    Memory(Vec<u8>),
}

impl AsRef<[u8]> for AssetData {
    fn as_ref(&self) -> &[u8] {
        match self {
            Self::Mmap(m) => m.as_ref(),
            Self::Memory(v) => v.as_slice(),
        }
    }
}

/// A handle to an asset in the virtual filesystem.
#[derive(Clone)]
pub struct AssetHandle {
    path: String,
    data: Arc<AssetData>,
}

impl AssetHandle {
    /// Returns the virtual path of this asset.
    #[inline]
    #[must_use]
    pub fn path(&self) -> &str {
        &self.path
    }

    /// Access the raw byte slice of the asset without allocations.
    #[inline]
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        self.data.as_ref().as_ref()
    }

    /// Length in bytes.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.as_bytes().len()
    }

    /// Returns true if empty.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.as_bytes().is_empty()
    }
}

/// Virtual Filesystem managing mount points and memory-mapped asset caching.
pub struct VirtualFileSystem {
    mounts: HashMap<String, PathBuf>,
    cache: RwLock<HashMap<String, AssetHandle>>,
}

impl Default for VirtualFileSystem {
    fn default() -> Self {
        Self::new()
    }
}

impl VirtualFileSystem {
    /// Creates a new empty virtual filesystem.
    #[must_use]
    pub fn new() -> Self {
        Self {
            mounts: HashMap::new(),
            cache: RwLock::new(HashMap::new()),
        }
    }

    /// Mounts a virtual prefix (e.g. `assets://`) to a physical directory path.
    pub fn mount<P: AsRef<Path>>(&mut self, prefix: &str, physical_path: P) {
        let clean_prefix = prefix.trim_end_matches('/').to_string();
        self.mounts.insert(clean_prefix, physical_path.as_ref().to_path_buf());
    }

    /// Registers an in-memory asset directly into the VFS.
    pub fn register_memory_asset(&self, virtual_path: &str, bytes: Vec<u8>) -> AssetHandle {
        let handle = AssetHandle {
            path: virtual_path.to_string(),
            data: Arc::new(AssetData::Memory(bytes)),
        };
        self.cache.write().insert(virtual_path.to_string(), handle.clone());
        handle
    }

    /// Resolves a virtual URI to a physical filesystem path.
    #[must_use]
    pub fn resolve_path(&self, uri: &str) -> Option<PathBuf> {
        for (prefix, base_path) in &self.mounts {
            if let Some(suffix) = uri.strip_prefix(prefix) {
                let clean_suffix = suffix.trim_start_matches('/');
                return Some(base_path.join(clean_suffix));
            }
        }
        None
    }

    /// Loads an asset from the VFS, utilizing memory-mapping and caching.
    pub fn load(&self, uri: &str) -> Result<AssetHandle, std::io::Error> {
        // Check cache first
        if let Some(handle) = self.cache.read().get(uri) {
            return Ok(handle.clone());
        }

        let physical_path = self.resolve_path(uri).ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Unmapped virtual URI: {uri}"),
            )
        })?;

        let file = File::open(&physical_path)?;
        // SAFETY: Memory mapping is read-only.
        let mmap = unsafe { Mmap::map(&file)? };

        let handle = AssetHandle {
            path: uri.to_string(),
            data: Arc::new(AssetData::Mmap(mmap)),
        };

        self.cache.write().insert(uri.to_string(), handle.clone());
        Ok(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vfs_memory_asset_registration() {
        let vfs = VirtualFileSystem::new();
        let test_data = b"SHENRON_ENGINE_BINARY_ASSET".to_vec();
        let handle = vfs.register_memory_asset("engine://shaders/culling.wgsl", test_data);

        assert_eq!(handle.path(), "engine://shaders/culling.wgsl");
        assert_eq!(handle.as_bytes(), b"SHENRON_ENGINE_BINARY_ASSET");
        assert_eq!(handle.len(), 27);
    }
}
