# wgpu 30.0.1 API map — Ray tracing (BLAS, TLAS)

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 21 public items.

### AABB_GEOMETRY_MIN_STRIDE — constant

`const AABB_GEOMETRY_MIN_STRIDE: BufferAddress = 24`

Minimum stride for AABB geometry (24 bytes: two `vec3<f32>`).

### AccelerationStructureFlags — type alias

`type AccelerationStructureFlags = AccelerationStructureFlags`

Flags for acceleration structures

Opaque (private fields).

Methods and constants:

- `const ALLOW_UPDATE: Self` — Allow for incremental updates (no change in size), currently this is unimplemented and will build as normal (this is fine, update vs build should be unnoticeab…
- `const ALLOW_COMPACTION: Self` — Allow the acceleration structure to be compacted in a copy operation (`Blas::prepare_for_compaction`, `CommandEncoder::compact_blas`).
- `const PREFER_FAST_TRACE: Self` — Optimize for fast ray tracing performance, recommended if the geometry is unlikely to change (e.g. in a game: non-interactive scene geometry)
- `const PREFER_FAST_BUILD: Self` — Optimize for fast build time, recommended if geometry is likely to change frequently (e.g. in a game: player model).
- `const LOW_MEMORY: Self` — Optimize for low memory footprint (both while building and in the output BLAS).
- `const USE_TRANSFORM: Self` — Use `BlasTriangleGeometry::transform_buffer` when building a BLAS (only allowed in BLAS creation)
- `const ALLOW_RAY_HIT_VERTEX_RETURN: Self` — Allow retrieval of the vertices of the triangle hit by a ray.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u8` — Get the underlying bits value.
- `const fn from_bits(bits: u8) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u8) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u8) -> Self` — Convert from a bits value exactly.
- `fn from_name(name: &str) -> $crate::__private::core::option::Option<Self>` — Get a flags value with the bits of a flag with the given name set.
- `const fn is_empty(&self) -> bool` — Whether all bits in `self` are unset.
- `const fn is_all(&self) -> bool` — Whether all known bits in this flags value are set.
- `const fn intersects(&self, other: Self) -> bool` — Whether any set bits in `other` are also set in `self`.
- `const fn contains(&self, other: Self) -> bool` — Whether all set bits in `other` are also set in `self`.
- `fn insert(&mut self, other: Self)` — The bitwise or (`\|`) of the bits in `self` and `other`.
- `fn remove(&mut self, other: Self)` — The intersection of `self` with the complement of `other` (`&!`).
- `fn toggle(&mut self, other: Self)` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`.
- `fn set(&mut self, other: Self, value: bool)` — Call `insert` when `value` is `true` or `remove` when `value` is `false`.
- `const fn intersection(self, other: Self) -> Self` — The bitwise and (`&`) of the bits in `self` and `other`. _[must_use]_
- `const fn union(self, other: Self) -> Self` — The bitwise or (`\|`) of the bits in `self` and `other`. _[must_use]_
- `const fn difference(self, other: Self) -> Self` — The intersection of `self` with the complement of `other` (`&!`). _[must_use]_
- `const fn symmetric_difference(self, other: Self) -> Self` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`. _[must_use]_
- `const fn complement(self) -> Self` — The bitwise negation (`!`) of the bits in `self`, truncating the result. _[must_use]_
- `const fn iter(&self) -> $crate::iter::Iter<AccelerationStructureFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<AccelerationStructureFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<AccelerationStructureFlags>`, `Flags`, `FromIterator<AccelerationStructureFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### AccelerationStructureGeometryFlags — type alias

`type AccelerationStructureGeometryFlags = AccelerationStructureGeometryFlags`

Flags for acceleration structure geometries

Opaque (private fields).

Methods and constants:

