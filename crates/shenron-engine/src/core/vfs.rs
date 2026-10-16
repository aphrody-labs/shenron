// SPDX-License-Identifier: Apache-2.0

//! Memory-mapped Virtual Filesystem (VFS) with zero-copy binary streaming and CPK mounting.
//!
//! Provides URI mount mapping (`assets://`, `shaders://`, `data://`, `cpk://`),
//! memory mapping via `memmap2`, and transparent CRI CPK multi-archive resolution
//! integrated with `shenron-re`.

use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use memmap2::Mmap;
use parking_lot::{Mutex, RwLock};
use shenron_re::fs::XenoverseVfs;

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

    /// Creates a streaming zero-copy reader starting at the beginning of the asset.
    #[inline]
    #[must_use]
    pub fn stream(&self) -> AssetStreamReader<'_> {
        AssetStreamReader::new(self.as_bytes())
    }

    /// Casts the underlying asset bytes into a typed slice without allocation.
    ///
    /// # Errors
    /// Returns an `std::io::Error` if the slice length is not a multiple of `std::mem::size_of::<T>()`
    /// or if the buffer is misaligned.
    pub fn as_slice_of<T: bytemuck::Pod>(&self) -> Result<&[T], std::io::Error> {
        bytemuck::try_cast_slice(self.as_bytes()).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to cast asset bytes to typed slice: {e}"),
            )
        })
    }

    /// Casts the underlying asset bytes into a single typed struct reference without allocation.
    ///
    /// # Errors
    /// Returns an `std::io::Error` if the byte slice size or alignment does not match `T`.
    pub fn as_struct<T: bytemuck::Pod>(&self) -> Result<&T, std::io::Error> {
        bytemuck::try_from_bytes(self.as_bytes()).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to cast asset bytes to struct: {e}"),
            )
        })
    }
}

/// Zero-copy streaming reader over an immutable byte slice.
pub struct AssetStreamReader<'a> {
    data: &'a [u8],
    cursor: usize,
}

impl<'a> AssetStreamReader<'a> {
    /// Creates a new streaming reader over the slice.
    #[inline]
    #[must_use]
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, cursor: 0 }
    }

    /// Returns the current read cursor position.
    #[inline]
    #[must_use]
    pub fn position(&self) -> usize {
        self.cursor
    }

    /// Returns the number of unread bytes remaining in the stream.
    #[inline]
    #[must_use]
    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.cursor)
    }

    /// Sets the cursor position in the stream.
    pub fn seek(&mut self, pos: usize) -> Result<(), std::io::Error> {
        if pos <= self.data.len() {
            self.cursor = pos;
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "Seek position beyond end of asset stream",
            ))
        }
    }

    /// Reads an exact number of bytes as a borrowed zero-copy slice and advances the cursor.
    pub fn read_bytes(&mut self, len: usize) -> Result<&'a [u8], std::io::Error> {
        if self.remaining() < len {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "Unexpected end of asset stream",
            ));
        }
        let slice = &self.data[self.cursor..self.cursor + len];
        self.cursor += len;
        Ok(slice)
    }

    /// Reads a single byte.
    pub fn read_u8(&mut self) -> Result<u8, std::io::Error> {
        let b = self.read_bytes(1)?;
        Ok(b[0])
    }

    /// Reads a 16-bit unsigned little-endian integer.
    pub fn read_u16_le(&mut self) -> Result<u16, std::io::Error> {
        let b = self.read_bytes(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    /// Reads a 32-bit unsigned little-endian integer.
    pub fn read_u32_le(&mut self) -> Result<u32, std::io::Error> {
        let b = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    /// Reads a 64-bit unsigned little-endian integer.
    pub fn read_u64_le(&mut self) -> Result<u64, std::io::Error> {
        let b = self.read_bytes(8)?;
        Ok(u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    /// Reads a 32-bit IEEE-754 little-endian floating point number.
    pub fn read_f32_le(&mut self) -> Result<f32, std::io::Error> {
        let b = self.read_bytes(4)?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    /// Reads a contiguous slice of typed POD structures without copying.
    pub fn read_slice<T: bytemuck::Pod>(
        &mut self,
        count: usize,
    ) -> Result<&'a [T], std::io::Error> {
        let byte_len = count.checked_mul(std::mem::size_of::<T>()).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Size arithmetic overflow")
        })?;
        let bytes = self.read_bytes(byte_len)?;
        bytemuck::try_cast_slice(bytes).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Alignment or size mismatch reading POD slice: {e}"),
            )
        })
    }

    /// Reads a single POD structure reference without copying.
    pub fn read_struct<T: bytemuck::Pod>(&mut self) -> Result<&'a T, std::io::Error> {
        let byte_len = std::mem::size_of::<T>();
        let bytes = self.read_bytes(byte_len)?;
        bytemuck::try_from_bytes(bytes).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Alignment or size mismatch reading POD struct: {e}"),
            )
        })
    }
}

