# wgpu 30.0.1 API map — Buffers, textures, samplers, queries

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 48 public items.

### AddressMode — enum

How edges should be handled in texture addressing.

Variants (4):

- `ClampToEdge = 0` — Clamp the value to the edge of the texture
- `Repeat = 1` — Repeat the texture in a tiling fashion
- `MirrorRepeat = 2` — Repeat the texture, mirroring it every repeat
- `ClampToBorder = 3` — Clamp the value to the border of the texture Requires feature [`Features::ADDRESS_MODE_CLAMP_TO_BORDER`]

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Buffer — struct

Handle to a GPU-accessible buffer.

Opaque (private fields).

Methods and constants:

- `fn as_entire_binding(&self) -> BindingResource<'_>` — Return the binding view of the entire buffer.
- `fn as_entire_buffer_binding(&self) -> BufferBinding<'_>` — Return the binding view of the entire buffer.
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl core::ops::Deref<Target = <A as >::Buffer> + WasmNotSendSync>` — Get the [`wgpu_hal`] buffer from this `Buffer`.
- `fn slice<S: RangeBounds<BufferAddress>>(&self, bounds: S) -> BufferSlice<'_>` — Returns a [`BufferSlice`] referring to the portion of `self`'s contents indicated by `bounds`. Regardless of what sort of data `self` stores, `bounds` start and end are given in bytes.
- `fn unmap(&self)` — Unmaps the buffer from host memory.
- `fn destroy(&self)` — Destroy the associated native resources as soon as possible.
- `fn size(&self) -> BufferAddress` — Returns the length of the buffer allocation in bytes.
- `fn usage(&self) -> BufferUsages` — Returns the allowed usages for this `Buffer`.
- `fn map_async<S: RangeBounds<BufferAddress>>(&self, mode: MapMode, bounds: S, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — Map the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Self::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`Ok`].
- `fn get_mapped_range<S: RangeBounds<BufferAddress>>(&self, bounds: S) -> Result<BufferView, MapRangeError>` — Gain read-only access to the bytes of a [mapped] [`Buffer`].
- `fn get_mapped_range_mut<S: RangeBounds<BufferAddress>>(&self, bounds: S) -> Result<BufferViewMut, MapRangeError>` — Gain write access to the bytes of a [mapped] [`Buffer`].

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### BufferAsyncError — struct

Error occurred when trying to async map a buffer.

Implements: `Clone`, `Debug`, `Display`, `Eq`, `Error`, `PartialEq`, `StructuralPartialEq`

### BufferDescriptor — type alias

`type BufferDescriptor = BufferDescriptor<Label<'a>>`

Describes a [`Buffer`](../wgpu/struct.Buffer.html).

Fields:

- `label: L` — Debug label of a buffer. This will show up in graphics debuggers for easy identification.
- `size: BufferAddress` — Size of a buffer, in bytes.
- `usage: BufferUsages` — Usages of a buffer. If the buffer is used in any way that isn't specified here, the operation will panic.
- `mapped_at_creation: bool` — Allows a buffer to be mapped immediately after they are made. It does not have to be [`BufferUsages::MAP_READ`] or [`BufferUsages::MAP_WRITE`], all buffers are allowed to be mappe…

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> BufferDescriptor<K>` — Takes a closure and maps the label of the buffer descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BufferSlice`<'a>` — struct

A slice of a [`Buffer`], to be mapped, used for vertex or index data, or the like.

Opaque (private fields).

Methods and constants:

- `fn slice<S: RangeBounds<BufferAddress>>(&self, bounds: S) -> BufferSlice<'a>` — Return another [`BufferSlice`] referring to the portion of `self`'s contents indicated by `bounds`.
- `fn map_async(&self, mode: MapMode, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — Map the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Self::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`Ok`].
- `fn get_mapped_range(&self) -> Result<BufferView, MapRangeError>` — Gain read-only access to the bytes of a [mapped] [`Buffer`].
- `fn get_mapped_range_mut(&self) -> Result<BufferViewMut, MapRangeError>` — Gain write-only access to the bytes of a [mapped] [`Buffer`].
- `fn buffer(&self) -> &'a Buffer` — Returns the buffer this is a slice of.
- `fn offset(&self) -> BufferAddress` — Returns the offset in [`Self::buffer()`] this slice starts at.
- `fn size(&self) -> BufferAddress` — Returns the size of this slice.

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `StructuralPartialEq`, `TryFrom<BufferSlice<'a>>`

### BufferTextureCopyInfo — struct

Information about a copy between a buffer and a texture.

Fields:

- `copy_width: u64` — The width of the copy region in pixels.
- `copy_height: u64` — The height of the copy region in pixels.
- `depth_or_array_layers: u64` — The depth of the copy region in pixels.
- `offset: u64` — The offset in the buffer where the copy starts.
- `block_size_bytes: u64` — The size of a single texture texel block in bytes.
- `block_width_texels: u64` — The number of texel in a texel block in the x direction.
- `block_height_texels: u64` — The number of texel in a texel block in the y direction.
- `width_blocks: u64` — The width of the copy region in blocks.
- `height_blocks: u64` — The height of the copy region in blocks.
- `row_bytes_dense: u64` — The number of bytes in the last row of the copy region.
- `row_stride_bytes: u64` — The stride in bytes between the start of one row in an image and the next row in the same image.
- `image_stride_rows: u64` — The stride in rows between the start of one image and the next image.
- `image_stride_bytes: u64` — The stride in bytes between the start of one image and the next image.
- `image_rows_dense: u64` — The number of rows in a densely packed list of images.
- `image_bytes_dense: u64` — The number of bytes in a densely packed list of images.
- `bytes_in_copy: u64` — The total number of bytes in the copy region.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### BufferTransition`<T>` — struct

A buffer transition for use with `CommandEncoder::transition_resources`.

Fields:

- `buffer: T` — The buffer to transition.
- `state: BufferUses` — The new state to transition to.

Implements: `Clone`, `Debug`

### BufferUsages — struct

Different ways that you can use a buffer.

Opaque (private fields).

Methods and constants:

- `const MAP_READ: Self` — Allow a buffer to be mapped for reading using [`Buffer::map_async`] + [`Buffer::get_mapped_range`]. This does not include creating a buffer with [`BufferDescri…
- `const MAP_WRITE: Self` — Allow a buffer to be mapped for writing using [`Buffer::map_async`] + [`Buffer::get_mapped_range_mut`]. This does not include creating a buffer with [`BufferDe…
- `const COPY_SRC: Self` — Allow a buffer to be the source buffer for a [`CommandEncoder::copy_buffer_to_buffer`] or [`CommandEncoder::copy_buffer_to_texture`] operation.
- `const COPY_DST: Self` — Allow a buffer to be the destination buffer for a [`CommandEncoder::copy_buffer_to_buffer`], [`CommandEncoder::copy_texture_to_buffer`], [`CommandEncoder::clea…
- `const INDEX: Self` — Allow a buffer to be the index buffer in a draw operation.
- `const VERTEX: Self` — Allow a buffer to be the vertex buffer in a draw operation.
- `const UNIFORM: Self` — Allow a buffer to be a [`BufferBindingType::Uniform`] inside a bind group.
- `const STORAGE: Self` — Allow a buffer to be a [`BufferBindingType::Storage`] inside a bind group.
- `const INDIRECT: Self` — Allow a buffer to be the indirect buffer in an indirect draw call.
- `const QUERY_RESOLVE: Self` — Allow a buffer to be the destination buffer for a [`CommandEncoder::resolve_query_set`] operation.
- `const BLAS_INPUT: Self` — Allows a buffer to be used as input for a bottom level acceleration structure build
- `const TLAS_INPUT: Self` — Allows a buffer to be used as input for a top level acceleration structure build
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u32` — Get the underlying bits value.
- `const fn from_bits(bits: u32) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u32) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u32) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<BufferUsages>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<BufferUsages>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<BufferUsages>`, `Flags`, `FromIterator<BufferUsages>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### BufferUses — struct

Similar to `BufferUsages`, but used only for `CommandEncoder::transition_resources`.

Opaque (private fields).

Methods and constants:

- `const MAP_READ: Self` — The argument to a read-only mapping.
- `const MAP_WRITE: Self` — The argument to a write-only mapping.
- `const COPY_SRC: Self` — The source of a hardware copy. cbindgen:ignore
- `const COPY_DST: Self` — The destination of a hardware copy. cbindgen:ignore
- `const INDEX: Self` — The index buffer used for drawing.
- `const VERTEX: Self` — A vertex buffer used for drawing.
- `const UNIFORM: Self` — A uniform buffer bound in a bind group.
- `const STORAGE_READ_ONLY: Self` — A read-only storage buffer used in a bind group. cbindgen:ignore
- `const STORAGE_READ_WRITE: Self` — A read-write buffer used in a bind group. cbindgen:ignore
- `const INDIRECT: Self` — The indirect or count buffer in a indirect draw or dispatch.
- `const QUERY_RESOLVE: Self` — A buffer used to store query results.
- `const ACCELERATION_STRUCTURE_SCRATCH: Self` — Buffer used for acceleration structure building.
- `const BOTTOM_LEVEL_ACCELERATION_STRUCTURE_INPUT: Self` — Buffer used for bottom level acceleration structure building.
- `const TOP_LEVEL_ACCELERATION_STRUCTURE_INPUT: Self` — Buffer used for top level acceleration structure building.
- `const ACCELERATION_STRUCTURE_QUERY: Self` — A buffer used to store the compacted size of an acceleration structure
- `const RAY_TRACING_PIPELINE_SHADER_DATA: Self` — Buffer used for storing opaque shader data
- `const INCLUSIVE: Self` — The combination of states that a buffer may be in _at the same time_.
- `const EXCLUSIVE: Self` — The combination of states that a buffer must exclusively be in.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u16` — Get the underlying bits value.
- `const fn from_bits(bits: u16) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u16) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u16) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<BufferUses>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<BufferUses>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<BufferUses>`, `Flags`, `FromIterator<BufferUses>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### BufferView — struct

A read-only view of a mapped buffer's bytes.

Opaque (private fields).

Implements: `AsRef<[u8]>`, `Debug`, `Deref`, `Drop`

### BufferViewMut — struct

A write-only view of a mapped buffer's bytes.

Opaque (private fields).

Methods and constants:

- `fn len(&self) -> usize` — Returns the length of this view; the number of bytes to be written.
- `fn is_empty(&self) -> bool` — Returns `true` if the view has a length of 0.
- `fn slice<'a, S: RangeBounds<usize>>(self: &'a mut Self, bounds: S) -> WriteOnly<'a, [u8]>` — Returns a [`WriteOnly`] reference to a portion of this.
- `fn copy_from_slice(&mut self, src: &[u8])` — Copies all elements from src into `self`.

Implements: `Debug`, `Drop`

### CopyExternalImageDestInfo`<T>` — struct

View of a texture which can be used to copy to a texture, including color space and alpha premultiplication information.

Fields:

- `texture: T` — The texture to be copied to/from.
- `mip_level: u32` — The target mip level of the texture.
- `origin: Origin3d` — The base texel of the texture in the selected `mip_level`.
- `aspect: TextureAspect` — The copy aspect.
- `color_space: PredefinedColorSpace` — The color space of this texture.
- `premultiplied_alpha: bool` — The premultiplication of this texture

Methods and constants:

- `fn to_untagged(self) -> TexelCopyTextureInfo<T>` — Removes the colorspace information from the type.

Implements: `Clone`, `Copy`, `Debug`

### Extent3d — struct

Extent of a texture related operation.

Fields:

- `width: u32` — Width of the extent
- `height: u32` — Height of the extent
- `depth_or_array_layers: u32` — The depth of the extent or the number of array layers

Methods and constants:

- `fn physical_size(&self, format: TextureFormat) -> Self` — Calculates the [physical size] backing a texture of the given format and extent. This includes padding to the block width and height of the format. _[must_use]_
- `fn max_mips(&self, dim: TextureDimension) -> u32` — Calculates the maximum possible count of mipmaps. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ExternalTexture — struct

Handle to an external texture on the GPU.

Opaque (private fields).

Methods and constants:

- `fn destroy(&self)` — Destroy the associated native resources as soon as possible.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### ExternalTextureDescriptor — type alias

`type ExternalTextureDescriptor = ExternalTextureDescriptor<Label<'a>>`

Describes an [`ExternalTexture`](../wgpu/struct.ExternalTexture.html).

Fields:

- `label: L` — Debug label of the external texture. This will show up in graphics debuggers for easy identification.
- `width: u32` — Width of the external texture.
- `height: u32` — Height of the external texture.
- `format: ExternalTextureFormat` — Format of the external texture.
- `yuv_conversion_matrix: [f32; 16]` — 4x4 column-major matrix with which to convert sampled YCbCr values to RGBA. This is ignored when `format` is [`ExternalTextureFormat::Rgba`].
- `gamut_conversion_matrix: [f32; 9]` — 3x3 column-major matrix to transform linear RGB values in the source color space to linear RGB values in the destination color space. In combination with [`Self::src_transfer_func…
- `src_transfer_function: ExternalTextureTransferFunction` — Transfer function for the source color space. The _inverse_ of this will be applied to decode non-linear RGB to linear RGB in the source color space.
- `dst_transfer_function: ExternalTextureTransferFunction` — Transfer function for the destination color space. This will be applied to encode linear RGB to non-linear RGB in the destination color space.
- `sample_transform: [f32; 6]` — Transform to apply to [`ImageSample`] coordinates.
- `load_transform: [f32; 6]` — Transform to apply to [`ImageLoad`] coordinates.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> ExternalTextureDescriptor<K>` — Takes a closure and maps the label of the external texture descriptor into another. _[must_use]_
- `fn num_planes(&self) -> usize` — The number of underlying planes used by the external texture.

Implements: `Clone`, `Debug`, `PartialEq`, `StructuralPartialEq`

### ExternalTextureFormat — enum

Format of an `ExternalTexture`. This indicates the number of underlying planes used by the `ExternalTexture` as well as each plane's format.

Variants (3):

- `Rgba` — Single [`TextureFormat::Rgba8Unorm`] or [`TextureFormat::Bgra8Unorm`] format plane.
- `Nv12` — [`TextureFormat::R8Unorm`] Y plane, and [`TextureFormat::Rg8Unorm`] interleaved CbCr plane.
- `Yu12` — Separate [`TextureFormat::R8Unorm`] Y, Cb, and Cr planes.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ExternalTextureTransferFunction — struct

Parameters describing a gamma encoding transfer function in the form tf = { k * linear | linear < b { a * pow(linear, 1/g) - (a-1) | linear >= b

Fields:

- `a: f32`
- `b: f32`
- `g: f32`
- `k: f32`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `PartialEq`, `Pod`, `StructuralPartialEq`, `Zeroable`

### FilterMode — enum

Texel mixing mode when sampling between texels.

Variants (2):

- `Nearest = 0` — Nearest neighbor sampling.
- `Linear = 1` — Linear Interpolation

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ImageSubresourceRange — struct

Subresource range within an image

Fields:

- `aspect: TextureAspect` — Aspect of the texture. Color textures must be [`TextureAspect::All`][TAA].
- `base_mip_level: u32` — Base mip level.
- `mip_level_count: Option<u32>` — Mip level count. If `Some(count)`, `base_mip_level + count` must be less or equal to underlying texture mip count. If `None`, considered to include the rest of the mipmap levels,…
- `base_array_layer: u32` — Base array layer.
- `array_layer_count: Option<u32>` — Layer count. If `Some(count)`, `base_array_layer + count` must be less or equal to the underlying array count. If `None`, considered to include the rest of the array layers, but a…

Methods and constants:

- `fn is_full_resource(&self, format: TextureFormat, mip_levels: u32, array_layers: u32) -> bool` — Returns if the given range represents a full resource, with a texture of the given layer count and mip count. _[must_use]_
- `fn mip_range(&self, mip_level_count: u32) -> Range<u32>` — Returns the mip level range of a subresource range describes for a specific texture. _[must_use]_
- `fn layer_range(&self, array_layer_count: u32) -> Range<u32>` — Returns the layer range of a subresource range describes for a specific texture. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### MapMode — enum

Type of buffer mapping.

Variants (2):

- `Read` — Map only for reading
- `Write` — Map only for writing

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### MapRangeError — struct

Error returned by [`BufferSlice::get_mapped_range`] and [`BufferSlice::get_mapped_range_mut`].

Opaque (private fields).

Implements: `Clone`, `Debug`, `Display`, `Error`

### MipmapFilterMode — enum

Texel mixing mode when sampling between texels.

Variants (2):

- `Nearest = 0` — Nearest neighbor sampling.
- `Linear = 1` — Linear Interpolation

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Origin2d — struct

Origin of a copy from a 2D image.

Fields:

- `x: u32`
- `y: u32`

Methods and constants:

- `const ZERO: Self` — Zero origin.
- `fn to_3d(self, z: u32) -> Origin3d` — Adds the third dimension to this origin _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Origin3d — struct

Origin of a copy to/from a texture.

Fields:

- `x: u32` — X position of the origin
- `y: u32` — Y position of the origin
- `z: u32` — Z position of the origin

Methods and constants:

- `const ZERO: Self` — Zero origin.
- `fn to_2d(self) -> Origin2d` — Removes the third dimension from this origin _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### PredefinedColorSpace — enum

Color spaces supported on the web.

Variants (2):

- `Srgb` — sRGB color space
- `DisplayP3` — Display-P3 color space

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### QuerySet — struct

Handle to a query set.

Opaque (private fields).

Methods and constants:

- `fn destroy(&self)` — Destroys the [`QuerySet`], releasing its resources.
- `fn ty(&self) -> QueryType` — Returns the type of queries stored.
- `fn count(&self) -> u32` — Returns the number of query result slots.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### QuerySetDescriptor — type alias

`type QuerySetDescriptor = QuerySetDescriptor<Label<'a>>`

Describes how to create a `QuerySet`.

Fields:

- `label: L` — Debug label for the query set.
- `ty: QueryType` — Kind of query that this query set should contain.
- `count: u32` — Total number of query result slots the set contains. Must not be zero. Must not be greater than [`QUERY_SET_MAX_QUERIES`].

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> QuerySetDescriptor<K>` — Takes a closure and maps the label of the query set descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`

### Sampler — struct

Handle to a sampler.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### SamplerBorderColor — enum

Color variation to use when sampler addressing mode is [`AddressMode::ClampToBorder`]

Variants (4):

- `TransparentBlack` — [0, 0, 0, 0]
- `OpaqueBlack` — [0, 0, 0, 1]
- `OpaqueWhite` — [1, 1, 1, 1]
- `Zero` — On the Metal backend, this is equivalent to `TransparentBlack` for textures that have an alpha component, and equivalent to `OpaqueBlack` for textures that do not have an alpha component. On other ba…

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SamplerDescriptor — type alias

`type SamplerDescriptor = SamplerDescriptor<Label<'a>>`

Describes a `Sampler`.

Fields:

- `label: L` — Debug label of the sampler. This will show up in graphics debuggers for easy identification.
- `address_mode_u: AddressMode` — How to deal with out of bounds accesses in the u (i.e. x) direction
- `address_mode_v: AddressMode` — How to deal with out of bounds accesses in the v (i.e. y) direction
- `address_mode_w: AddressMode` — How to deal with out of bounds accesses in the w (i.e. z) direction
- `mag_filter: FilterMode` — How to filter the texture when it needs to be magnified (made larger)
- `min_filter: FilterMode` — How to filter the texture when it needs to be minified (made smaller)
- `mipmap_filter: MipmapFilterMode` — How to filter between mip map levels
- `lod_min_clamp: f32` — Minimum level of detail (i.e. mip level) to use
- `lod_max_clamp: f32` — Maximum level of detail (i.e. mip level) to use
- `compare: Option<CompareFunction>` — If this is enabled, this is a comparison sampler using the given comparison function.
- `anisotropy_clamp: u16` — Must be at least 1. If this is not 1, all filter modes must be linear.
- `border_color: Option<SamplerBorderColor>` — Border color to use when `address_mode` is [`AddressMode::ClampToBorder`]

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> SamplerDescriptor<K>` — Takes a closure and maps the label of the sampler descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### StorageTextureAccess — enum

Specific type of a sample in a texture binding.

Variants (4):

- `WriteOnly` — The texture can only be written in the shader and it: - may or may not be annotated with `write` (WGSL). - must be annotated with `writeonly` (GLSL).
- `ReadOnly` — The texture can only be read in the shader and it must be annotated with `read` (WGSL) or `readonly` (GLSL).
- `ReadWrite` — The texture can be both read and written in the shader and must be annotated with `read_write` in WGSL.
- `Atomic` — The texture can be both read and written in the shader via atomics and must be annotated with `read_write` in WGSL.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TexelCopyBufferInfoBase`<B>` — struct

View of a buffer which can be used to copy to/from a texture.

Fields:

- `buffer: B` — The buffer to be copied to/from.
- `layout: TexelCopyBufferLayout` — The layout of the texture data in this buffer.

Implements: `Clone`, `Copy`, `Debug`

### TexelCopyBufferLayout — struct

Layout of a texture in a buffer's memory.

Fields:

- `offset: BufferAddress` — Offset into the buffer that is the start of the texture. Must be a multiple of texture block size. For non-compressed textures, this is 1.
- `bytes_per_row: Option<u32>` — Bytes per "row" in an image.
- `rows_per_image: Option<u32>` — "Rows" that make up a single "image".

Implements: `Clone`, `Copy`, `Debug`, `Default`

### TexelCopyTextureInfoBase`<T>` — struct

View of a texture which can be used to copy to/from a buffer/texture.

Fields:

- `texture: T` — The texture to be copied to/from.
- `mip_level: u32` — The target mip level of the texture.
- `origin: Origin3d` — The base texel of the texture in the selected `mip_level`. Together with the `copy_size` argument to copy functions, defines the sub-region of the texture to copy.
- `aspect: TextureAspect` — The copy aspect.

Methods and constants:

- `fn to_tagged(self, color_space: PredefinedColorSpace, premultiplied_alpha: bool) -> CopyExternalImageDestInfo<T>` — Adds color space and premultiplied alpha information to make this descriptor tagged.

Implements: `Clone`, `Copy`, `Debug`

### Texture — struct

Handle to a texture on the GPU.

Opaque (private fields).

Methods and constants:

- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl Deref<Target = <A as >::Texture>>` — Get the [`wgpu_hal`] texture from this `Texture`.
- `fn create_view(&self, desc: &TextureViewDescriptor<'_>) -> TextureView` — Creates a view of this texture, specifying an interpretation of its texels and possibly a subset of its layers and mip levels.
- `fn destroy(&self)` — Destroy the associated native resources as soon as possible.
- `fn as_image_copy(&self) -> TexelCopyTextureInfo<'_>` — Make an `TexelCopyTextureInfo` representing the whole texture.
- `fn size(&self) -> Extent3d` — Returns the size of this `Texture`.
- `fn width(&self) -> u32` — Returns the width of this `Texture`.
- `fn height(&self) -> u32` — Returns the height of this `Texture`.
- `fn depth_or_array_layers(&self) -> u32` — Returns the depth or layer count of this `Texture`.
- `fn mip_level_count(&self) -> u32` — Returns the mip_level_count of this `Texture`.
- `fn sample_count(&self) -> u32` — Returns the sample_count of this `Texture`.
- `fn dimension(&self) -> TextureDimension` — Returns the dimension of this `Texture`.
- `fn format(&self) -> TextureFormat` — Returns the format of this `Texture`.
- `fn usage(&self) -> TextureUsages` — Returns the allowed usages of this `Texture`.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### TextureAspect — enum

Selects a subset of the data a [`Texture`] holds.

Variants (6):

- `All` — Depth, Stencil, and Color.
- `StencilOnly` — Stencil.
- `DepthOnly` — Depth.
- `Plane0` — Plane 0.
- `Plane1` — Plane 1.
- `Plane2` — Plane 2.

Methods and constants:

- `fn from_plane(plane: u32) -> Option<Self>` — Returns the texture aspect for a given plane. _[must_use]_
- `fn to_plane(&self) -> Option<u32>` — Returns the plane for a given texture aspect. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureDataOrder — enum

Order in which texture data is laid out in memory.

Variants (2):

- `LayerMajor` — The texture is laid out densely in memory as:
- `MipMajor` — The texture is laid out densely in memory as:

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureDescriptor — type alias

`type TextureDescriptor = TextureDescriptor<Label<'a>, &'a [TextureFormat]>`

Describes a [`Texture`](../wgpu/struct.Texture.html).

Fields:

- `label: L` — Debug label of the texture. This will show up in graphics debuggers for easy identification.
- `size: Extent3d` — Size of the texture. All components must be greater than zero. For a regular 1D/2D texture, the unused sizes will be 1. For 2DArray textures, Z is the number of 2D textures in tha…
- `mip_level_count: u32` — Mip count of texture. For a texture with no extra mips, this must be 1.
- `sample_count: u32` — Sample count of texture. If this is not 1, texture must have [`BindingType::Texture::multisampled`] set to true.
- `dimension: TextureDimension` — Dimensions of the texture.
- `format: TextureFormat` — Format of the texture.
- `usage: TextureUsages` — Allowed usages of the texture. If used in other ways, the operation will panic.
- `view_formats: V` — Specifies what view formats will be allowed when calling `Texture::create_view` on this texture.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> TextureDescriptor<K, V> where V: Clone` — Takes a closure and maps the label of the texture descriptor into another. _[must_use]_
- `fn map_label_and_view_formats<'a, K, M>(self: &'a Self, l_fun: impl FnOnce(&'a L) -> K, v_fun: impl FnOnce(&'a V) -> M) -> TextureDescriptor<K, M>` — Maps the label and view formats of the texture descriptor into another. _[must_use]_
- `fn mip_level_size(&self, level: u32) -> Option<Extent3d>` — Calculates the extent at a given mip level. _[must_use]_
- `fn array_layer_count(&self) -> u32` — Returns the number of array layers. _[must_use]_

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureDimension — enum

Dimensionality of a texture.

Variants (3):

- `D1` — 1D texture
- `D2` — 2D texture
- `D3` — 3D texture

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureSampleType — enum

Specific type of a sample in a texture binding.

Variants (4):

- `Float { filterable: bool }` — Sampling returns floats.
- `Depth` — Sampling does the depth reference comparison.
- `Sint` — Sampling returns signed integers.
- `Uint` — Sampling returns unsigned integers.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureTransition`<T>` — struct

A texture transition for use with `CommandEncoder::transition_resources`.

Fields:

- `texture: T` — The texture to transition.
- `selector: Option<TextureSelector>` — An optional selector to transition only part of the texture.
- `state: TextureUses` — The new state to transition to.

Implements: `Clone`, `Debug`

### TextureUsages — struct

Different ways that you can use a texture.

Opaque (private fields).

Methods and constants:

- `const COPY_SRC: Self` — Allows a texture to be the source in a [`CommandEncoder::copy_texture_to_buffer`] or [`CommandEncoder::copy_texture_to_texture`] operation.
- `const COPY_DST: Self` — Allows a texture to be the destination in a [`CommandEncoder::copy_buffer_to_texture`], [`CommandEncoder::copy_texture_to_texture`], or [`Queue::write_texture`…
- `const TEXTURE_BINDING: Self` — Allows a texture to be a [`BindingType::Texture`] in a bind group.
- `const STORAGE_BINDING: Self` — Allows a texture to be a [`BindingType::StorageTexture`] in a bind group.
- `const RENDER_ATTACHMENT: Self` — Allows a texture to be an output attachment of a render pass.
- `const TRANSIENT_ATTACHMENT: Self` — Specifies the contents of this texture will not be used in another pass to potentially reduce memory usage and bandwidth.
- `const STORAGE_ATOMIC: Self` — Allows a texture to be used with image atomics. Requires [`Features::TEXTURE_ATOMIC`].
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u32` — Get the underlying bits value.
- `const fn from_bits(bits: u32) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u32) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u32) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<TextureUsages>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<TextureUsages>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<TextureUsages>`, `Flags`, `FromIterator<TextureUsages>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### TextureUses — struct

Similar to `TextureUsages`, but used only for `CommandEncoder::transition_resources`.

Opaque (private fields).

Methods and constants:

- `const UNINITIALIZED: Self` — The texture is in unknown state.
- `const PRESENT: Self` — Ready to present image to the surface.
- `const COPY_SRC: Self` — The source of a hardware copy. cbindgen:ignore
- `const COPY_DST: Self` — The destination of a hardware copy. cbindgen:ignore
- `const RESOURCE: Self` — Read-only sampled or fetched resource.
- `const COLOR_TARGET: Self` — The color target of a renderpass.
- `const DEPTH_STENCIL_READ: Self` — Read-only depth stencil usage.
- `const DEPTH_STENCIL_WRITE: Self` — Read-write depth stencil usage
- `const STORAGE_READ_ONLY: Self` — Read-only storage texture usage. Corresponds to a UAV in d3d, so is exclusive, despite being read only. cbindgen:ignore
- `const STORAGE_WRITE_ONLY: Self` — Write-only storage texture usage. cbindgen:ignore
- `const STORAGE_READ_WRITE: Self` — Read-write storage texture usage. cbindgen:ignore
- `const STORAGE_ATOMIC: Self` — Image atomic enabled storage. cbindgen:ignore
- `const TRANSIENT: Self` — Transient texture that may not have any backing memory. Not a resource state stored in the trackers, only used for passing down usages to create_texture.
- `const INCLUSIVE: Self` — The combination of states that a texture may be in _at the same time_. cbindgen:ignore
- `const EXCLUSIVE: Self` — The combination of states that a texture must exclusively be in. cbindgen:ignore
- `const COMPLEX: Self` — Flag used by the wgpu-core texture tracker to say a texture is in different states for every sub-resource
- `const UNKNOWN: Self` — Flag used by the wgpu-core texture tracker to say that the tracker does not know the state of the sub-resource. This is different from UNINITIALIZED as that sa…
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u16` — Get the underlying bits value.
- `const fn from_bits(bits: u16) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u16) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u16) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<TextureUses>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<TextureUses>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<TextureUses>`, `Flags`, `FromIterator<TextureUses>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### TextureView — struct

Handle to a texture view.

Opaque (private fields).

Methods and constants:

- `fn texture(&self) -> &Texture` — Returns the [`Texture`] that this `TextureView` refers to.
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl Deref<Target = <A as >::TextureView>>` — Get the [`wgpu_hal`] texture view from this `TextureView`.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### TextureViewDescriptor — type alias

`type TextureViewDescriptor = TextureViewDescriptor<Label<'a>>`

Describes a [`TextureView`].

Fields:

- `label: L` — Debug label of the texture view. This will show up in graphics debuggers for easy identification.
- `format: Option<TextureFormat>` — Format of the texture view. Either must be the same as the texture format or in the list of `view_formats` in the texture's descriptor.
- `dimension: Option<TextureViewDimension>` — The dimension of the texture view. For 1D textures, this must be `D1`. For 2D textures it must be one of `D2`, `D2Array`, `Cube`, and `CubeArray`. For 3D textures it must be `D3`
- `usage: Option<TextureUsages>` — The allowed usage(s) for the texture view. Must be a subset of the usage flags of the texture. If not provided, defaults to the full set of usage flags of the texture.
- `aspect: TextureAspect` — Aspect of the texture. Color textures must be [`TextureAspect::All`].
- `base_mip_level: u32` — Base mip level.
- `mip_level_count: Option<u32>` — Mip level count. If `Some(count)`, `base_mip_level + count` must be less or equal to underlying texture mip count. If `None`, considered to include the rest of the mipmap levels,…
- `base_array_layer: u32` — Base array layer.
- `array_layer_count: Option<u32>` — Layer count. If `Some(count)`, `base_array_layer + count` must be less or equal to the underlying array count. If `None`, considered to include the rest of the array layers, but a…

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> TextureViewDescriptor<K>` — Takes a closure and maps the label of the texture view descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### TextureViewDimension — enum

Dimensions of a particular texture view.

Variants (6):

- `D1` — A one dimensional texture. `texture_1d` in WGSL and `texture1D` in GLSL.
- `D2` — A two dimensional texture. `texture_2d` in WGSL and `texture2D` in GLSL.
- `D2Array` — A two dimensional array texture. `texture_2d_array` in WGSL and `texture2DArray` in GLSL.
- `Cube` — A cubemap texture. `texture_cube` in WGSL and `textureCube` in GLSL.
- `CubeArray` — A cubemap array texture. `texture_cube_array` in WGSL and `textureCubeArray` in GLSL.
- `D3` — A three dimensional texture. `texture_3d` in WGSL and `texture3D` in GLSL.

Methods and constants:

- `fn compatible_texture_dimension(self) -> TextureDimension` — Get the texture dimension required of this texture view dimension. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### WriteOnly`<'a, T: ?Sized>` — struct

Like `&'a mut T`, but allows only write operations.

Opaque (private fields).

Methods and constants:

- `const unsafe fn new(ptr: NonNull<T>) -> Self` — Constructs a [`WriteOnly`] pointer from a raw pointer. _[must_use]_
- `const fn from_mut(reference: &mut T) -> Self` — Constructs a [`WriteOnly`] pointer from an ordinary read-write `&mut` reference. _[must_use]_
- `const fn write(self, value: T) where T: Copy` — Writes `value` into the memory pointed to by `self`.
- `const fn as_raw_ptr(&mut self) -> NonNull<T>` — Returns a raw pointer to the memory this [`WriteOnly`] refers to.
- `const fn len(&self) -> usize` — Returns the length of the referenced slice; the number of elements that may be written. _[must_use]_
- `const fn is_empty(&self) -> bool` — Returns `true` if the referenced slice has a length of 0. _[must_use]_
- `fn slice<'b, S: RangeBounds<usize>>(self: &'b mut Self, bounds: S) -> WriteOnly<'b, [T]>` — Returns another slice reference borrowing from this one, covering a sub-range and with a shorter lifetime. _[must_use]_
- `fn into_slice<S: RangeBounds<usize>>(self, bounds: S) -> Self` — Shrinks this slice reference in the same way as [`slice()`](Self::slice), but consumes `self` and returns a slice reference with the same lifetime, instead of a shorter lifetime. _[must_use]_
- `fn write_iter<I>(self, iter: I) where T: Copy, I: IntoIterator<Item = T>` — Writes the items of `iter` into `self`.
- `fn fill(&mut self, value: T) where T: Copy + 'static` — Writes copies of `value` to every element of `self`.
- `fn copy_from_slice(&mut self, src: &[T]) where T: Copy` — Copies all elements from src into `self`.
- `fn into_chunks<const N: usize>(self) -> (WriteOnly<'a, [[T; N]]>, WriteOnly<'a, [T]>)` — Splits this slice reference into `N`-element arrays, starting at the beginning of the slice, and a reference to the remainder with length strictly less than `N`. _[must_use]_
- `fn split_at(self, mid: usize) -> (WriteOnly<'a, [T]>, WriteOnly<'a, [T]>)` — Divides one write-only slice reference into two at an index. _[must_use]_
- `const fn split_at_checked(self, mid: usize) -> Result<(Self, Self), Self>` — Divides one write-only slice reference into two at an index, returning [`Err`] if the slice is too short.
- `fn split_off<R>(&mut self, range: R) -> Option<Self> where R: RangeBounds<usize>` — Removes the subslice corresponding to the given range and returns a mutable reference to it.
- `const fn split_off_first(&mut self) -> Option<WriteOnly<'a, T>>` — Shrinks `self` to no longer refer to its first element, and returns a reference to that element. _[must_use]_
- `const fn split_off_last(&mut self) -> Option<WriteOnly<'a, T>>` — Shrinks `self` to no longer refer to its last element, and returns a reference to that element. _[must_use]_
- `unsafe fn cast_elements<U>(self) -> WriteOnly<'a, [U]>` — Reinterprets a reference to `[T]` as a reference to `[U]`.
- `const fn as_raw_element_ptr(&mut self) -> NonNull<T>` — Returns a raw pointer to the first element of this [`WriteOnly`] slice reference.

Implements: `Debug`, `Default`, `From<&'b mut T>`, `From<WriteOnly<'b, [T; N]>>`, `IntoIterator`, `Send`, `Sync`

### WriteOnlyIter`<'a, T>` — struct

Iterator over the elements of [`WriteOnly<[T]>`][WriteOnly].

Opaque (private fields).

Implements: `Debug`, `DoubleEndedIterator`, `ExactSizeIterator`, `Iterator`