- `const OPAQUE: Self` — Is OPAQUE (is there no alpha test) recommended as currently in naga there is no candidate intersections yet so currently BLASes without this flag will not have…
- `const NO_DUPLICATE_ANY_HIT_INVOCATION: Self` — NO_DUPLICATE_ANY_HIT_INVOCATION, not useful unless using hal with wgpu, ray-tracing pipelines are not supported in wgpu so any-hit shaders do not exist. For wh…
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u8` — Get the underlying bits value.
- `const fn from_bits(bits: u8) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u8) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u8) -> Self` — Convert from a bits value exactly.
- `fn from_name(name: &str) -> $crate::__private::core::option::Option<Self>` — Get a flags value with the bits of a flag with the given name set.
- `const fn is_empty(&self) -> bool` — Whether all bits in `self` are unset.
- `const fn is_all(&self) -> bool` — Whether all known bits in this flags value are set.
- `const fn intersects(&self, other: Self) -> bool` — Whether any set bits in `other` are also set in `self`.
- `const fn contains(&self, other: Self) -> bool` — Whether all set bits in `other` are also set in `self`.
- `fn insert(&mut self, other: Self)` — The bitwise or (`\|`) of the bits in `self` and `other`.
- `fn remove(&mut self, other: Self)` — The intersection of `self` with the complement of `other` (`&!`).
- `fn toggle(&mut self, other: Self)` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`.
- `fn set(&mut self, other: Self, value: bool)` — Call `insert` when `value` is `true` or `remove` when `value` is `false`.
- `const fn intersection(self, other: Self) -> Self` — The bitwise and (`&`) of the bits in `self` and `other`. _[must_use]_
- `const fn union(self, other: Self) -> Self` — The bitwise or (`\|`) of the bits in `self` and `other`. _[must_use]_
- `const fn difference(self, other: Self) -> Self` — The intersection of `self` with the complement of `other` (`&!`). _[must_use]_
- `const fn symmetric_difference(self, other: Self) -> Self` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`. _[must_use]_
- `const fn complement(self) -> Self` — The bitwise negation (`!`) of the bits in `self`, truncating the result. _[must_use]_
- `const fn iter(&self) -> $crate::iter::Iter<AccelerationStructureGeometryFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<AccelerationStructureGeometryFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<AccelerationStructureGeometryFlags>`, `Flags`, `FromIterator<AccelerationStructureGeometryFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### AccelerationStructureUpdateMode — type alias

`type AccelerationStructureUpdateMode = AccelerationStructureUpdateMode`

Update mode for acceleration structure builds.

Variants (2):

- `Build` — Always perform a full build.
- `PreferUpdate` — If possible, perform an incremental update.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Blas — struct

Bottom Level Acceleration Structure (BLAS).

Opaque (private fields).

Methods and constants:

- `fn handle(&self) -> Option<u64>` — Raw handle to the acceleration structure, used inside raw instance buffers.
- `unsafe fn as_hal<A: hal::Api>(&mut self) -> Option<impl Deref<Target = <A as >::AccelerationStructure> + WasmNotSendSync>` — Get the [`wgpu_hal`] acceleration structure from this `Blas`.
- `fn prepare_compaction_async(&self, callback: impl FnOnce(Result<(), BlasAsyncError>) + WasmNotSend + 'static)` — Asynchronously prepares this BLAS for compaction. The callback is called once all builds using this BLAS are finished and the BLAS is compactable. This can be checked using [`Blas::ready_for_compaction`]. Rebuilding thi…
- `fn ready_for_compaction(&self) -> bool` — Checks whether this BLAS is ready for compaction. The returned value is `true` if [`Blas::prepare_compaction_async`]'s callback was called with a non-error value, otherwise this is `false`.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### BlasAabbGeometry`<'a>` — struct

Definition for an axis-aligned bounding box geometry group for a bottom level acceleration structure.

Fields:

- `size: &'a BlasAABBGeometrySizeDescriptor` — Sub descriptor for the size defining attributes of this geometry.
- `stride: BufferAddress` — Stride in bytes between consecutive AABB primitives in the buffer (at least [`AABB_GEOMETRY_MIN_STRIDE`], and must be a multiple of 8).
- `aabb_buffer: &'a Buffer` — Buffer containing packed AABB primitives (layout determined by `size.stride`).
- `primitive_offset: u32` — Byte offset to the first AABB primitive (must be a multiple of 8).

Implements: `Debug`

### BlasAABBGeometrySizeDescriptor — type alias