/// Virtual Filesystem managing mount points, memory-mapped caching, and Dragon Ball CPK archives.
pub struct VirtualFileSystem {
    mounts: HashMap<String, PathBuf>,
    cache: RwLock<HashMap<String, AssetHandle>>,
    xenoverse_vfs: Option<Arc<Mutex<XenoverseVfs>>>,
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
        Self { mounts: HashMap::new(), cache: RwLock::new(HashMap::new()), xenoverse_vfs: None }
    }

    /// Mounts a virtual prefix (e.g. `assets://`) to a physical directory path.
    pub fn mount<P: AsRef<Path>>(&mut self, prefix: &str, physical_path: P) {
        let clean_prefix = prefix.trim_end_matches('/').to_string();
        self.mounts.insert(clean_prefix, physical_path.as_ref().to_path_buf());
    }

    /// Mounts a Dragon Ball Xenoverse 2 game directory with CPK archives and loose file overlay.
    pub fn mount_xenoverse<P: AsRef<Path>>(
        &mut self,
        game_dir: P,
    ) -> Result<usize, std::io::Error> {
        let mut vfs = XenoverseVfs::new();
        let count =
            vfs.mount_game_dir(game_dir).map_err(|e| std::io::Error::other(e.to_string()))?;
        self.xenoverse_vfs = Some(Arc::new(Mutex::new(vfs)));
        Ok(count)
    }

    /// Mounts an in-memory CPK buffer into the underlying Xenoverse archive manager.
    pub fn mount_cpk_memory(
        &mut self,
        archive_name: &str,
        buffer: Vec<u8>,
    ) -> Result<usize, std::io::Error> {
        if self.xenoverse_vfs.is_none() {
            self.xenoverse_vfs = Some(Arc::new(Mutex::new(XenoverseVfs::new())));
        }
        let xv_vfs = self.xenoverse_vfs.as_ref().unwrap();
        xv_vfs
            .lock()
            .mount_cpk_memory(archive_name, buffer)
            .map_err(|e| std::io::Error::other(e.to_string()))
    }

    /// Returns a reference to the mounted Xenoverse VFS if initialized.
    pub fn xenoverse(&self) -> Option<Arc<Mutex<XenoverseVfs>>> {
        self.xenoverse_vfs.clone()
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

    /// Loads an asset from the VFS, utilizing memory-mapping, CPK streaming, and caching.
    pub fn load(&self, uri: &str) -> Result<AssetHandle, std::io::Error> {
        // 1. Check cache first
        if let Some(handle) = self.cache.read().get(uri) {
            return Ok(handle.clone());
        }

        // 2. Check Xenoverse CPK / Data schemes (`data://`, `cpk://`, `chara://`, `system://`)
        if let Some(xv_arc) = &self.xenoverse_vfs {
            let clean_path = if let Some(stripped) = uri.strip_prefix("data://") {
                stripped
            } else if let Some(stripped) = uri.strip_prefix("cpk://") {
                stripped
            } else if let Some(stripped) = uri.strip_prefix("chara://") {
                return self.load_character_asset(stripped);
            } else {
                uri.strip_prefix("system://").unwrap_or_default()
            };

            if !clean_path.is_empty() {
                let xv = xv_arc.lock();
                if let Ok(bytes) = xv.read_file(clean_path) {
                    let handle = AssetHandle {
                        path: uri.to_string(),
                        data: Arc::new(AssetData::Memory(bytes)),
                    };
                    self.cache.write().insert(uri.to_string(), handle.clone());
                    return Ok(handle);
                }
            }
        }

        // 3. Fallback to physical mounts
        let physical_path = self.resolve_path(uri).ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Unmapped virtual URI: {uri}"),
            )
        })?;

        let file = File::open(&physical_path)?;
        // SAFETY: Memory mapping is read-only.
        let mmap = unsafe { Mmap::map(&file)? };

        let handle = AssetHandle { path: uri.to_string(), data: Arc::new(AssetData::Mmap(mmap)) };

        self.cache.write().insert(uri.to_string(), handle.clone());
        Ok(handle)
    }

    fn load_character_asset(&self, subpath: &str) -> Result<AssetHandle, std::io::Error> {
        let full_path = format!("chara/{subpath}");
        let xv_arc = self.xenoverse_vfs.as_ref().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "Xenoverse VFS not mounted")
        })?;

        let xv = xv_arc.lock();
        let bytes = xv
            .read_file(&full_path)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))?;

        let uri = format!("chara://{subpath}");
        let handle = AssetHandle { path: uri.clone(), data: Arc::new(AssetData::Memory(bytes)) };
        self.cache.write().insert(uri, handle.clone());
        Ok(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shenron_re::fs::cpk::CpkArchive;

    #[test]
    fn test_vfs_memory_asset_registration() {
        let vfs = VirtualFileSystem::new();
        let test_data = b"SHENRON_ENGINE_BINARY_ASSET".to_vec();
        let handle = vfs.register_memory_asset("engine://shaders/culling.wgsl", test_data);

        assert_eq!(handle.path(), "engine://shaders/culling.wgsl");
        assert_eq!(handle.as_bytes(), b"SHENRON_ENGINE_BINARY_ASSET");
        assert_eq!(handle.len(), 27);
    }

    #[test]
    fn test_vfs_cpk_mounting_and_loading() {
        let mut vfs = VirtualFileSystem::new();
        let cpk_data = CpkArchive::create_mock(&[
            ("chara/GOK/GOK.emd", b"MOCK_EMD_GOKU"),
            ("system/custom_skill.cus", b"MOCK_CUS_DATA"),
        ]);

        vfs.mount_cpk_memory("data2.cpk", cpk_data).expect("mount cpk");

        let handle1 = vfs.load("data://chara/GOK/GOK.emd").expect("load data://");
        assert_eq!(handle1.as_bytes(), b"MOCK_EMD_GOKU");

        let handle2 = vfs.load("chara://GOK/GOK.emd").expect("load chara://");
        assert_eq!(handle2.as_bytes(), b"MOCK_EMD_GOKU");
    }

    #[test]
    fn test_vfs_zero_copy_streaming() {
        let vfs = VirtualFileSystem::new();
        let mut raw = Vec::new();
        raw.extend_from_slice(&12345u32.to_le_bytes());
        raw.extend_from_slice(&67890u32.to_le_bytes());
        raw.extend_from_slice(&std::f32::consts::PI.to_le_bytes());

        let handle = vfs.register_memory_asset("engine://data/binary.bin", raw);
        let mut stream = handle.stream();

        assert_eq!(stream.read_u32_le().unwrap(), 12345);
        assert_eq!(stream.read_u32_le().unwrap(), 67890);
        let f = stream.read_f32_le().unwrap();
        assert!((f - std::f32::consts::PI).abs() < 1e-5);
        assert_eq!(stream.remaining(), 0);

        let slice_u32 = handle.as_slice_of::<u32>().unwrap();
        assert_eq!(slice_u32[0], 12345);
        assert_eq!(slice_u32[1], 67890);
    }
}
