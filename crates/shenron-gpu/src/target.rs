// SPDX-License-Identifier: Apache-2.0
//! Offscreen render targets and their CPU readback.
//!
//! Vello draws with a compute shader, so it needs a storage texture, not a swap-chain image:
//! every frame is rendered into a [`RenderTarget`] (`Rgba8Unorm`, storage + render attachment)
//! and then either copied to a surface (see [`crate::present`]) or read back to the CPU.

use wgpu::{
    Buffer, BufferDescriptor, BufferUsages, CommandEncoder, Device, Extent3d, TexelCopyBufferInfo,
    TexelCopyBufferLayout, Texture, TextureDescriptor, TextureDimension, TextureFormat,
    TextureUsages, TextureView, TextureViewDescriptor,
};

use crate::error::{GpuError, Result};

/// The format Vello renders to and the readback delivers: 8-bit RGBA, not sRGB-encoded.
pub const TARGET_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;
const BYTES_PER_PIXEL: u32 = 4;

/// Rows of a texture copied into a buffer must start on a multiple of
/// `COPY_BYTES_PER_ROW_ALIGNMENT` (256) bytes: the buffer holds padded rows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RowLayout {
    pub width: u32,
    pub height: u32,
    pub bytes_per_pixel: u32,
    /// `width * bytes_per_pixel`.
    pub unpadded_bytes_per_row: u32,
    /// The same, rounded up to the copy alignment.
    pub padded_bytes_per_row: u32,
}

impl RowLayout {
    /// The layout of a `width` x `height` image with `bytes_per_pixel` bytes per pixel.
    pub fn new(width: u32, height: u32, bytes_per_pixel: u32) -> Result<Self> {
        let invalid = || GpuError::InvalidSurface { width, height };
        if width == 0 || height == 0 || bytes_per_pixel == 0 {
            return Err(invalid());
        }
        let unpadded = width.checked_mul(bytes_per_pixel).ok_or_else(invalid)?;
        let padded = unpadded
            .checked_next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT)
            .ok_or_else(invalid)?;
        // The whole buffer must be addressable.
        u64::from(padded).checked_mul(u64::from(height)).ok_or_else(invalid)?;
        Ok(Self {
            width,
            height,
            bytes_per_pixel,
            unpadded_bytes_per_row: unpadded,
            padded_bytes_per_row: padded,
        })
    }

    /// The layout of an RGBA8 image.
    pub fn rgba8(width: u32, height: u32) -> Result<Self> {
        Self::new(width, height, BYTES_PER_PIXEL)
    }

    /// Size in bytes of the readback buffer (padded rows).
    #[must_use]
    pub fn buffer_size(&self) -> u64 {
        u64::from(self.padded_bytes_per_row) * u64::from(self.height)
    }

    /// Size in bytes of the tightly packed image.
    #[must_use]
    pub fn packed_size(&self) -> usize {
        self.unpadded_bytes_per_row as usize * self.height as usize
    }

    /// Removes the row padding from a mapped readback buffer.
    #[must_use]
    pub fn unpad(&self, mapped: &[u8]) -> Vec<u8> {
        let padded = self.padded_bytes_per_row as usize;
        let row = self.unpadded_bytes_per_row as usize;
        let mut pixels = Vec::with_capacity(self.packed_size());
        for chunk in mapped.chunks_exact(padded).take(self.height as usize) {
            pixels.extend_from_slice(&chunk[..row]);
        }
        pixels
    }
}

/// A texture Vello can render to, with the buffer its pixels are read back into.
pub struct RenderTarget {
    layout: RowLayout,
    texture: Texture,
    view: TextureView,
    readback: Buffer,
}