`type BlasAABBGeometrySizeDescriptor = BlasAABBGeometrySizeDescriptor`

Descriptor for size-defining attributes of one AABB geometry group in a bottom level acceleration structure.

Fields:

- `primitive_count: u32` — Number of AABB primitives in this geometry.
- `flags: AccelerationStructureGeometryFlags` — Flags for the geometry.

Implements: `Clone`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### BlasAsyncError — struct

Error occurred when trying to asynchronously prepare a blas for compaction.

Implements: `Clone`, `Debug`, `Display`, `Eq`, `Error`, `PartialEq`, `StructuralPartialEq`

### BlasBuildEntry`<'a>` — struct

Builds the given sets of geometry into the given [Blas].

Fields:

- `blas: &'a Blas` — Reference to the acceleration structure.
- `geometry: BlasGeometries<'a>` — Geometries.

Implements: `Debug`

### BlasGeometries`<'a>` — enum

Contains the sets of geometry that go into a [Blas].

Variants (2):

- `TriangleGeometries(alloc::vec::Vec<BlasTriangleGeometry<'a>>)` — Triangle geometry variant.
- `AabbGeometries(alloc::vec::Vec<BlasAabbGeometry<'a>>)` — Procedural AABB geometry variant.

Implements: `Debug`

### BlasGeometrySizeDescriptors — type alias

`type BlasGeometrySizeDescriptors = BlasGeometrySizeDescriptors`

Descriptor for all size defining attributes of all geometries inside a bottom level acceleration structure.

Variants (2):

- `Triangles { descriptors: alloc::vec::Vec<BlasTriangleGeometrySizeDescriptor> }` — Triangle geometry version.
- `AABBs { descriptors: alloc::vec::Vec<BlasAABBGeometrySizeDescriptor> }` — AABB geometry version.

Implements: `Clone`, `Debug`

### BlasTriangleGeometry`<'a>` — struct

Definition for a triangle geometry for a Bottom Level Acceleration Structure (BLAS).

Fields:

