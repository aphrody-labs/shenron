// SPDX-License-Identifier: Apache-2.0

#![allow(
    clippy::chunks_exact_to_as_chunks,
    clippy::collapsible_if,
    clippy::too_many_arguments,
    clippy::match_same_arms
)]

//! Shenron Engine: Unified Full-Rust AAA Game & Rendering Engine.
//!
//! Subsystems:
//! - [`core`]: Archetypal ECS, SIMD math, lock-free concurrency, frame arena allocators,
//!   and memory-mapped zero-copy Virtual File System (VFS).
//! - [`render`]: Unified GPU hardware backend (wgpu 30), 2D & 3D mesh rendering,
//!   GLB 2.0 parsing, reference CPU perspective rasterizer, clustered forward lighting,
//!   virtual geometry (meshlets), and TAA.
//! - [`canvas`]: 2D vector path flattening, manga/comic speech bubble generator,
//!   Japanese vertical typesetting (Tatechūyoko), and software rasterizer.
//! - [`asm`]: Canonical MSVC-dialect x86-64 machine code encoder, disassembler,
//!   binary format triage (PE/ELF, Shannon entropy), and memory pattern scanning.
//! - [`game`]: Deterministic fighting game simulation core, rollback netcode,
//!   hitboxes/hurtboxes, beam clashes, and WebGPU render packets.
//! - [`wasm`]: WebAssembly bindings for browser canvas and WebGPU engines.

pub mod asm;
pub mod canvas;
pub mod core;
pub mod game;
pub mod render;
pub mod wasm;

// High-level re-exports for easy consumer adoption
pub use asm::{
    AsmTriageHelper, BinaryFormat, DisasmInsn, Insn, Reg, Size, TriageReport, assemble,
    disassemble, triage_binary,
};
pub use canvas::{
    BubbleKind, BubbleTail, CanvasSurface, ColorRgba, Path2D, SpeechBubble, TextLayout,
    TextLayoutConfig, WritingDirection,
};
pub use core::vfs::{AssetData, AssetHandle, AssetStreamReader, VirtualFileSystem};
pub use render::{
    Camera3d, DeviceLimits, DeviceRequest, Geometry, GlbError, GpuBackendError, GpuContext,
    GpuDevice, GpuError, GpuReport, MeshCache, MeshData, Model, Primitive, SurfaceFormat,
    SurfaceRequest, Texture, WgslJob, parse_glb, render_model_cpu, surface_configuration,
};

/// Returns the compile-time crate version of `shenron-engine`.
#[must_use]
pub fn engine_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
