# wgpu 30.0.1 API map — Features and limits

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 8 public items.

### DownlevelCapabilities — struct

Lists various ways the underlying platform does not conform to the WebGPU standard.

Fields:

- `flags: DownlevelFlags` — Combined boolean flags.
- `limits: DownlevelLimits` — Additional limits
- `shader_model: ShaderModel` — Which collections of features shaders support. Defined in terms of D3D's shader models.

Methods and constants:

- `fn is_webgpu_compliant(&self) -> bool` — Returns true if the underlying platform offers complete support of the baseline WebGPU standard. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### DownlevelFlags — struct

Binary flags listing features that may or may not be present on downlevel adapters.

Opaque (private fields).

Methods and constants:

- `const COMPUTE_SHADERS: Self` — The device supports compiling and using compute shaders.
- `const FRAGMENT_WRITABLE_STORAGE: Self` — Supports binding storage buffers and textures to fragment shaders.
- `const INDIRECT_EXECUTION: Self` — Supports indirect drawing and dispatching.
- `const BASE_VERTEX: Self` — Supports non-zero `base_vertex` parameter to direct indexed draw calls.
- `const READ_ONLY_DEPTH_STENCIL: Self` — Supports reading from a depth/stencil texture while using it as a read-only depth/stencil attachment.
- `const NON_POWER_OF_TWO_MIPMAPPED_TEXTURES: Self` — Supports textures with mipmaps which have a non power of two size.
- `const CUBE_ARRAY_TEXTURES: Self` — Supports textures that are cube arrays.
- `const COMPARISON_SAMPLERS: Self` — Supports comparison samplers.
- `const INDEPENDENT_BLEND: Self` — Supports different blend operations per color attachment.
- `const VERTEX_STORAGE: Self` — Supports storage buffers in vertex shaders.
- `const ANISOTROPIC_FILTERING: Self` — Supports samplers with anisotropic filtering. Note this isn't actually required by WebGPU, the implementation is allowed to completely ignore aniso clamp. This…
- `const FRAGMENT_STORAGE: Self` — Supports storage buffers in fragment shaders.
- `const MULTISAMPLED_SHADING: Self` — Supports sample-rate shading.
- `const DEPTH_TEXTURE_AND_BUFFER_COPIES: Self` — Supports copies between depth textures and buffers.
- `const WEBGPU_TEXTURE_FORMAT_SUPPORT: Self` — Supports all the texture usages described in WebGPU. If this isn't supported, you should call `get_texture_format_features` to get how you can use textures of…
- `const BUFFER_BINDINGS_NOT_16_BYTE_ALIGNED: Self` — Supports buffer bindings with sizes that aren't a multiple of 16.
- `const UNRESTRICTED_INDEX_BUFFER: Self` — Supports buffers to combine [`BufferUsages::INDEX`] with usages other than [`BufferUsages::COPY_DST`] and [`BufferUsages::COPY_SRC`]. Furthermore, in absence o…
- `const FULL_DRAW_INDEX_UINT32: Self` — Supports full 32-bit range indices (2^32-1 as opposed to 2^24-1 without this flag)
- `const DEPTH_BIAS_CLAMP: Self` — Supports depth bias clamping
- `const VIEW_FORMATS: Self` — Supports specifying which view format values are allowed when create_view() is called on a texture.
- `const UNRESTRICTED_EXTERNAL_TEXTURE_COPIES: Self` — With this feature not present, there are the following restrictions on `Queue::copy_external_image_to_texture`: - The source must not be [`web_sys::OffscreenCa…
- `const SURFACE_VIEW_FORMATS: Self` — Supports specifying which view formats are allowed when calling create_view on the texture returned by `Surface::get_current_texture`.
- `const NONBLOCKING_QUERY_RESOLVE: Self` — If this is true, calls to `CommandEncoder::resolve_query_set` will be performed on the queue timeline.
- `const SHADER_F16_IN_F32: Self` — Allows shaders to use `quantizeToF16`, `pack2x16float`, and `unpack2x16float`, which operate on `f16`-precision values stored in `f32`s.
- `const MSL2_1: Self` — Supports features introduced in MSL 2.1.
- `const TEXTURE_COMPRESSION: Self` — The adapter supports the WebGPU texture compression requirement: BC \|\| (ETC2 && ASTC).
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
- `const fn iter(&self) -> $crate::iter::Iter<DownlevelFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<DownlevelFlags>` — Yield a set of contained named flags values.
- `const fn compliant() -> Self` — All flags that indicate if the backend is WebGPU compliant _[must_use]_

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<DownlevelFlags>`, `Flags`, `FromIterator<DownlevelFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### DownlevelLimits — struct

Represents the sets of additional limits on an adapter, which take place when running on downlevel backends.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Features — struct

Features that are not guaranteed to be supported.

Fields:

- `features_wgpu: FeaturesWGPU`
- `features_webgpu: FeaturesWebGPU`

Methods and constants:

- `const fn bits(&self) -> FeatureBits` — Gets the set flags as a container holding an array of bits.
- `const fn empty() -> Self` — Returns self with no flags set.
- `const fn all() -> Self` — Returns self with all flags set.
- `const fn contains(self, other: Self) -> bool` — Whether all the bits set in `other` are all set in `self`
- `const fn intersects(self, other: Self) -> bool` — Returns whether any bit set in `self` matched any bit set in `other`.
- `const fn is_empty(self) -> bool` — Returns whether there is no flag set.
- `const fn is_all(self) -> bool` — Returns whether the struct has all flags set.
- `const fn union(self, other: Self) -> Self` — Bitwise or - `self \| other`
- `const fn intersection(self, other: Self) -> Self` — Bitwise and - `self & other`
- `const fn difference(self, other: Self) -> Self` — Bitwise and of the complement of other - `self & !other`
- `const fn symmetric_difference(self, other: Self) -> Self` — Bitwise xor - `self ^ other`
- `const fn complement(self) -> Self` — Bitwise not - `!self`
- `fn set(&mut self, other: Self, set: bool)` — Calls [`Self::insert`] if `set` is true and otherwise calls [`Self::remove`].
- `fn insert(&mut self, other: Self)` — Inserts specified flag(s) into self
- `fn remove(&mut self, other: Self)` — Removes specified flag(s) from self
- `fn toggle(&mut self, other: Self)` — Toggles specified flag(s) in self
- `const fn from_bits(bits: FeatureBits) -> Option<Self>` — Takes in [`FeatureBits`] and returns None if there are invalid bits or otherwise Self with those bits set
- `const fn from_bits_truncate(bits: FeatureBits) -> Self` — Takes in [`FeatureBits`] and returns Self with only valid bits (all other bits removed)
- `const fn from_bits_retain(bits: FeatureBits) -> Self` — Takes in [`FeatureBits`] and returns Self with all bits that were set without removing invalid bits
- `fn from_name(name: &str) -> Option<Self>` — Takes in a bitflags flag name (in `SCREAMING_SNAKE_CASE`) and returns Self if it matches or none if the name does not match the name of any of the flags. Name is capitalisation dependent.
- `fn from_internal_flags(features_wgpu: FeaturesWGPU, features_webgpu: FeaturesWebGPU) -> Self` — Combines the features from the internal flags into the entire features struct
- `const fn iter(&self) -> bitflags::iter::Iter<Features>` — Returns an iterator over the set flags.
- `const fn iter_names(&self) -> bitflags::iter::IterNames<Features>` — Returns an iterator over the set flags and their names.
- `fn as_str(&self) -> Option<&'static str>` — If the argument is a single [`Features`] flag, returns the corresponding `kebab-case` feature name, otherwise `None`. _[must_use]_
- `const SHADER_FLOAT32_ATOMIC: Self` — Allows shaders to use f32 atomic load, store, add, sub, and exchange.
- `const TEXTURE_FORMAT_16BIT_NORM: Self` — Enables normalized `16-bit` texture formats.
- `const TEXTURE_COMPRESSION_ASTC_HDR: Self` — Enables ASTC HDR family of compressed textures.
- `const TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES: Self` — Enables device specific texture format features.
- `const PIPELINE_STATISTICS_QUERY: Self` — Enables use of Pipeline Statistics Queries. These queries tell the count of various operations performed between the start and stop call. Call [`RenderPass::be…
- `const TIMESTAMP_QUERY_INSIDE_ENCODERS: Self` — Allows for timestamp queries directly on command encoders.
- `const TIMESTAMP_QUERY_INSIDE_PASSES: Self` — Allows for timestamp queries directly inside render and compute passes.
- `const MAPPABLE_PRIMARY_BUFFERS: Self` — Webgpu only allows the MAP_READ and MAP_WRITE buffer usage to be matched with COPY_DST and COPY_SRC respectively. This removes this requirement.
- `const TEXTURE_BINDING_ARRAY: Self` — Allows the user to create uniform arrays of textures in shaders:
- `const BUFFER_BINDING_ARRAY: Self` — Allows the user to create arrays of buffers in shaders:
- `const STORAGE_RESOURCE_BINDING_ARRAY: Self` — Allows the user to create uniform arrays of storage buffers or textures in shaders, if resp. [`Features::BUFFER_BINDING_ARRAY`] or [`Features::TEXTURE_BINDING_…
- `const SAMPLED_TEXTURE_AND_STORAGE_BUFFER_ARRAY_NON_UNIFORM_INDEXING: Self` — Allows shaders to index sampled texture and storage buffer resource arrays with dynamically non-uniform values:
- `const STORAGE_TEXTURE_ARRAY_NON_UNIFORM_INDEXING: Self` — Allows shaders to index storage texture resource arrays with dynamically non-uniform values:
- `const PARTIALLY_BOUND_BINDING_ARRAY: Self` — Allows the user to create bind groups containing arrays with less bindings than the BindGroupLayout.
- `const MULTI_DRAW_INDIRECT_COUNT: Self` — Allows the user to call [`RenderPass::multi_draw_indirect_count`] and [`RenderPass::multi_draw_indexed_indirect_count`].
- `const ADDRESS_MODE_CLAMP_TO_ZERO: Self` — Allows the use of [`AddressMode::ClampToBorder`] with a border color of [`SamplerBorderColor::Zero`].
- `const ADDRESS_MODE_CLAMP_TO_BORDER: Self` — Allows the use of [`AddressMode::ClampToBorder`] with a border color other than [`SamplerBorderColor::Zero`].
- `const POLYGON_MODE_LINE: Self` — Allows the user to set [`PolygonMode::Line`] in [`PrimitiveState::polygon_mode`]
- `const POLYGON_MODE_POINT: Self` — Allows the user to set [`PolygonMode::Point`] in [`PrimitiveState::polygon_mode`]
- `const CONSERVATIVE_RASTERIZATION: Self` — Allows the user to set a overestimation-conservative-rasterization in [`PrimitiveState::conservative`]
- `const VERTEX_WRITABLE_STORAGE: Self` — Enables bindings of writable storage buffers and textures visible to vertex shaders.
- `const CLEAR_TEXTURE: Self` — Enables clear to zero for textures.
- `const MULTIVIEW: Self` — Enables multiview render passes and `builtin(view_index)` in vertex/mesh shaders.
- `const VERTEX_ATTRIBUTE_64BIT: Self` — Enables using 64-bit types for vertex attributes.
- `const TEXTURE_ATOMIC: Self` — Enables image atomic fetch add, and, xor, or, min, and max for R32Uint and R32Sint textures.
- `const TEXTURE_FORMAT_NV12: Self` — Allows for creation of textures of format [`TextureFormat::NV12`]
- `const TEXTURE_FORMAT_P010: Self` — Allows for creation of textures of format [`TextureFormat::P010`]
- `const EXTERNAL_TEXTURE: Self` — Allows for the creation and usage of `ExternalTexture`s, and bind group layouts containing external texture `BindingType`s.
- `const EXPERIMENTAL_RAY_QUERY: Self` — _**THIS IS EXPERIMENTAL:**_ Features enabled by this may have major bugs in it and are expected to be subject to breaking changes, suggestions for the API expo…
- `const SHADER_F64: Self` — Enables 64-bit floating point types in SPIR-V shaders.
- `const SHADER_I16: Self` — Allows shaders to use `i16` and `u16` 16-bit integer types.
- `const SHADER_EARLY_DEPTH_TEST: Self` — Allows shaders to use the `early_depth_test` attribute.
- `const SHADER_INT64: Self` — Allows shaders to use i64 and u64.
- `const SUBGROUP: Self` — Allows compute and fragment shaders to use the subgroup operation built-ins and perform subgroup operations (except barriers).
- `const SUBGROUP_VERTEX: Self` — Allows vertex shaders to use the subgroup operation built-ins and perform subgroup operations (except barriers).
- `const SUBGROUP_BARRIER: Self` — Allows compute shaders to use the subgroup barrier.
- `const PIPELINE_CACHE: Self` — Allows the use of pipeline cache objects
- `const SHADER_INT64_ATOMIC_MIN_MAX: Self` — Allows shaders to use i64 and u64 atomic min and max.
- `const SHADER_INT64_ATOMIC_ALL_OPS: Self` — Allows shaders to use all i64 and u64 atomic operations.
- `const VULKAN_GOOGLE_DISPLAY_TIMING: Self` — Allows using the [VK_GOOGLE_display_timing] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_WIN32: Self` — Allows using the [VK_KHR_external_memory_win32] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_FD: Self` — Allows using the [VK_KHR_external_memory_fd] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_DMA_BUF: Self` — Allows using the [VK_EXT_external_memory_dma_buf] Vulkan extension for importing DMA-buf textures on Linux.
- `const TEXTURE_INT64_ATOMIC: Self` — Enables R64Uint image atomic min and max.
- `const UNIFORM_BUFFER_BINDING_ARRAYS: Self` — Allows uniform buffers to be bound as binding arrays.
- `const EXPERIMENTAL_MESH_SHADER: Self` — Enables mesh shaders and task shaders in mesh shader pipelines. This extension does NOT imply support for compiling mesh shaders at runtime.
- `const EXPERIMENTAL_RAY_HIT_VERTEX_RETURN: Self` — _**THIS IS EXPERIMENTAL:**_ Features enabled by this may have major bugs in them and are expected to be subject to breaking changes, suggestions for the API ex…
- `const EXPERIMENTAL_MESH_SHADER_MULTIVIEW: Self` — Enables multiview in mesh shader pipelines
- `const EXTENDED_ACCELERATION_STRUCTURE_VERTEX_FORMATS: Self` — Allows usage of additional vertex formats in [BlasTriangleGeometrySizeDescriptor::vertex_format]
- `const PASSTHROUGH_SHADERS: Self` — Enables creating shaders from passthrough with reflection info (unsafe)
- `const SHADER_BARYCENTRICS: Self` — Enables shader barycentric coordinates.
- `const SELECTIVE_MULTIVIEW: Self` — Enables using multiview where not all texture array layers are rendered to in a single render pass/render pipeline. Making use of this feature also requires en…
- `const EXPERIMENTAL_MESH_SHADER_POINTS: Self` — Enables the use of point-primitive outputs from mesh shaders. Making use of this feature also requires enabling `Features::EXPERIMENTAL_MESH_SHADER`.
- `const MULTISAMPLE_ARRAY: Self` — Enables creating texture arrays that are also multisampled.
- `const EXPERIMENTAL_COOPERATIVE_MATRIX: Self` — Enables cooperative matrix operations (also known as tensor cores on NVIDIA GPUs or simdgroup matrix operations on Apple GPUs).
- `const SHADER_PER_VERTEX: Self` — Enables shader per-vertex attributes.
- `const SHADER_DRAW_INDEX: Self` — Enables shader `draw_index` builtin.
- `const ACCELERATION_STRUCTURE_BINDING_ARRAY: Self` — Allows the user to create arrays of acceleration structures in shaders:
- `const MEMORY_DECORATION_COHERENT: Self` — Enables the `@coherent` memory decoration on storage buffer variables.
- `const MEMORY_DECORATION_VOLATILE: Self` — Enables the `@volatile` memory decoration on storage buffer variables.
- `const EXPERIMENTAL_RAY_TRACING_PIPELINES: Self` — Allows for constructing ray tracing pipelines.
- `const DEPTH_CLIP_CONTROL: Self` — By default, polygon depth is clipped to 0-1 range before/during rasterization. Anything outside of that range is rejected, and respective fragments are not tou…
- `const DEPTH32FLOAT_STENCIL8: Self` — Allows for explicit creation of textures of format [`TextureFormat::Depth32FloatStencil8`]
- `const TEXTURE_COMPRESSION_BC: Self` — Enables BCn family of compressed textures. All BCn textures use 4x4 pixel blocks with 8 or 16 bytes per block.
- `const TEXTURE_COMPRESSION_BC_SLICED_3D: Self` — Allows the 3d dimension for textures with BC compressed formats.
- `const TEXTURE_COMPRESSION_ETC2: Self` — Enables ETC family of compressed textures. All ETC textures use 4x4 pixel blocks. ETC2 RGB and RGBA1 are 8 bytes per block. RTC2 RGBA8 and EAC are 16 bytes per…
- `const TEXTURE_COMPRESSION_ASTC: Self` — Enables ASTC family of compressed textures. ASTC textures use pixel blocks varying from 4x4 to 12x12. Blocks are always 16 bytes.
- `const TEXTURE_COMPRESSION_ASTC_SLICED_3D: Self` — Allows the 3d dimension for textures with ASTC compressed formats.
- `const TIMESTAMP_QUERY: Self` — Enables use of Timestamp Queries. These queries tell the current gpu timestamp when all work before the query is finished.
- `const INDIRECT_FIRST_INSTANCE: Self` — Allows non-zero value for the `first_instance` member in indirect draw calls.
- `const SHADER_F16: Self` — Allows shaders to use 16-bit floating point types. You may use them uniform buffers, storage buffers, and local variables. You may not use them in immediates.
- `const RG11B10UFLOAT_RENDERABLE: Self` — Allows for usage of textures of format [`TextureFormat::Rg11b10Ufloat`] as a render target
- `const BGRA8UNORM_STORAGE: Self` — Allows the [`TextureUsages::STORAGE_BINDING`] usage on textures with format [`TextureFormat::Bgra8Unorm`]
- `const FLOAT32_FILTERABLE: Self` — Allows textures with formats "r32float", "rg32float", and "rgba32float" to be filterable.
- `const FLOAT32_BLENDABLE: Self` — Allows textures with formats "r32float", "rg32float", and "rgba32float" to be blendable.
- `const DUAL_SOURCE_BLENDING: Self` — Allows two outputs from a shader to be used for blending. Note that dual-source blending doesn't support multiple render targets.
- `const CLIP_DISTANCES: Self` — Allows the use of `@builtin(clip_distances)` in WGSL.
- `const IMMEDIATES: Self` — Allows the use of immediate data: small, fast bits of memory that can be updated inside a [`RenderPass`].
- `const PRIMITIVE_INDEX: Self` — Enables `builtin(primitive_index)` in fragment shaders.
- `const fn all_webgpu_mask() -> Self` — Mask of all features which are part of the upstream WebGPU standard. _[must_use]_
- `const fn all_native_mask() -> Self` — Mask of all features that are only available when targeting native (not web). _[must_use]_
- `const fn all_experimental_mask() -> Self` — Mask of all features which are experimental. _[must_use]_
- `fn allowed_vertex_formats_for_blas(&self) -> Vec<VertexFormat>` — Vertex formats allowed for creating and building BLASes _[must_use]_

Implements: `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Display`, `Eq`, `Flags`, `From<FeatureBits>`, `From<Features>`, `From<FeaturesWGPU>`, `From<FeaturesWebGPU>`, `FromStr`, `Hash`, `Not`, `PartialEq`, `StructuralPartialEq`, `Sub`

### FeaturesWebGPU — struct

Features that are not guaranteed to be supported.

Opaque (private fields).

Methods and constants:

- `const DEPTH_CLIP_CONTROL: Self` — By default, polygon depth is clipped to 0-1 range before/during rasterization. Anything outside of that range is rejected, and respective fragments are not tou…
- `const DEPTH32FLOAT_STENCIL8: Self` — Allows for explicit creation of textures of format [`TextureFormat::Depth32FloatStencil8`]
- `const TEXTURE_COMPRESSION_BC: Self` — Enables BCn family of compressed textures. All BCn textures use 4x4 pixel blocks with 8 or 16 bytes per block.
- `const TEXTURE_COMPRESSION_BC_SLICED_3D: Self` — Allows the 3d dimension for textures with BC compressed formats.
- `const TEXTURE_COMPRESSION_ETC2: Self` — Enables ETC family of compressed textures. All ETC textures use 4x4 pixel blocks. ETC2 RGB and RGBA1 are 8 bytes per block. RTC2 RGBA8 and EAC are 16 bytes per…
- `const TEXTURE_COMPRESSION_ASTC: Self` — Enables ASTC family of compressed textures. ASTC textures use pixel blocks varying from 4x4 to 12x12. Blocks are always 16 bytes.
- `const TEXTURE_COMPRESSION_ASTC_SLICED_3D: Self` — Allows the 3d dimension for textures with ASTC compressed formats.
- `const TIMESTAMP_QUERY: Self` — Enables use of Timestamp Queries. These queries tell the current gpu timestamp when all work before the query is finished.
- `const INDIRECT_FIRST_INSTANCE: Self` — Allows non-zero value for the `first_instance` member in indirect draw calls.
- `const SHADER_F16: Self` — Allows shaders to use 16-bit floating point types. You may use them uniform buffers, storage buffers, and local variables. You may not use them in immediates.
- `const RG11B10UFLOAT_RENDERABLE: Self` — Allows for usage of textures of format [`TextureFormat::Rg11b10Ufloat`] as a render target
- `const BGRA8UNORM_STORAGE: Self` — Allows the [`TextureUsages::STORAGE_BINDING`] usage on textures with format [`TextureFormat::Bgra8Unorm`]
- `const FLOAT32_FILTERABLE: Self` — Allows textures with formats "r32float", "rg32float", and "rgba32float" to be filterable.
- `const FLOAT32_BLENDABLE: Self` — Allows textures with formats "r32float", "rg32float", and "rgba32float" to be blendable.
- `const DUAL_SOURCE_BLENDING: Self` — Allows two outputs from a shader to be used for blending. Note that dual-source blending doesn't support multiple render targets.
- `const CLIP_DISTANCES: Self` — Allows the use of `@builtin(clip_distances)` in WGSL.
- `const IMMEDIATES: Self` — Allows the use of immediate data: small, fast bits of memory that can be updated inside a [`RenderPass`].
- `const PRIMITIVE_INDEX: Self` — Enables `builtin(primitive_index)` in fragment shaders.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u64` — Get the underlying bits value.
- `const fn from_bits(bits: u64) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u64) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u64) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<FeaturesWebGPU>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<FeaturesWebGPU>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<FeaturesWebGPU>`, `Flags`, `From<FeaturesWebGPU>`, `FromIterator<FeaturesWebGPU>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### FeaturesWGPU — struct

Features that are not guaranteed to be supported.

Opaque (private fields).

Methods and constants:

- `const SHADER_FLOAT32_ATOMIC: Self` — Allows shaders to use f32 atomic load, store, add, sub, and exchange.
- `const TEXTURE_FORMAT_16BIT_NORM: Self` — Enables normalized `16-bit` texture formats.
- `const TEXTURE_COMPRESSION_ASTC_HDR: Self` — Enables ASTC HDR family of compressed textures.
- `const TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES: Self` — Enables device specific texture format features.
- `const PIPELINE_STATISTICS_QUERY: Self` — Enables use of Pipeline Statistics Queries. These queries tell the count of various operations performed between the start and stop call. Call [`RenderPass::be…
- `const TIMESTAMP_QUERY_INSIDE_ENCODERS: Self` — Allows for timestamp queries directly on command encoders.
- `const TIMESTAMP_QUERY_INSIDE_PASSES: Self` — Allows for timestamp queries directly inside render and compute passes.
- `const MAPPABLE_PRIMARY_BUFFERS: Self` — Webgpu only allows the MAP_READ and MAP_WRITE buffer usage to be matched with COPY_DST and COPY_SRC respectively. This removes this requirement.
- `const TEXTURE_BINDING_ARRAY: Self` — Allows the user to create uniform arrays of textures in shaders:
- `const BUFFER_BINDING_ARRAY: Self` — Allows the user to create arrays of buffers in shaders:
- `const STORAGE_RESOURCE_BINDING_ARRAY: Self` — Allows the user to create uniform arrays of storage buffers or textures in shaders, if resp. [`Features::BUFFER_BINDING_ARRAY`] or [`Features::TEXTURE_BINDING_…
- `const SAMPLED_TEXTURE_AND_STORAGE_BUFFER_ARRAY_NON_UNIFORM_INDEXING: Self` — Allows shaders to index sampled texture and storage buffer resource arrays with dynamically non-uniform values:
- `const STORAGE_TEXTURE_ARRAY_NON_UNIFORM_INDEXING: Self` — Allows shaders to index storage texture resource arrays with dynamically non-uniform values:
- `const PARTIALLY_BOUND_BINDING_ARRAY: Self` — Allows the user to create bind groups containing arrays with less bindings than the BindGroupLayout.
- `const MULTI_DRAW_INDIRECT_COUNT: Self` — Allows the user to call [`RenderPass::multi_draw_indirect_count`] and [`RenderPass::multi_draw_indexed_indirect_count`].
- `const ADDRESS_MODE_CLAMP_TO_ZERO: Self` — Allows the use of [`AddressMode::ClampToBorder`] with a border color of [`SamplerBorderColor::Zero`].
- `const ADDRESS_MODE_CLAMP_TO_BORDER: Self` — Allows the use of [`AddressMode::ClampToBorder`] with a border color other than [`SamplerBorderColor::Zero`].
- `const POLYGON_MODE_LINE: Self` — Allows the user to set [`PolygonMode::Line`] in [`PrimitiveState::polygon_mode`]
- `const POLYGON_MODE_POINT: Self` — Allows the user to set [`PolygonMode::Point`] in [`PrimitiveState::polygon_mode`]
- `const CONSERVATIVE_RASTERIZATION: Self` — Allows the user to set a overestimation-conservative-rasterization in [`PrimitiveState::conservative`]
- `const VERTEX_WRITABLE_STORAGE: Self` — Enables bindings of writable storage buffers and textures visible to vertex shaders.
- `const CLEAR_TEXTURE: Self` — Enables clear to zero for textures.
- `const MULTIVIEW: Self` — Enables multiview render passes and `builtin(view_index)` in vertex/mesh shaders.
- `const VERTEX_ATTRIBUTE_64BIT: Self` — Enables using 64-bit types for vertex attributes.
- `const TEXTURE_ATOMIC: Self` — Enables image atomic fetch add, and, xor, or, min, and max for R32Uint and R32Sint textures.
- `const TEXTURE_FORMAT_NV12: Self` — Allows for creation of textures of format [`TextureFormat::NV12`]
- `const TEXTURE_FORMAT_P010: Self` — Allows for creation of textures of format [`TextureFormat::P010`]
- `const EXTERNAL_TEXTURE: Self` — Allows for the creation and usage of `ExternalTexture`s, and bind group layouts containing external texture `BindingType`s.
- `const EXPERIMENTAL_RAY_QUERY: Self` — _**THIS IS EXPERIMENTAL:**_ Features enabled by this may have major bugs in it and are expected to be subject to breaking changes, suggestions for the API expo…
- `const SHADER_F64: Self` — Enables 64-bit floating point types in SPIR-V shaders.
- `const SHADER_I16: Self` — Allows shaders to use `i16` and `u16` 16-bit integer types.
- `const SHADER_EARLY_DEPTH_TEST: Self` — Allows shaders to use the `early_depth_test` attribute.
- `const SHADER_INT64: Self` — Allows shaders to use i64 and u64.
- `const SUBGROUP: Self` — Allows compute and fragment shaders to use the subgroup operation built-ins and perform subgroup operations (except barriers).
- `const SUBGROUP_VERTEX: Self` — Allows vertex shaders to use the subgroup operation built-ins and perform subgroup operations (except barriers).
- `const SUBGROUP_BARRIER: Self` — Allows compute shaders to use the subgroup barrier.
- `const PIPELINE_CACHE: Self` — Allows the use of pipeline cache objects
- `const SHADER_INT64_ATOMIC_MIN_MAX: Self` — Allows shaders to use i64 and u64 atomic min and max.
- `const SHADER_INT64_ATOMIC_ALL_OPS: Self` — Allows shaders to use all i64 and u64 atomic operations.
- `const VULKAN_GOOGLE_DISPLAY_TIMING: Self` — Allows using the [VK_GOOGLE_display_timing] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_WIN32: Self` — Allows using the [VK_KHR_external_memory_win32] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_FD: Self` — Allows using the [VK_KHR_external_memory_fd] Vulkan extension.
- `const VULKAN_EXTERNAL_MEMORY_DMA_BUF: Self` — Allows using the [VK_EXT_external_memory_dma_buf] Vulkan extension for importing DMA-buf textures on Linux.
- `const TEXTURE_INT64_ATOMIC: Self` — Enables R64Uint image atomic min and max.
- `const UNIFORM_BUFFER_BINDING_ARRAYS: Self` — Allows uniform buffers to be bound as binding arrays.
- `const EXPERIMENTAL_MESH_SHADER: Self` — Enables mesh shaders and task shaders in mesh shader pipelines. This extension does NOT imply support for compiling mesh shaders at runtime.
- `const EXPERIMENTAL_RAY_HIT_VERTEX_RETURN: Self` — _**THIS IS EXPERIMENTAL:**_ Features enabled by this may have major bugs in them and are expected to be subject to breaking changes, suggestions for the API ex…
- `const EXPERIMENTAL_MESH_SHADER_MULTIVIEW: Self` — Enables multiview in mesh shader pipelines
- `const EXTENDED_ACCELERATION_STRUCTURE_VERTEX_FORMATS: Self` — Allows usage of additional vertex formats in [BlasTriangleGeometrySizeDescriptor::vertex_format]
- `const PASSTHROUGH_SHADERS: Self` — Enables creating shaders from passthrough with reflection info (unsafe)
- `const SHADER_BARYCENTRICS: Self` — Enables shader barycentric coordinates.
- `const SELECTIVE_MULTIVIEW: Self` — Enables using multiview where not all texture array layers are rendered to in a single render pass/render pipeline. Making use of this feature also requires en…
- `const EXPERIMENTAL_MESH_SHADER_POINTS: Self` — Enables the use of point-primitive outputs from mesh shaders. Making use of this feature also requires enabling `Features::EXPERIMENTAL_MESH_SHADER`.
- `const MULTISAMPLE_ARRAY: Self` — Enables creating texture arrays that are also multisampled.
- `const EXPERIMENTAL_COOPERATIVE_MATRIX: Self` — Enables cooperative matrix operations (also known as tensor cores on NVIDIA GPUs or simdgroup matrix operations on Apple GPUs).
- `const SHADER_PER_VERTEX: Self` — Enables shader per-vertex attributes.
- `const SHADER_DRAW_INDEX: Self` — Enables shader `draw_index` builtin.
- `const ACCELERATION_STRUCTURE_BINDING_ARRAY: Self` — Allows the user to create arrays of acceleration structures in shaders:
- `const MEMORY_DECORATION_COHERENT: Self` — Enables the `@coherent` memory decoration on storage buffer variables.
- `const MEMORY_DECORATION_VOLATILE: Self` — Enables the `@volatile` memory decoration on storage buffer variables.
- `const EXPERIMENTAL_RAY_TRACING_PIPELINES: Self` — Allows for constructing ray tracing pipelines.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u64` — Get the underlying bits value.
- `const fn from_bits(bits: u64) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u64) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u64) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<FeaturesWGPU>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<FeaturesWGPU>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<FeaturesWGPU>`, `Flags`, `From<FeaturesWGPU>`, `FromIterator<FeaturesWGPU>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### Limits — struct

Represents the sets of limits an adapter/device supports.

Fields:

- `max_texture_dimension_1d: u32` — Maximum allowed value for the `size.width` of a texture created with `TextureDimension::D1`. Defaults to 8192. Higher is "better".
- `max_texture_dimension_2d: u32` — Maximum allowed value for the `size.width` and `size.height` of a texture created with `TextureDimension::D2`. Defaults to 8192. Higher is "better".
- `max_texture_dimension_3d: u32` — Maximum allowed value for the `size.width`, `size.height`, and `size.depth_or_array_layers` of a texture created with `TextureDimension::D3`. Defaults to 2048. Higher is "better".
- `max_texture_array_layers: u32` — Maximum allowed value for the `size.depth_or_array_layers` of a texture created with `TextureDimension::D2`. Defaults to 256. Higher is "better".
- `max_bind_groups: u32` — Amount of bind groups that can be attached to a pipeline at the same time. Defaults to 4. Higher is "better".
- `max_bind_groups_plus_vertex_buffers: u32` — The maximum number of bind group and vertex buffer slots used simultaneously, counting any empty slots below the highest index. Defaults to 24. Higher is "better".
- `max_bindings_per_bind_group: u32` — Maximum binding index allowed in `create_bind_group_layout`. Defaults to 1000. Higher is "better".
- `max_dynamic_uniform_buffers_per_pipeline_layout: u32` — Amount of uniform buffer bindings that can be dynamic in a single pipeline. Defaults to 8. Higher is "better".
- `max_dynamic_storage_buffers_per_pipeline_layout: u32` — Amount of storage buffer bindings that can be dynamic in a single pipeline. Defaults to 4. Higher is "better".
- `max_sampled_textures_per_shader_stage: u32` — Amount of sampled textures visible in a single shader stage. Defaults to 16. Higher is "better".
- `max_samplers_per_shader_stage: u32` — Amount of samplers visible in a single shader stage. Defaults to 16. Higher is "better".
- `max_storage_buffers_per_shader_stage: u32` — Amount of storage buffers visible in a single shader stage. Defaults to 8. Higher is "better".
- `max_storage_textures_per_shader_stage: u32` — Amount of storage textures visible in a single shader stage. Defaults to 4. Higher is "better".
- `max_uniform_buffers_per_shader_stage: u32` — Amount of uniform buffers visible in a single shader stage. Defaults to 12. Higher is "better".
- `max_binding_array_elements_per_shader_stage: u32` — Amount of individual resources within binding arrays that can be accessed in a single shader stage. Applies to all types of bindings except samplers.
- `max_binding_array_acceleration_structure_elements_per_shader_stage: u32` — Amount of individual acceleration structures within binding arrays that can be accessed in a single shader stage.
- `max_binding_array_sampler_elements_per_shader_stage: u32` — Amount of individual samplers within binding arrays that can be accessed in a single shader stage.
- `max_uniform_buffer_binding_size: u64` — Maximum size in bytes of a binding to a uniform buffer. Defaults to 64 KiB. Higher is "better".
- `max_storage_buffer_binding_size: u64` — Maximum size in bytes of a binding to a storage buffer. Defaults to 128 MiB. Higher is "better".
- `max_vertex_buffers: u32` — Maximum length of `VertexState::buffers` when creating a `RenderPipeline`. Defaults to 8. Higher is "better".
- `max_buffer_size: u64` — A limit above which buffer allocations are guaranteed to fail. Defaults to 256 MiB. Higher is "better".
- `max_vertex_attributes: u32` — Maximum length of `VertexBufferLayout::attributes`, summed over all `VertexState::buffers`, when creating a `RenderPipeline`. Defaults to 16. Higher is "better".
- `max_vertex_buffer_array_stride: u32` — Maximum value for `VertexBufferLayout::array_stride` when creating a `RenderPipeline`. Defaults to 2048. Higher is "better".
- `max_inter_stage_shader_variables: u32` — Maximum value for the number of input or output variables for inter-stage communication (like vertex outputs or fragment inputs) `@location(…)`s (in WGSL parlance) when creating a…
- `min_uniform_buffer_offset_alignment: u32` — Required `BufferBindingType::Uniform` alignment for `BufferBinding::offset` when creating a `BindGroup`, or for `set_bind_group` `dynamicOffsets`. Defaults to 256. Lower is "bette…
- `min_storage_buffer_offset_alignment: u32` — Required `BufferBindingType::Storage` alignment for `BufferBinding::offset` when creating a `BindGroup`, or for `set_bind_group` `dynamicOffsets`. Defaults to 256. Lower is "bette…
- `max_color_attachments: u32` — The maximum allowed number of color attachments.
- `max_color_attachment_bytes_per_sample: u32` — The maximum number of bytes necessary to hold one sample (pixel or subpixel) of render pipeline output data, across all color attachments as described by [`TextureFormat::target_p…
- `max_compute_workgroup_storage_size: u32` — Maximum number of bytes used for workgroup memory in a compute entry point. Defaults to 16384. Higher is "better".
- `max_compute_invocations_per_workgroup: u32` — Maximum value of the product of the `workgroup_size` dimensions for a compute entry-point. Defaults to 256. Higher is "better".
- `max_compute_workgroup_size_x: u32` — The maximum value of the `workgroup_size` X dimension for a compute stage `ShaderModule` entry-point. Defaults to 256. Higher is "better".
- `max_compute_workgroup_size_y: u32` — The maximum value of the `workgroup_size` Y dimension for a compute stage `ShaderModule` entry-point. Defaults to 256. Higher is "better".
- `max_compute_workgroup_size_z: u32` — The maximum value of the `workgroup_size` Z dimension for a compute stage `ShaderModule` entry-point. Defaults to 64. Higher is "better".
- `max_compute_workgroups_per_dimension: u32` — The maximum value for each dimension of a `ComputePass::dispatch_workgroups(x, y, z)` operation. Defaults to 65535. Higher is "better".
- `max_immediate_size: u32` — Amount of storage available for immediates in bytes. Defaults to 0. Higher is "better". Requesting more than 0 during device creation requires [`Features::IMMEDIATES`] to be enabl…
- `max_non_sampler_bindings: u32` — Maximum number of live non-sampler bindings.
- `max_task_workgroup_total_count: u32` — The maximum total value for a `RenderPass::draw_mesh_tasks(x, y, z)` call on a mesh pipeline with a task shader. Higher is "better".
- `max_task_workgroups_per_dimension: u32` — The maximum value for each dimension of a `RenderPass::draw_mesh_tasks(x, y, z)` call on a mesh pipeline with a task shader. Higher is "better".
- `max_mesh_workgroup_total_count: u32` — The maximum product of arguments of a `RenderPass::draw_mesh_tasks(x, y, z)` operation on a mesh shader pipeline without task shaders. Also for task shader outputs. Higher is "bet…
- `max_mesh_workgroups_per_dimension: u32` — The maximum value for each dimension of a `RenderPass::draw_mesh_tasks(x, y, z)` operation on a mesh shader pipeline without task shaders. Also for task shader outputs. Higher is…
- `max_task_invocations_per_workgroup: u32` — Maximum total number of invocations, or threads, per task shader workgroup. Higher is "better".
- `max_task_invocations_per_dimension: u32` — The maximum value for each dimension of a task shader's workgroup size. Higher is "better".
- `max_mesh_invocations_per_workgroup: u32` — Maximum total number of invocations, or threads, per mesh shader workgroup. Higher is "better".
- `max_mesh_invocations_per_dimension: u32` — The maximum value for each dimension of a mesh shader's workgroup size. Higher is "better".
- `max_task_payload_size: u32` — The maximum size of the payload passed from task to mesh shader. Higher is "better".
- `max_mesh_output_vertices: u32` — The maximum number of vertices that a mesh shader may output. Higher is "better".
- `max_mesh_output_primitives: u32` — The maximum number of primitives that a mesh shader may output. Higher is "better".
- `max_mesh_output_layers: u32` — The maximum number of layers that can be output from a mesh shader. Higher is "better". See [#8509](https://github.com/gfx-rs/wgpu/issues/8509).
- `max_mesh_multiview_view_count: u32` — The maximum number of views that can be used by a mesh shader in multiview rendering. Higher is "better".
- `max_blas_primitive_count: u32` — The maximum number of primitive (ex: triangles, aabbs) a BLAS is allowed to have. Requesting more than 0 during device creation only makes sense if [`Features::EXPERIMENTAL_RAY_QU…
- `max_blas_geometry_count: u32` — The maximum number of geometry descriptors a BLAS is allowed to have. Requesting more than 0 during device creation only makes sense if [`Features::EXPERIMENTAL_RAY_QUERY`] is ena…
- `max_tlas_instance_count: u32` — The maximum number of instances a TLAS is allowed to have. Requesting more than 0 during device creation only makes sense if [`Features::EXPERIMENTAL_RAY_QUERY`] is enabled.
- `max_acceleration_structures_per_shader_stage: u32` — The maximum number of acceleration structures allowed to be used in a shader stage. Requesting more than 0 during device creation only makes sense if [`Features::EXPERIMENTAL_RAY_…
- `max_buffers_and_acceleration_structures_per_shader_stage: u32` — The combined number of buffers (storage and uniform), vertex buffers, and acceleration structures that can be bound in a single shader stage.
- `max_multiview_view_count: u32` — The maximum number of views that can be used in multiview rendering
- `max_ray_dispatch_count: u32` — The maximum total number (`x*y*z`) of rays able to be dispatched by a trace rays call in a ray tracing pass. Requesting more than 0 during device creation only makes sense if [`Fe…
- `max_ray_recursion_depth: u32` — The maximum number that one can pass into a ray tracing pipeline creation to be the maximum ray recursion depth. (the maximum of the max ray recursion depth) Requesting more than…

Methods and constants:

- `const fn defaults() -> Self` — These default limits are guaranteed to work on all modern backends and guaranteed to be supported by WebGPU _[must_use]_
- `const fn downlevel_defaults() -> Self` — These default limits are guaranteed to be compatible with GLES-3.1. _[must_use]_
- `const fn downlevel_webgl2_defaults() -> Self` — These default limits are guaranteed to be compatible with GLES-3.0 and WebGL2 _[must_use]_
- `const fn unlimited() -> Self` — Sets each limit to `i32::MAX` (or 1, in the case of lower-is-better limits). _[must_use]_
- `const fn using_resolution(self, other: Self) -> Self` — Modify the current limits to use the resolution limits of the other. _[must_use]_
- `const fn using_alignment(self, other: Self) -> Self` — Modify the current limits to use the buffer alignment limits of the adapter. _[must_use]_
- `const fn using_minimum_supported_acceleration_structure_values(self) -> Self` — The minimum guaranteed limits for acceleration structures if you enable [`Features::EXPERIMENTAL_RAY_QUERY`] _[must_use]_
- `const fn using_acceleration_structure_values(self, other: Self) -> Self` — Modify the current limits to use the acceleration structure limits of `other` (`other` could be the limits of the adapter). _[must_use]_
- `const fn using_minimum_supported_ray_tracing_pipeline_values(self) -> Self` — The minimum guaranteed limits for acceleration structures if you enable [`Features::EXPERIMENTAL_RAY_TRACING_PIPELINES`] These may change in the future (including downwards). _[must_use]_
- `const fn using_recommended_minimum_mesh_shader_values(self) -> Self` — The recommended minimum limits for mesh shaders if you enable [`Features::EXPERIMENTAL_MESH_SHADER`] _[must_use]_
- `fn check_limits(&self, allowed: &Self) -> bool` — Compares every limits within self is within the limits given in `allowed`. _[must_use]_
- `fn check_limits_with_fail_fn(&self, allowed: &Self, fatal: bool, fail_fn: impl FnMut(&'static str, u64, u64))` — Compares every limits within self is within the limits given in `allowed`. For an easy to use binary choice, use [`Limits::check_limits`].
- `fn or_better_values_from(self, other: &Self) -> Self` — For each limit in `other` that is better than the value in `self`, replace the value in `self` with the value from `other`. _[must_use]_
- `fn or_worse_values_from(self, other: &Self) -> Self` — For each limit in `other` that is worse than the value in `self`, replace the value in `self` with the value from `other`. _[must_use]_
- `fn zero_native_only(&mut self)` — Sets all native-only limits to zero, except for `max_non_sampler_bindings`.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ShaderModel — enum

Collections of shader features a device supports if they support less than WebGPU normally allows.

Variants (3):

- `Sm2` — Extremely limited shaders, including a total instruction limit.
- `Sm4` — Missing minor features and storage images.
- `Sm5` — WebGPU supports shader module 5.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`