impl RenderTarget {
    /// Allocates a target, refusing a size the device cannot hold (texture side, readback buffer).
    pub fn new(device: &Device, label: &str, width: u32, height: u32) -> Result<Self> {
        let layout = RowLayout::rgba8(width, height)?;
        let limits = device.limits();
        let side_limit = limits.max_texture_dimension_2d;
        if width > side_limit || height > side_limit {
            return Err(GpuError::SurfaceTooLarge { width, height, limit: side_limit });
        }
        if layout.buffer_size() > limits.max_buffer_size {
            return Err(GpuError::Readback(format!(
                "a {width}x{height} readback needs {} bytes, the device allows buffers of {}",
                layout.buffer_size(),
                limits.max_buffer_size
            )));
        }
        let texture = device.create_texture(&TextureDescriptor {
            label: Some(label),
            size: Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TARGET_FORMAT,
            usage: TextureUsages::STORAGE_BINDING
                | TextureUsages::TEXTURE_BINDING
                | TextureUsages::RENDER_ATTACHMENT
                | TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&TextureViewDescriptor::default());
        let readback = device.create_buffer(&BufferDescriptor {
            label: Some(label),
            size: layout.buffer_size(),
            usage: BufferUsages::MAP_READ | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        Ok(Self { layout, texture, view, readback })
    }

    /// `(width, height)` in pixels.
    #[must_use]
    pub fn size(&self) -> (u32, u32) {
        (self.layout.width, self.layout.height)
    }

    #[must_use]
    pub fn layout(&self) -> &RowLayout {
        &self.layout
    }

    #[must_use]
    pub fn texture(&self) -> &Texture {
        &self.texture
    }

    /// The view Vello renders to.
    #[must_use]
    pub fn view(&self) -> &TextureView {
        &self.view
    }

    /// The buffer the pixels are copied into (for callers that map it themselves, e.g. a browser).
    #[must_use]
    pub fn readback_buffer(&self) -> &Buffer {
        &self.readback
    }

    /// Records the copy of the whole texture into the readback buffer.
    pub fn copy_to_readback(&self, encoder: &mut CommandEncoder) {
        encoder.copy_texture_to_buffer(
            self.texture.as_image_copy(),
            TexelCopyBufferInfo {
                buffer: &self.readback,
                layout: TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.layout.padded_bytes_per_row),
                    rows_per_image: None,
                },
            },
            Extent3d {
                width: self.layout.width,
                height: self.layout.height,
                depth_or_array_layers: 1,
            },
        );
    }

    /// Maps the readback buffer, waits for `submission` and returns the tightly packed RGBA8
    /// pixels (native). A timeout or a lost device is an `Err`; the target must then be dropped,
    /// not reused, because its buffer may still be pending.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn read_blocking(
        &self,
        context: &crate::context::GpuContext,
        submission: wgpu::SubmissionIndex,
        timeout: std::time::Duration,
    ) -> Result<Vec<u8>> {
        let slice = self.readback.slice(..);
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        context.wait_for(submission, timeout)?;
        receiver
            .recv()
            .map_err(|_| GpuError::Readback("wgpu dropped the mapping callback".into()))?
            .map_err(|error| {
                GpuError::Readback(format!("mapping the readback buffer failed: {error}"))
            })?;
        let mapped = slice.get_mapped_range().map_err(|error| {
            GpuError::Readback(format!("reading the mapped range failed: {error}"))
        })?;
        let pixels = self.layout.unpad(&mapped);
        drop(mapped);
        self.readback.unmap();
        Ok(pixels)
    }
}

/// A small pool of render targets: exports of pages of the same size reuse their textures and
/// readback buffers instead of allocating them again.
pub struct TargetPool {
    targets: Vec<RenderTarget>,
    capacity: usize,
}

impl TargetPool {
    /// A pool that keeps at most `capacity` idle targets.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self { targets: Vec::new(), capacity }
    }

    /// A target of exactly this size: an idle one, else a new one.
    pub fn take(
        &mut self,
        device: &Device,
        label: &str,
        width: u32,
        height: u32,
    ) -> Result<RenderTarget> {
        match self.targets.iter().position(|target| target.size() == (width, height)) {
            Some(position) => Ok(self.targets.swap_remove(position)),
            None => RenderTarget::new(device, label, width, height),
        }
    }

    /// Gives a target back; it is dropped when the pool is full.
    pub fn put(&mut self, target: RenderTarget) {
        if self.targets.len() < self.capacity {
            self.targets.push(target);
        }
    }

    /// Idle targets currently held.
    #[must_use]
    pub fn len(&self) -> usize {
        self.targets.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.targets.is_empty()
    }

    /// Drops every idle target (after a device loss, or to release memory).
    pub fn clear(&mut self) {
        self.targets.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_are_padded_to_the_copy_alignment() {
        let layout = RowLayout::rgba8(100, 3).expect("valid");
        assert_eq!(layout.unpadded_bytes_per_row, 400);
        assert_eq!(layout.padded_bytes_per_row, 512);
        assert_eq!(layout.buffer_size(), 512 * 3);
        assert_eq!(layout.packed_size(), 1200);
        // Already aligned: no padding.
        let aligned = RowLayout::rgba8(64, 2).expect("valid");
        assert_eq!(aligned.padded_bytes_per_row, aligned.unpadded_bytes_per_row);
    }

    #[test]
    fn unpadding_keeps_exactly_the_pixels() {
        let layout = RowLayout::rgba8(2, 2).expect("valid");
        assert_eq!(layout.padded_bytes_per_row, 256);
        let mut mapped = vec![0xAA; 256 * 2];
        mapped[..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
        mapped[256..264].copy_from_slice(&[9, 10, 11, 12, 13, 14, 15, 16]);
        assert_eq!(layout.unpad(&mapped), (1..=16).collect::<Vec<u8>>());
    }

    #[test]
    fn a_degenerate_size_is_rejected() {
        assert_eq!(RowLayout::rgba8(0, 10), Err(GpuError::InvalidSurface { width: 0, height: 10 }));
        assert_eq!(RowLayout::rgba8(10, 0), Err(GpuError::InvalidSurface { width: 10, height: 0 }));
        assert!(RowLayout::rgba8(u32::MAX, 1).is_err());
    }
}