- `size: &'a BlasTriangleGeometrySizeDescriptor` — Sub descriptor for the size defining attributes of a triangle geometry.
- `vertex_buffer: &'a Buffer` — Vertex buffer.
- `first_vertex: u32` — Offset into the vertex buffer as a factor of the vertex stride.
- `vertex_stride: BufferAddress` — Vertex stride, must be greater than [`wgpu_types::VertexFormat::min_acceleration_structure_vertex_stride`] of the format and must be a multiple of [`wgpu_types::VertexFormat::acce…
- `index_buffer: Option<&'a Buffer>` — Index buffer (optional).
- `first_index: Option<u32>` — Number of indexes to skip in the index buffer (optional, required if index buffer is present).
- `transform_buffer: Option<&'a Buffer>` — Transform buffer containing 3x4 (rows x columns, row major) affine transform matrices `[f32; 12]` (optional).
- `transform_buffer_offset: Option<BufferAddress>` — Transform buffer offset in bytes (optional, required if transform buffer is present).

Implements: `Debug`

### BlasTriangleGeometrySizeDescriptor — type alias

`type BlasTriangleGeometrySizeDescriptor = BlasTriangleGeometrySizeDescriptor`

Descriptor for all size defining attributes of a single triangle geometry inside a bottom level acceleration structure.

Fields:

- `vertex_format: VertexFormat` — Format of a vertex position, must be [`VertexFormat::Float32x3`] with just [`Features::EXPERIMENTAL_RAY_QUERY`] but [`Features::EXTENDED_ACCELERATION_STRUCTURE_VERTEX_FORMATS`] ad…
- `vertex_count: u32` — Number of vertices.
- `index_format: Option<IndexFormat>` — Format of an index. Only needed if an index buffer is used. If `index_format` is provided `index_count` is required.
- `index_count: Option<u32>` — Number of indices. Only needed if an index buffer is used. If `index_count` is provided `index_format` is required.
- `flags: AccelerationStructureGeometryFlags` — Flags for the geometry.

Implements: `Clone`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### ContextBlasAabbGeometry`<'a>` — struct

Context version of [BlasAabbGeometry].

Opaque (private fields).

### ContextBlasBuildEntry`<'a>` — struct

Context version see [BlasBuildEntry].

Opaque (private fields).

### ContextBlasGeometries`<'a>` — enum

Context version of [BlasGeometries].

Variants (2):

- `TriangleGeometries(alloc::boxed::Box<dyn Iterator<Item = ContextBlasTriangleGeometry<'a>> + 'a>)` — Triangle geometries.
- `AabbGeometries(alloc::boxed::Box<dyn Iterator<Item = ContextBlasAabbGeometry<'a>> + 'a>)` — AABB geometries.

### ContextBlasTriangleGeometry`<'a>` — struct

Context version of [BlasTriangleGeometry].

Opaque (private fields).

### CreateBlasDescriptor — type alias

`type CreateBlasDescriptor = CreateBlasDescriptor<Label<'a>>`

Descriptor for creating a bottom level acceleration structure.

Fields:

- `label: L` — Label for the bottom level acceleration structure.
- `flags: AccelerationStructureFlags` — Flags for the bottom level acceleration structure.
- `update_mode: AccelerationStructureUpdateMode` — Update mode for the bottom level acceleration structure.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> CreateBlasDescriptor<K>` — Takes a closure and maps the label of the blas descriptor into another.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### CreateTlasDescriptor — type alias

`type CreateTlasDescriptor = CreateTlasDescriptor<Label<'a>>`

Descriptor for creating a top level acceleration structure.

Fields:

- `label: L` — Label for the top level acceleration structure.
- `max_instances: u32` — Number of instances that can be stored in the acceleration structure.
- `flags: AccelerationStructureFlags` — Flags for the bottom level acceleration structure.
- `update_mode: AccelerationStructureUpdateMode` — Update mode for the bottom level acceleration structure.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> CreateTlasDescriptor<K>` — Takes a closure and maps the label of the blas descriptor into another.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Tlas — struct

Top Level Acceleration Structure (TLAS).

Opaque (private fields).

Methods and constants:

- `unsafe fn as_hal<A: hal::Api>(&mut self) -> Option<impl Deref<Target = <A as >::AccelerationStructure>>` — Get the [`wgpu_hal`] acceleration structure from this `Tlas`.
- `fn get(&self) -> &[Option<TlasInstance>]` — Get a reference to all instances.
- `fn get_mut_slice(&mut self, range: Range<usize>) -> Option<&mut [Option<TlasInstance>]>` — Get a mutable slice to a range of instances. Returns None if the range is out of bounds. All elements from the lowest accessed index up are marked as modified. For best performance it is recommended to prefer access to…
- `fn get_mut_single(&mut self, index: usize) -> Option<&mut Option<TlasInstance>>` — Get a single mutable reference to an instance. Returns None if the range is out of bounds. All elements from the lowest accessed index up are marked as modified. For best performance it is recommended to prefer access t…
- `fn as_binding(&self) -> BindingResource<'_>` — Get the binding resource for the underling acceleration structure, to be used when creating a [`BindGroup`]

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Index<Range<usize>>`, `Index<usize>`, `IndexMut<Range<usize>>`, `IndexMut<usize>`, `Ord`, `PartialEq`, `PartialOrd`

### TlasInstance — struct

Safe instance for a [Tlas].

Fields:

- `transform: [f32; 12]` — Affine transform matrix 3x4 (rows x columns, row major order).
- `custom_data: u32` — Custom index for the instance used inside the shader.
- `mask: u8` — Mask for the instance used inside the shader to filter instances. Reports hit only if `(shader_cull_mask & tlas_instance.mask) != 0u`.
- (private fields omitted)

Methods and constants:

- `fn new(blas: &Blas, transform: [f32; 12], custom_data: u32, mask: u8) -> Self` — Construct TlasInstance. - blas: Reference to the bottom level acceleration structure - transform: Transform buffer offset in bytes (optional, required if transform buffer is present) - custom_data: Custom index for the…
- `fn set_blas(&mut self, blas: &Blas)` — Set the bottom level acceleration structure.

Implements: `Clone`, `Debug`
