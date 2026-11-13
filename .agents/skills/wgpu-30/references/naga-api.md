# naga 30.0.1 API map

> Generated 2026-10-05 from the rustdoc JSON (format 61) of `naga` 30.0.1 (front ends WGSL/SPIR-V/GLSL, back ends WGSL/SPIR-V/MSL/HLSL/GLSL, validation). The intermediate representation (`ir`) and the procedural helpers (`proc`) are listed by name only. Do not edit: regenerate (see ../SKILL.md).

### ABSTRACT_WIDTH — constant

`const ABSTRACT_WIDTH: Bytes = 8`

Width of abstract types, in bytes.

### AddressSpace — enum

Addressing space of variables.

Variants (10):

- `Function` — Function locals.
- `Private` — Private data, per invocation, mutable.
- `WorkGroup` — Workgroup shared data, mutable.
- `Uniform` — Uniform buffer data.
- `Storage { access: StorageAccess }` — Storage buffer data, potentially mutable.
- `Handle` — Opaque handles, such as samplers and images.
- `Immediate` — Immediate data.
- `TaskPayload` — Task shader to mesh shader payload
- `RayPayload` — Ray tracing payload, for inputting in TraceRays
- `IncomingRayPayload` — Ray tracing payload, for entrypoints invoked by a TraceRays call

Methods and constants:

- `fn access(self) -> StorageAccess`
- `const fn is_workgroup_like(self) -> bool`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Arena`<T>` — struct

An arena holding some kind of component (e.g., type, constant, instruction, etc.) that can be referenced.

Opaque (private fields).

Methods and constants:

- `const fn new() -> Self` — Create a new arena with no initial capacity allocated.
- `fn into_inner(self) -> Vec<T>` — Extracts the inner vector.
- `const fn len(&self) -> usize` — Returns the current number of items stored in this arena.
- `const fn is_empty(&self) -> bool` — Returns `true` if the arena contains no elements.
- `fn iter(&self) -> impl DoubleEndedIterator<Item = (Handle<T>, &T)> + ExactSizeIterator` — Returns an iterator over the items stored in this arena, returning both the item's handle and a reference to it.
- `fn iter_mut_span(&mut self) -> impl DoubleEndedIterator<Item = (Handle<T>, &mut T, &Span)> + ExactSizeIterator` — Returns an iterator over the items stored in this arena, returning both the item's handle and a reference to it.
- `fn drain(&mut self) -> impl DoubleEndedIterator<Item = (Handle<T>, T, Span)>` — Drains the arena, returning an iterator over the items stored.
- `fn iter_mut(&mut self) -> impl DoubleEndedIterator<Item = (Handle<T>, &mut T)>` — Returns a iterator over the items stored in this arena, returning both the item's handle and a mutable reference to it.
- `fn append(&mut self, value: T, span: Span) -> Handle<T>` — Adds a new value to the arena, returning a typed handle.
- `fn fetch_if<F: Fn(&T) -> bool>(&self, fun: F) -> Option<Handle<T>>` — Fetch a handle to an existing type.
- `fn fetch_if_or_append<F: Fn(&T, &T) -> bool>(&mut self, value: T, span: Span, fun: F) -> Handle<T>` — Adds a value with a custom check for uniqueness: returns a handle pointing to an existing element if the check succeeds, or adds a new element otherwise.
- `fn fetch_or_append(&mut self, value: T, span: Span) -> Handle<T> where T: PartialEq` — Adds a value with a check for uniqueness, where the check is plain comparison.
- `fn try_get(&self, handle: Handle<T>) -> Result<&T, BadHandle>`
- `fn get_mut(&mut self, handle: Handle<T>) -> &mut T` — Get a mutable reference to an element in the arena.
- `fn range_from(&self, old_length: usize) -> Range<T>` — Get the range of handles from a particular number of elements to the end.
- `fn clear(&mut self)` — Clears the arena keeping all allocations
- `fn take(&mut self) -> Self` — Replaces this arena with an empty one, returning the old data.
- `fn get_span(&self, handle: Handle<T>) -> Span`
- `fn check_contains_handle(&self, handle: Handle<T>) -> Result<(), BadHandle>` — Assert that `handle` is valid for this arena.
- `fn check_contains_range(&self, range: &Range<T>) -> Result<(), BadRangeError>` — Assert that `range` is valid for this arena.

Implements: `Clone`, `Debug`, `Default`, `Index<Handle<T>>`, `Index<Range<T>>`, `IndexMut<Handle<T>>`

### ArraySize — enum

Size of an array.

Variants (3):

- `Constant(core::num::NonZeroU32)` — The array size is constant.
- `Pending(arena::Handle<Override>)` — The array size is an override-expression.
- `Dynamic` — The array size can change at runtime.

Methods and constants:

- `const fn to_indexable_length(self, _module: &Module) -> Result<IndexableLength, IndexableLengthError>`
- `fn resolve(&self, gctx: GlobalCtx<'_>) -> Result<IndexableLength, ResolveArraySizeError>` — Return the number of elements that `size` represents, if known at code generation time.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### AtomicFunction — enum

Function on an atomic value.

Variants (8):

- `Add`
- `Subtract`
- `And`
- `ExclusiveOr`
- `InclusiveOr`
- `Min`
- `Max`
- `Exchange { compare: Option<arena::Handle<Expression>> }`

Methods and constants:

- `fn map(word: &str) -> Option<Self>`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### back::binary_operation_str — function

`const fn naga::back::binary_operation_str(op: BinaryOperator) -> &'static str`

Helper function that returns the string corresponding to the [`BinaryOperator`](crate::BinaryOperator)

### back::COMPONENTS — constant

`const back::COMPONENTS: &[char] = _`

Names of vector components.

### back::FunctionCtx`<'a>` — struct

Helper structure that stores data needed when writing the function

Fields:

- `ty: FunctionType` — The current function being written
- `info: &'a valid::FunctionInfo` — Analysis about the function
- `expressions: &'a Arena<Expression>` — The expression arena of the current function being written
- `named_expressions: &'a FastIndexMap<Handle<Expression>, alloc::string::String>` — Map of expressions that have associated variable names

Methods and constants:

- `fn resolve_type<'a>(self: &'a Self, handle: Handle<Expression>, types: &'a UniqueArena<Type>) -> &'a TypeInner` — Helper method that resolves a type of a given expression.
- `const fn name_key(&self, local: Handle<LocalVariable>) -> proc::NameKey` — Helper method that generates a [`NameKey`](crate::proc::NameKey) for a local in the current function
- `const fn argument_key(&self, arg: u32) -> proc::NameKey` — Helper method that generates a [`NameKey`](crate::proc::NameKey) for a function argument.
- `const fn external_texture_argument_key(&self, arg: u32, external_texture_key: proc::ExternalTextureNameKey) -> proc::NameKey` — Helper method that generates a [`NameKey`](crate::proc::NameKey) for an external texture function argument.
- `fn is_fixed_function_input(&self, expression: Handle<Expression>, module: &Module) -> Option<BuiltIn>` — Returns true if the given expression points to a fixed-function pipeline input.

Implements: `Debug`

### back::FunctionType — enum

Whether we're generating an entry point or a regular function.

Variants (2):

- `Function(Handle<Function>)` — A regular function.
- `EntryPoint(proc::EntryPointIndex)` — An [`EntryPoint`], and its index in [`Module::entry_points`].

Methods and constants:

- `fn is_compute_like_entry_point(&self, module: &Module) -> bool` — Returns true if the function is an entry point for a compute-like shader.

Implements: `Clone`, `Copy`, `Debug`

### back::glsl::Error — enum

A GLSL compilation error.

Variants (12):

- `FmtError(core::fmt::Error)` — A error occurred while writing to the output.
- `MissingFeatures(Features)` — The specified [`Version`] doesn't have all required [`Features`].
- `MultipleImmediateData` — [`AddressSpace::Immediate`](crate::AddressSpace::Immediate) was used more than once in the entry point, which isn't supported.
- `VersionNotSupported` — The specified [`Version`] isn't supported.
- `EntryPointNotFound` — The entry point couldn't be found.
- `UnsupportedExternal(alloc::string::String)` — A call was made to an unsupported external.
- `UnsupportedScalar(Scalar)` — A scalar with an unsupported width was requested.
- `ImageMultipleSamplers` — A image was used with multiple samplers, which isn't supported.
- `Custom(alloc::string::String)`
- `Override`
- `FirstSamplingNotSupported` — [`crate::Sampling::First`] is unsupported.
- `ResolveArraySizeError(proc::ResolveArraySizeError)`

Implements: `Debug`, `Display`, `Error`, `From<Error>`, `From<ResolveArraySizeError>`

### back::glsl::Features — struct

Structure used to encode additions to GLSL that aren't supported by all versions.

Opaque (private fields).

Methods and constants:

- `const BUFFER_STORAGE: Self` — Buffer address space support.
- `const ARRAY_OF_ARRAYS: Self`
- `const DOUBLE_TYPE: Self` — 8 byte floats.
- `const FULL_IMAGE_FORMATS: Self` — More image formats.
- `const MULTISAMPLED_TEXTURES: Self`
- `const MULTISAMPLED_TEXTURE_ARRAYS: Self`
- `const CUBE_TEXTURES_ARRAY: Self`
- `const COMPUTE_SHADER: Self`
- `const IMAGE_LOAD_STORE: Self` — Image load and early depth tests.
- `const CONSERVATIVE_DEPTH: Self`
- `const NOPERSPECTIVE_QUALIFIER: Self` — Interpolation and auxiliary qualifiers.
- `const SAMPLE_QUALIFIER: Self`
- `const CLIP_DISTANCE: Self`
- `const CULL_DISTANCE: Self`
- `const SAMPLE_VARIABLES: Self` — Sample ID.
- `const DYNAMIC_ARRAY_SIZE: Self` — Arrays with a dynamic length.
- `const MULTI_VIEW: Self`
- `const TEXTURE_SAMPLES: Self` — Texture samples query
- `const TEXTURE_LEVELS: Self` — Texture levels query
- `const IMAGE_SIZE: Self` — Image size query
- `const DUAL_SOURCE_BLENDING: Self` — Dual source blending
- `const INSTANCE_INDEX: Self` — Instance index
- `const TEXTURE_SHADOW_LOD: Self` — Sample specific LODs of cube / array shadow textures
- `const SUBGROUP_OPERATIONS: Self` — Subgroup operations
- `const TEXTURE_ATOMICS: Self` — Image atomics
- `const SHADER_BARYCENTRICS: Self` — Image atomics
- `const PRIMITIVE_INDEX: Self` — Primitive index builtin
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
- `const fn iter(&self) -> $crate::iter::Iter<Features>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<Features>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<Features>`, `Flags`, `FromIterator<Features>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### back::glsl::ImmediateItem — struct

All information to bind a single uniform value to the shader.

Fields:

- `access_path: alloc::string::String` — GL uniform name for the item. This name is the same as if you were to access it directly from a GLSL shader.
- `ty: GlslUniformType` — Type of the uniform. This will only ever be a scalar, vector, or matrix.
- `offset: u32` — The offset in the immediate data memory block this uniform maps to.
- `size_bytes: u32` — Size of this uniform in bytes.

Implements: `Clone`, `Debug`

### back::glsl::Options — struct

Configuration used in the [`Writer`].

Fields:

- `version: Version` — The GLSL version to be used.
- `writer_flags: WriterFlags` — Configuration flags for the [`Writer`].
- `binding_map: BindingMap` — Map of resources association to binding locations.
- `zero_initialize_workgroup_memory: bool` — Should workgroup variables be zero initialized (by polyfilling)?

Implements: `Clone`, `Debug`, `Default`

### back::glsl::PipelineOptions — struct

A subset of options meant to be changed per pipeline.

Fields:

- `shader_stage: ShaderStage` — The stage of the entry point.
- `entry_point: alloc::string::String` — The name of the entry point.
- `multiview: Option<core::num::NonZeroU32>` — How many views to render to, if doing multiview rendering.

Implements: `Clone`, `Debug`

### back::glsl::ReflectionInfo — struct

Reflection info for texture mappings and uniforms.

Fields:

- `texture_mapping: FastHashMap<alloc::string::String, TextureMapping>` — Mapping between texture names and variables/samplers.
- `uniforms: FastHashMap<Handle<GlobalVariable>, alloc::string::String>` — Mapping between uniform variables and names.
- `varying: FastHashMap<alloc::string::String, VaryingLocation>` — Mapping between names and attribute locations.
- `immediates_items: alloc::vec::Vec<ImmediateItem>` — List of immediate data items in the shader.
- `clip_distance_count: u32` — Number of user-defined clip planes. Only applicable to vertex shaders.

Implements: `Debug`

### back::glsl::supported_capabilities — function

`fn naga::back::glsl::supported_capabilities() -> valid::Capabilities`

### back::glsl::TextureMapping — struct

Mapping between a texture and its sampler, if it exists.

Fields:

- `texture: Handle<GlobalVariable>` — Handle to the image global variable.
- `sampler: Option<Handle<GlobalVariable>>` — Handle to the associated sampler global variable, if it exists.

Implements: `Clone`, `Debug`

### back::glsl::VaryingLocation — struct

Fields:

- `location: u32` — The location of the global. This corresponds to `layout(location = ..)` in GLSL.
- `index: u32` — The index which can be used for dual source blending. This corresponds to `layout(index = ..)` in GLSL.

Implements: `Debug`

### back::glsl::Writer`<'a, W>` — struct

Writer responsible for all code generation.

Opaque (private fields).

Methods and constants:

- `fn new(out: W, module: &'a Module, info: &'a valid::ModuleInfo, options: &'a Options, pipeline_options: &'a PipelineOptions, policies: proc::BoundsCheckPolicies) -> Result<Self, Error>` — Creates a new [`Writer`] instance.
- `fn write(&mut self) -> Result<ReflectionInfo, Error>` — Writes the [`Module`](crate::Module) as glsl to the output

### back::glsl::WriterFlags — struct

Configuration flags for the [`Writer`].

Opaque (private fields).

Methods and constants:

- `const ADJUST_COORDINATE_SPACE: Self` — Flip output Y and extend Z from (0, 1) to (-1, 1).
- `const TEXTURE_SHADOW_LOD: Self` — Supports GL_EXT_texture_shadow_lod on the host, which provides additional functions on shadows and arrays of shadows.
- `const DRAW_PARAMETERS: Self` — Supports ARB_shader_draw_parameters on the host, which provides support for `gl_BaseInstanceARB`, `gl_BaseVertexARB`, `gl_DrawIDARB`, and `gl_DrawID`.
- `const INCLUDE_UNUSED_ITEMS: Self` — Include unused global variables, constants and functions. By default the output will exclude global variables that are not used in the specified entrypoint (in…
- `const FORCE_POINT_SIZE: Self` — Emit `PointSize` output builtin to vertex shaders, which is required for drawing with `PointList` topology.
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
- `const fn iter(&self) -> $crate::iter::Iter<WriterFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<WriterFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<WriterFlags>`, `Flags`, `FromIterator<WriterFlags>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### back::hlsl::BindingMap — type alias

`type back::hlsl::BindingMap = alloc::collections::BTreeMap<ResourceBinding, BindTarget>`

### back::hlsl::BindTarget — struct

Direct3D 12 binding information for a global variable.

Fields:

- `space: u8`
- `register: u32` — For regular bindings this is the register number.
- `binding_array_size: Option<u32>` — If the binding is an unsized binding array, this overrides the size.
- `dynamic_storage_buffer_offsets_index: Option<u32>` — This is the index in the buffer at [`Options::dynamic_storage_buffer_offsets_targets`].
- `restrict_indexing: bool` — This is a hint that we need to restrict indexing of vectors, matrices and arrays.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::DynamicStorageBufferOffsetsTargets — type alias

`type back::hlsl::DynamicStorageBufferOffsetsTargets = alloc::collections::BTreeMap<u32, OffsetsBindTarget>`

### back::hlsl::EntryPointError — enum

Variants (1):

- `MissingBinding(ResourceBinding)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::Error — enum

Variants (8):

- `IoError(core::fmt::Error)`
- `UnsupportedScalar(Scalar)`
- `Unimplemented(alloc::string::String)`
- `Custom(alloc::string::String)`
- `Override`
- `ResolveArraySizeError(proc::ResolveArraySizeError)`
- `EntryPointNotFound(ir::ShaderStage, alloc::string::String)`
- `ShaderModelTooLow(alloc::string::String, ShaderModel)`

Implements: `Debug`, `Display`, `Error`, `From<Error>`, `From<ResolveArraySizeError>`

### back::hlsl::ExternalTextureBindingMap — type alias

`type back::hlsl::ExternalTextureBindingMap = alloc::collections::BTreeMap<ResourceBinding, ExternalTextureBindTarget>`

### back::hlsl::ExternalTextureBindTarget — struct

HLSL binding information for a Naga [`External`] image global variable.

Fields:

- `planes: [BindTarget; 3]` — HLSL binding information for the individual plane textures.
- `params: BindTarget` — HLSL binding information for a buffer holding the sampling parameters.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::FragmentEntryPoint`<'a>` — struct

A fragment entry point to be considered when generating HLSL for the output interface of vertex entry points.

Opaque (private fields).

Methods and constants:

- `fn new(module: &'a Module, ep_name: &'a str) -> Option<Self>` — Returns `None` if the entry point with the provided name can't be found or isn't a fragment entry point.

Implements: `Debug`

### back::hlsl::OffsetsBindTarget — struct

BindTarget for dynamic storage buffer offsets

Fields:

- `space: u8`
- `register: u32`
- `size: u32`

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::Options — struct

Configuration used in the [`Writer`].

Fields:

- `shader_model: ShaderModel` — The hlsl shader model to be used
- `binding_map: BindingMap` — HLSL binding information for each Naga global variable.
- `fake_missing_bindings: bool` — Don't panic on missing bindings, instead generate any HLSL.
- `special_constants_binding: Option<BindTarget>` — Add special constants to `SV_VertexIndex` and `SV_InstanceIndex`, to make them work like in Vulkan/Metal, with help of the host.
- `immediates_target: Option<BindTarget>` — HLSL binding information for the [`Immediate`] global, if present.
- `sampler_heap_target: SamplerHeapBindTargets` — HLSL binding information for the sampler heap and comparison sampler heap.
- `sampler_buffer_binding_map: SamplerIndexBufferBindingMap` — Mapping of each bind group's sampler index buffer to a bind target.
- `dynamic_storage_buffer_offsets_targets: DynamicStorageBufferOffsetsTargets` — Bind target for dynamic storage buffer offsets
- `external_texture_binding_map: ExternalTextureBindingMap` — HLSL binding information for [`External`] image global variables.
- `zero_initialize_workgroup_memory: bool` — Should workgroup variables be zero initialized (by polyfilling)?
- `restrict_indexing: bool` — Should we restrict indexing of vectors, matrices and arrays?
- `force_loop_bounding: bool` — If set, loops will have code injected into them, forcing the compiler to think the number of iterations is bounded.
- `task_dispatch_limits: Option<back::TaskDispatchLimits>` — Limits to the mesh shader dispatch group a task workgroup can dispatch.
- `mesh_shader_primitive_indices_clamp: bool` — If true, naga may generate checks that the primitive indices are valid in the output.
- `ray_query_initialization_tracking: bool` — if set, ray queries will get a variable to track their state to prevent misuse.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::PipelineOptions — struct

A subset of options that are meant to be changed per pipeline.

Fields:

- `entry_point: Option<(ir::ShaderStage, alloc::string::String)>` — The entry point to write.

Implements: `Clone`, `Debug`, `Default`

### back::hlsl::ReflectionInfo — struct

Reflection info for entry point names.

Fields:

- `entry_point_names: alloc::vec::Vec<Result<alloc::string::String, EntryPointError>>` — Mapping of the entry point names.

Implements: `Debug`, `Default`

### back::hlsl::SamplerHeapBindTargets — struct

Fields:

- `standard_samplers: BindTarget`
- `comparison_samplers: BindTarget`

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::hlsl::SamplerIndexBufferBindingMap — type alias

`type back::hlsl::SamplerIndexBufferBindingMap = alloc::collections::BTreeMap<SamplerIndexBufferKey, BindTarget>`

### back::hlsl::SamplerIndexBufferKey — struct

Fields:

- `group: u32`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### back::hlsl::shader_stage_to_hlsl_str — function

`const fn naga::back::hlsl::shader_stage_to_hlsl_str(st: nt::ShaderStage) -> &'static str`

### back::hlsl::ShaderModel — enum

A HLSL shader model version.

Variants (12):

- `V5_0`
- `V5_1`
- `V6_0`
- `V6_1`
- `V6_2`
- `V6_3`
- `V6_4`
- `V6_5`
- `V6_6`
- `V6_7`
- `V6_8`
- `V6_9`

Methods and constants:

- `const fn to_str(self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### back::hlsl::supported_capabilities — function

`fn naga::back::hlsl::supported_capabilities() -> valid::Capabilities`

### back::hlsl::Writer`<'a, W>` — struct

Opaque (private fields).

Methods and constants:

- `fn new(out: W, options: &'a Options, pipeline_options: &'a PipelineOptions) -> Self`
- `fn write(&mut self, module: &Module, module_info: &valid::ModuleInfo, fragment_entry_point: Option<&FragmentEntryPoint<'_>>) -> Result<super::ReflectionInfo, Error>`

### back::INDENT — constant

`const back::INDENT: &str = "    "`

Indent for backends.

### back::Level — struct

Indentation level.

Fields (tuple):

- `0: usize`

Methods and constants:

- `const fn next(&self) -> Self`

Implements: `Clone`, `Copy`, `Debug`, `Display`

### back::msl::AttributeMapping — struct

A mapping of vertex buffers and their attributes to shader locations.

Fields:

- `shader_location: u32` — Shader location associated with this attribute
- `offset: u32` — Offset in bytes from start of vertex buffer structure
- `format: nt::VertexFormat` — Format code to help us unpack the attribute into the type used by the shader. Codes correspond to a 0-based index of <https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat>. Th…

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::BindExternalTextureTarget — struct

Binding information for a Naga [`External`] image global variable.

Fields:

- `planes: [Slot; 3]`
- `params: Slot`

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::BindingMap — type alias

`type back::msl::BindingMap = alloc::collections::BTreeMap<ResourceBinding, BindTarget>`

### back::msl::BindSamplerTarget — enum

Variants (2):

- `Resource(Slot)`
- `Inline(InlineSamplerIndex)`

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::BindTarget — struct

Fields:

- `buffer: Option<Slot>`
- `texture: Option<Slot>`
- `sampler: Option<BindSamplerTarget>`
- `external_texture: Option<BindExternalTextureTarget>`
- `mutable: bool`

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::EntryPointError — enum

Variants (4):

- `MissingBinding(alloc::string::String)`
- `MissingBindTarget(ResourceBinding)`
- `MissingImmediateData`
- `MissingSizesBuffer`

Implements: `Clone`, `Debug`, `Display`, `Error`, `PartialEq`, `StructuralPartialEq`

### back::msl::EntryPointResourceMap — type alias

`type back::msl::EntryPointResourceMap = alloc::collections::BTreeMap<alloc::string::String, EntryPointResources>`

### back::msl::EntryPointResources — struct

Fields:

- `resources: BindingMap`
- `immediates_buffer: Option<Slot>`
- `sizes_buffer: Option<Slot>` — The slot of a buffer that contains an array of `u32`, one for the size of each bound buffer that contains a runtime array, in order of [`crate::GlobalVariable`] declarations.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::Error — enum

Variants (24):

- `Format(core::fmt::Error)`
- `UnimplementedBindTarget(BindTarget)`
- `UnsupportedCompose(arena::Handle<Type>)`
- `UnsupportedBinaryOp(BinaryOperator)`
- `UnsupportedCall(alloc::string::String)`
- `FeatureNotImplemented(alloc::string::String)`
- `GenericValidation(alloc::string::String)`
- `UnsupportedBuiltIn(BuiltIn)`
- `CapabilityNotSupported(valid::Capabilities)`
- `UnsupportedAttribute(alloc::string::String)`
- `UnsupportedFunction(alloc::string::String)`
- `UnsupportedWritableStorageBuffer`
- `UnsupportedWritableStorageTexture(ir::ShaderStage)`
- `UnsupportedRWStorageTexture`
- `UnsupportedArrayOf(alloc::string::String)`
- `UnsupportedArrayOfType(arena::Handle<Type>)`
- `UnsupportedRayTracing`
- `UnsupportedCooperativeMatrix`
- `Override`
- `UnsupportedBitCast(TypeInner)`
- `ResolveArraySizeError(proc::ResolveArraySizeError)`
- `EntryPointNotFound(ir::ShaderStage, alloc::string::String)`
- `UnsupportedMeshShader`
- `PerVertexNotSupported`

Implements: `Debug`, `Display`, `Error`, `From<Error>`, `From<ResolveArraySizeError>`

### back::msl::InlineSamplerIndex — type alias

`type back::msl::InlineSamplerIndex = u8`

### back::msl::Options — struct

Fields:

- `lang_version: (u8, u8)` — (Major, Minor) target version of the Metal Shading Language.
- `per_entry_point_map: EntryPointResourceMap` — Map of entry-point resources, indexed by entry point function name, to slots.
- `inline_samplers: alloc::vec::Vec<sampler::InlineSampler>` — Samplers to be inlined into the code.
- `spirv_cross_compatibility: bool` — Make it possible to link different stages via SPIRV-Cross.
- `fake_missing_bindings: bool` — Don't panic on missing bindings, instead generate invalid MSL.
- `bounds_check_policies: index::BoundsCheckPolicies` — Bounds checking policies.
- `zero_initialize_workgroup_memory: bool` — Should workgroup variables be zero initialized (by polyfilling)?
- `force_loop_bounding: bool` — If set, loops will have code injected into them, forcing the compiler to think the number of iterations is bounded.
- `task_dispatch_limits: Option<back::TaskDispatchLimits>` — Whether and how checks in the task shader should verify the dispatched mesh grid size.
- `mesh_shader_primitive_indices_clamp: bool` — Whether to validate the output of a mesh shader workgroup.
- `emit_int_div_checks: bool` — If true (the default), integer division and modulo operations use wrapper functions that guard against division by zero and signed overflow. Set to false to emit raw division for…
- `ray_query_initialization_tracking: bool` — Whether to validate ray query calls

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::PipelineOptions — struct

A subset of options that are meant to be changed per pipeline.

Fields:

- `entry_point: Option<(ir::ShaderStage, alloc::string::String)>` — The entry point to write.
- `allow_and_force_point_size: bool` — Allow `BuiltIn::PointSize` and inject it if doesn't exist.
- `vertex_pulling_transform: bool` — If set, when generating the Metal vertex shader, transform it to receive the vertex buffers, lengths, and vertex id as args, and bounds-check the vertex id and use the index into…
- `vertex_buffer_mappings: alloc::vec::Vec<VertexBufferMapping>` — vertex_buffer_mappings are used during shader translation to support vertex pulling.
- `binding_array_length_map: FastHashMap<ResourceBinding, u32>` — For each storage `binding_array` in the pipeline layout, the number of elements that layout declares, keyed by `ResourceBinding`. The MSL writer uses this to report the number of…

Implements: `Clone`, `Debug`, `Default`

### back::msl::sampler::Address — enum

Variants (5):

- `Repeat`
- `MirroredRepeat`
- `ClampToEdge`
- `ClampToZero`
- `ClampToBorder`

Methods and constants:

- `const fn as_str(&self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::sampler::BorderColor — enum

Variants (3):

- `TransparentBlack`
- `OpaqueBlack`
- `OpaqueWhite`

Methods and constants:

- `const fn as_str(&self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::sampler::CompareFunc — enum

Variants (8):

- `Never`
- `Less`
- `LessEqual`
- `Greater`
- `GreaterEqual`
- `Equal`
- `NotEqual`
- `Always`

Methods and constants:

- `const fn as_str(&self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::sampler::Coord — enum

Variants (2):

- `Normalized`
- `Pixel`

Methods and constants:

- `const fn as_str(&self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::sampler::Filter — enum

Variants (2):

- `Nearest`
- `Linear`

Methods and constants:

- `const fn as_str(&self) -> &'static str`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::sampler::InlineSampler — struct

Fields:

- `coord: Coord`
- `address: [Address; 3]`
- `border_color: BorderColor`
- `mag_filter: Filter`
- `min_filter: Filter`
- `mip_filter: Option<Filter>`
- `lod_clamp: Option<core::ops::Range<f32>>`
- `max_anisotropy: Option<core::num::NonZeroU32>`
- `compare_func: CompareFunc`

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::Slot — type alias

`type back::msl::Slot = u8`

### back::msl::supported_capabilities — function

`fn naga::back::msl::supported_capabilities() -> valid::Capabilities`

### back::msl::TranslationInfo — struct

Information about a translated module that is required for the use of the result.

Fields:

- `entry_point_names: alloc::vec::Vec<Result<alloc::string::String, EntryPointError>>` — Mapping of the entry point names. Each item in the array corresponds to an entry point index.

Implements: `Debug`

### back::msl::VertexBufferMapping — struct

A description of a vertex buffer with all the information we need to address the attributes within it.

Fields:

- `id: u32` — Shader location associated with this buffer
- `stride: u32` — Size of the structure in bytes
- `step_mode: VertexBufferStepMode` — Vertex buffer step mode
- `attributes: alloc::vec::Vec<AttributeMapping>` — Vec of the attributes within the structure

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::VertexBufferStepMode — enum

Defines how to advance the data in vertex buffers.

Variants (3):

- `Constant`
- `ByVertex`
- `ByInstance`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### back::msl::write_string — function

`fn naga::back::msl::write_string(module: &Module, info: &valid::ModuleInfo, options: &Options, pipeline_options: &PipelineOptions) -> Result<(alloc::string::String, TranslationInfo), Error>`

### back::msl::Writer`<W>` — struct

Opaque (private fields).

Methods and constants:

- `fn write_workgroup_variables_initialization(&mut self, module: &Module, module_info: &valid::ModuleInfo, fun_info: &valid::FunctionInfo, local_invocation_index: Option<&NameKey>, stage: ShaderStage) -> Result<(), Error>`
- `fn new(out: W) -> Self` — Creates a new `Writer` instance.
- `fn finish(self) -> W` — Finishes writing and returns the output.
- `fn write(&mut self, module: &Module, info: &valid::ModuleInfo, options: &Options, pipeline_options: &PipelineOptions) -> Result<TranslationInfo, Error>`

### back::NeedBakeExpressions — type alias

`type back::NeedBakeExpressions = FastHashSet<Handle<Expression>>`

Expressions that need baking.

### back::pipeline_constants::PipelineConstantError — enum

Variants (8):

- `MissingValue(alloc::string::String)`
- `NotFound(alloc::string::String)`
- `SrcNeedsToBeFinite`
- `DstRangeTooSmall`
- `ConstantEvaluatorError(proc::ConstantEvaluatorError)`
- `ValidationError(WithSpan<valid::ValidationError>)`
- `NegativeWorkgroupSize`
- `NegativeMeshOutputMax`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ConstantEvaluatorError>`, `From<WithSpan<ValidationError>>`

### back::pipeline_constants::process_overrides — function

`fn naga::back::pipeline_constants::process_overrides<'a>(module: &'a Module, module_info: &'a valid::ModuleInfo, entry_point: Option<(ir::ShaderStage, &str)>, pipeline_constants: &super::PipelineConstants) -> Result<(alloc::borrow::Cow<'a, Module>, alloc::borrow::Cow<'a, valid::ModuleInfo>), PipelineConstantError>`

Compact `module` and replace all overrides with constants.

### back::PipelineConstants — type alias

`type back::PipelineConstants = hashbrown::HashMap<alloc::string::String, f64>`

Specifies the values of pipeline-overridable constants in the shader module.

### back::RayFlag — struct

Ray flags, for a [`RayDesc`]'s `flags` field.

Opaque (private fields).

Methods and constants:

- `const OPAQUE: Self`
- `const NO_OPAQUE: Self`
- `const TERMINATE_ON_FIRST_HIT: Self`
- `const SKIP_CLOSEST_HIT_SHADER: Self`
- `const CULL_BACK_FACING: Self`
- `const CULL_FRONT_FACING: Self`
- `const CULL_OPAQUE: Self`
- `const CULL_NO_OPAQUE: Self`
- `const SKIP_TRIANGLES: Self`
- `const SKIP_AABBS: Self`
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
- `const fn iter(&self) -> $crate::iter::Iter<RayFlag>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<RayFlag>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<RayFlag>`, `Flags`, `FromIterator<RayFlag>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### back::RayIntersectionType — enum

The intersection test to use for ray queries.

Variants (2):

- `Triangle = 1`
- `BoundingBox = 4`

Implements: `Debug`

### back::spv::DebugInfo`<'a>` — struct

Fields:

- `source_code: &'a str`
- `file_name: &'a str`
- `language: SourceLanguage`

Implements: `Clone`, `Debug`

### back::spv::Error — enum

Variants (9):

- `EntryPointNotFound`
- `UnsupportedVersion(u8, u8)`
- `MissingCapabilities(&'static str, alloc::vec::Vec<Capability>)`
- `FeatureNotImplemented(&'static str)`
- `Validation(&'static str)`
- `Override`
- `ResolveArraySizeError(proc::ResolveArraySizeError)`
- `SpirvVersionTooLow(u8, u8)`
- `MissingBinding(ResourceBinding)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ResolveArraySizeError>`

### back::spv::ImageTypeFlags — struct

Flags corresponding to the boolean(-ish) parameters to OpTypeImage.

Opaque (private fields).

Methods and constants:

- `const DEPTH: Self`
- `const ARRAYED: Self`
- `const MULTISAMPLED: Self`
- `const SAMPLED: Self`
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
- `const fn iter(&self) -> $crate::iter::Iter<ImageTypeFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<ImageTypeFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<ImageTypeFlags>`, `Flags`, `FromIterator<ImageTypeFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### back::spv::MeshReturnInfo — struct

Opaque (private fields).

Implements: `Debug`

### back::spv::MeshReturnMember — struct

Fields:

- `ty_id: u32`
- `binding: Binding`

Implements: `Clone`, `Debug`

### back::spv::Options`<'a>` — struct

Fields:

- `lang_version: (u8, u8)` — (Major, Minor) target version of the SPIR-V.
- `flags: WriterFlags` — Configuration flags for the writer.
- `fake_missing_bindings: bool` — Don't panic on missing bindings. Instead use fake values for `Binding` and `DescriptorSet` decorations. This may result in invalid SPIR-V.
- `binding_map: BindingMap` — Map of resources to information about the binding.
- `capabilities: Option<FastHashSet<Capability>>` — If given, the set of capabilities modules are allowed to use. Code that requires capabilities beyond these is rejected with an error.
- `bounds_check_policies: proc::BoundsCheckPolicies` — How should generate code handle array, vector, matrix, or image texel indices that are out of range?
- `zero_initialize_workgroup_memory: ZeroInitializeWorkgroupMemoryMode` — Dictates the way workgroup variables should be zero initialized
- `force_loop_bounding: bool` — If set, loops will have code injected into them, forcing the compiler to think the number of iterations is bounded.
- `ray_query_initialization_tracking: bool` — if set, ray queries will get a variable to track their state to prevent misuse.
- `trace_ray_argument_validation: bool` — If set, arguments to `traceRays` calls will be validated.
- `use_storage_input_output_16: bool` — Whether to use the `StorageInputOutput16` capability for `f16` shader I/O. When false, `f16` I/O is polyfilled using `f32` types with conversions.
- `debug_info: Option<DebugInfo<'a>>`
- `task_dispatch_limits: Option<back::TaskDispatchLimits>` — Limits to the mesh shader dispatch group a task workgroup can dispatch.
- `mesh_shader_primitive_indices_clamp: bool` — If true, naga may generate checks that the primitive indices are valid in the output.
- `emit_int_div_checks: bool` — If true (the default), integer division and modulo operations emit wrapper functions that replace a zero divisor with one, and for signed integers also guard against `INT_MIN / -1…

Implements: `Clone`, `Debug`, `Default`

### back::spv::PipelineOptions — struct

Fields:

- `shader_stage: ShaderStage` — The stage of the entry point.
- `entry_point: alloc::string::String` — The name of the entry point.

Implements: `Clone`, `Debug`

### back::spv::Std140CompatTypeInfo — struct

Information about a type for which we have declared a std140 layout compatible variant, because the type is used in a uniform but does not adhere to std140 requirements. The uniform will be declared using the type `type_id`, and the result of any `Load` will be immediately converted to the base type. This is used for matrices with 2 rows, as well as any arrays or structs containing such matrices.

Opaque (private fields).

Implements: `Debug`

### back::spv::supported_capabilities — function

`fn naga::back::spv::supported_capabilities() -> valid::Capabilities`

### back::spv::write_vec — function

`fn naga::back::spv::write_vec(module: &Module, info: &valid::ModuleInfo, options: &Options<'_>, pipeline_options: Option<&PipelineOptions>) -> Result<alloc::vec::Vec<u32>, Error>`

### back::spv::Writer — struct

Opaque (private fields).

Methods and constants:

- `fn new(options: &Options<'_>) -> Result<Self, Error>`
- `fn set_options(&mut self, options: &Options<'_>) -> Result<(), Error>`
- `const fn lang_version(&self) -> (u8, u8)` — Returns `(major, minor)` of the SPIR-V language version.
- `fn write_binding(&mut self, id: Word, binding: BindingDecorations)`
- `fn write_binding_struct_member(&mut self, struct_id: Word, member_idx: Word, binding_info: BindingDecorations)`
- `fn map_binding(&mut self, ir_module: &Module, stage: ShaderStage, class: spirv::StorageClass, ty: Handle<Type>, binding: &Binding) -> Result<BindingDecorations, Error>`
- `fn write(&mut self, ir_module: &Module, info: &ModuleInfo, pipeline_options: Option<&PipelineOptions>, debug_info: &Option<DebugInfo<'_>>, words: &mut Vec<Word>) -> Result<(), Error>`
- `const fn get_capabilities_used(&self) -> &FastIndexSet<spirv::Capability>` — Return the set of capabilities the last module written used.
- `fn decorate_non_uniform_binding_array_access(&mut self, id: Word) -> Result<(), Error>`

### back::spv::WriterFlags — struct

Opaque (private fields).

Methods and constants:

- `const DEBUG: Self` — Include debug labels for everything.
- `const ADJUST_COORDINATE_SPACE: Self` — Flip Y coordinate of [`BuiltIn::Position`] output.
- `const LABEL_VARYINGS: Self` — Emit [`OpName`][op] for input/output locations.
- `const FORCE_POINT_SIZE: Self` — Emit [`PointSize`] output builtin to vertex shaders, which is required for drawing with `PointList` topology.
- `const CLAMP_FRAG_DEPTH: Self` — Clamp [`BuiltIn::FragDepth`] output between 0 and 1.
- `const PRINT_ON_RAY_QUERY_INITIALIZATION_FAIL: Self` — Instead of silently failing if the arguments to generate a ray query are invalid, uses debug printf extension to print to the command line
- `const PRINT_ON_TRACE_RAYS_FAIL: Self` — Instead of silently failing if the arguments to `traceRays` are invalid, uses debug printf extension to print to the command line
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
- `const fn iter(&self) -> $crate::iter::Iter<WriterFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<WriterFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<WriterFlags>`, `Flags`, `FromIterator<WriterFlags>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### back::spv::ZeroInitializeWorkgroupMemoryMode — enum

Variants (3):

- `Native` — Via `VK_KHR_zero_initialize_workgroup_memory` or Vulkan 1.3
- `Polyfill` — Via assignments + barrier
- `None`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### back::wgsl::Error — enum

Variants (5):

- `FmtError(core::fmt::Error)`
- `Custom(alloc::string::String)`
- `Unimplemented(alloc::string::String)`
- `UnsupportedRelationalFunction(RelationalFunction)`
- `Unsupported { kind: &'static str, value: alloc::string::String }`

Implements: `Debug`, `Display`, `Error`, `From<Error>`

### back::wgsl::supported_capabilities — function

`const fn naga::back::wgsl::supported_capabilities() -> valid::Capabilities`

### back::wgsl::write_string — function

`fn naga::back::wgsl::write_string(module: &Module, info: &valid::ModuleInfo, flags: WriterFlags) -> Result<alloc::string::String, Error>`

### back::wgsl::Writer`<W>` — struct

Opaque (private fields).

Methods and constants:

- `fn new(out: W, flags: WriterFlags) -> Self`
- `fn write(&mut self, module: &Module, info: &valid::ModuleInfo) -> Result<(), super::Error>`
- `fn finish(self) -> W`

### back::wgsl::WriterFlags — struct

Opaque (private fields).

Methods and constants:

- `const EXPLICIT_TYPES: Self` — Always annotate the type information instead of inferring.
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
- `const fn iter(&self) -> $crate::iter::Iter<WriterFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<WriterFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<WriterFlags>`, `Flags`, `FromIterator<WriterFlags>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### Barrier — struct

Memory barrier flags.

Opaque (private fields).

Methods and constants:

- `const STORAGE: Self` — Barrier affects all [`AddressSpace::Storage`] accesses.
- `const WORK_GROUP: Self` — Barrier affects all [`AddressSpace::WorkGroup`] and [`AddressSpace::TaskPayload`] accesses.
- `const SUB_GROUP: Self` — Barrier synchronizes execution across all invocations within a subgroup that execute this instruction.
- `const TEXTURE: Self` — Barrier synchronizes texture memory accesses in a workgroup.
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
- `const fn iter(&self) -> $crate::iter::Iter<Barrier>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<Barrier>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<Barrier>`, `Flags`, `FromIterator<Barrier>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### BinaryOperator — enum

Operation that can be applied on two values.

Variants (18):

- `Add`
- `Subtract`
- `Multiply`
- `Divide`
- `Modulo` — Equivalent of the WGSL's `%` operator or SPIR-V's `OpFRem`
- `Equal`
- `NotEqual`
- `Less`
- `LessEqual`
- `Greater`
- `GreaterEqual`
- `And`
- `ExclusiveOr`
- `InclusiveOr`
- `LogicalAnd`
- `LogicalOr`
- `ShiftLeft`
- `ShiftRight` — Right shift carries the sign of signed integers only.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Binding — enum

Describes how an input/output variable is to be bound.

Variants (2):

- `BuiltIn(BuiltIn)` — Built-in shader variable.
- `Location { location: u32, interpolation: Option<Interpolation>, sampling: Option<Sampling>, blend_src: Option<u32>, per_primitive: bool }` — Indexed location.

Methods and constants:

- `const fn to_built_in(&self) -> Option<BuiltIn>`

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Block — struct

A code block is a vector of statements, with maybe a vector of spans.

Opaque (private fields).

Methods and constants:

- `const fn new() -> Self`
- `fn from_vec(body: Vec<Statement>) -> Self`
- `fn with_capacity(capacity: usize) -> Self`
- `fn push(&mut self, end: Statement, span: Span)`
- `fn extend(&mut self, item: Option<(Statement, Span)>)`
- `fn extend_block(&mut self, other: Self)`
- `fn append(&mut self, other: &mut Self)`
- `fn cull<R: RangeBounds<usize> + Clone>(&mut self, range: R)`
- `fn splice<R: RangeBounds<usize> + Clone>(&mut self, range: R, other: Self)`
- `fn span_into_iter(self) -> impl Iterator<Item = (Statement, Span)>`
- `fn span_iter(&self) -> impl Iterator<Item = (&Statement, &Span)>`
- `fn span_iter_mut(&mut self) -> impl Iterator<Item = (&mut Statement, Option<&mut Span>)>`
- `const fn is_empty(&self) -> bool`
- `const fn len(&self) -> usize`

Implements: `Clone`, `Debug`, `Default`, `Deref`, `DerefMut`, `From<Vec<Statement>>`, `IntoIterator`

### BOOL_WIDTH — constant

`const BOOL_WIDTH: Bytes = 1`

Width of a boolean type, in bytes.

### BuiltIn — enum

Built-in inputs and outputs.

Variants (49):

- `PrimitiveIndex` — Read in fragment shaders, written in mesh shaders, read in any and closest hit shaders.
- `Position { invariant: bool }` — Written in vertex/mesh shaders, read in fragment shaders
- `ViewIndex` — Read in task, mesh, vertex, and fragment shaders
- `BaseInstance` — Read in vertex shaders
- `BaseVertex` — Read in vertex shaders
- `ClipDistances` — Written in vertex & mesh shaders
- `CullDistance` — Written in vertex & mesh shaders
- `InstanceIndex` — Read in vertex, any- and closest-hit shaders
- `PointSize` — Written in vertex & mesh shaders
- `VertexIndex` — Read in vertex shaders
- `DrawIndex` — Read in vertex & task shaders, or mesh shaders in pipelines without task shaders
- `FragDepth` — Written in fragment shaders
- `PointCoord` — Read in fragment shaders
- `FrontFacing` — Read in fragment shaders
- `Barycentric { perspective: bool }` — Read in fragment shaders
- `SampleIndex` — Read in fragment shaders
- `SampleMask` — Read or written in fragment shaders
- `GlobalInvocationId` — Read in compute, task, and mesh shaders
- `LocalInvocationId` — Read in compute, task, and mesh shaders
- `LocalInvocationIndex` — Read in compute, task, and mesh shaders
- `WorkGroupId` — Read in compute, task, and mesh shaders
- `WorkGroupSize` — Read in compute, task, and mesh shaders
- `NumWorkGroups` — Read in compute, task, and mesh shaders
- `NumSubgroups` — Read in compute, task, and mesh shaders
- `SubgroupId` — Read in compute, task, and mesh shaders
- `SubgroupSize` — Read in compute, fragment, task, and mesh shaders
- `SubgroupInvocationId` — Read in compute, fragment, task, and mesh shaders
- `MeshTaskSize` — Written in task shaders
- `CullPrimitive` — Written in mesh shaders
- `PointIndex` — Written in mesh shaders
- `LineIndices` — Written in mesh shaders
- `TriangleIndices` — Written in mesh shaders
- `VertexCount` — Written to a workgroup variable in mesh shaders
- `Vertices` — Written to a workgroup variable in mesh shaders
- `PrimitiveCount` — Written to a workgroup variable in mesh shaders
- `Primitives` — Written to a workgroup variable in mesh shaders
- `RayInvocationId` — Read in all ray tracing pipeline shaders, the id within the number of rays that this current ray is.
- `NumRayInvocations` — Read in all ray tracing pipeline shaders, the number of rays created.
- `InstanceCustomData` — Read in closest hit and any hit shaders, the custom data in the tlas instance
- `GeometryIndex` — Read in closest hit and any hit shaders, the index of the geometry in the blas.
- `WorldRayOrigin` — Read in closest hit, any hit, and miss shaders, the origin of the ray.
- `WorldRayDirection` — Read in closest hit, any hit, and miss shaders, the direction of the ray.
- `ObjectRayOrigin` — Read in closest hit and any hit shaders, the direction of the ray in object space.
- `ObjectRayDirection` — Read in closest hit and any hit shaders, the direction of the ray in object space.
- `RayTmin` — Read in closest hit, any hit, and miss shaders, the t min provided by in the ray desc.
- `RayTCurrentMax` — Read in closest hit, any hit, and miss shaders, the final bounds at which a hit is accepted (the closest committed hit if there is one otherwise, t max provided in the ray desc).
- `ObjectToWorld` — Read in closest hit and any hit shaders, the matrix for converting from object space to world space
- `WorldToObject` — Read in closest hit and any hit shaders, the matrix for converting from world space to object space
- `HitKind` — Read in closest hit and any hit shaders, the type of hit as provided by the intersection function if any, otherwise this is 254 (0xFE) for a front facing triangle and 255 (0xFF) for a back facing tri…

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `TryToWgsl`

### Bytes — type alias

`type Bytes = u8`

Number of bytes per scalar.

### CollectiveOperation — enum

Variants (3):

- `Reduce = 0`
- `InclusiveScan = 1`
- `ExclusiveScan = 2`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### common::DiagnosticDebug`<T>` — struct

A wrapper for displaying Naga IR terms in debugging output.

Fields (tuple):

- `0: T`

Implements: `Debug`

### common::DiagnosticDisplay`<T>` — struct

A wrapper for displaying Naga IR terms in diagnostic output.

Fields (tuple):

- `0: T`

Implements: `Display`

### common::ForDebug — trait

Items:

- `fn for_debug(self) -> DiagnosticDebug<Self>` — Format this type using [`core::fmt::Debug`].

### common::ForDebugWithTypes — trait

Items:

- `fn for_debug(self, types: &UniqueArena<Type>) -> DiagnosticDebug<(Self, &UniqueArena<Type>)>` — Format this type using [`core::fmt::Debug`].

### common::vector_size_str — function

`const fn naga::common::vector_size_str(size: VectorSize) -> &'static str`

Helper function that returns the string corresponding to the [`VectorSize`](crate::VectorSize)

### common::wgsl::address_space_str — function

`const fn naga::common::wgsl::address_space_str(space: AddressSpace) -> (Option<&'static str>, Option<&'static str>)`

Return the WGSL address space and access mode strings for `space`.

### common::wgsl::DisplayFilterableTriggeringRule`<'a>` — struct

Opaque (private fields).

Implements: `Display`

### common::wgsl::ToWgsl — trait

Types that can return the WGSL source representation of their values as a `'static` string.

Items:

- `fn to_wgsl(self) -> &'static str` — Return WGSL source code representation of `self`.

### common::wgsl::TryToWgsl — trait

Types that may be able to return the WGSL source representation for their values as a `'static` string.

Items:

- `fn try_to_wgsl(self) -> Option<&'static str>` — Return the WGSL form of `self` as a `'static` string.
- `const DESCRIPTION: &'static str` — What kind of WGSL thing `Self` represents.
- `fn to_wgsl_for_diagnostics(self) -> String where Self: core::fmt::Debug + Copy` — Return the WGSL form of `self` as appropriate for diagnostics.

### common::wgsl::TypeContext — trait

A context for printing Naga IR types as WGSL.

Items:

- `fn lookup_type(&self, handle: Handle<Type>) -> &Type` — Return the [`Type`] referred to by `handle`.
- `fn type_name(&self, handle: Handle<Type>) -> &str` — Return the name to be used for the type referred to by `handle`.
- `fn write_override<W: Write>(&self, override: Handle<Override>, out: &mut W) -> core::fmt::Result` — Write the WGSL form of `override` to `out`.
- `fn write_unnamed_struct<W: Write>(&self, inner: &TypeInner, out: &mut W) -> core::fmt::Result` — Write a [`TypeInner::Struct`] for which we are unable to find a name.
- `fn write_non_wgsl_inner<W: Write>(&self, inner: &TypeInner, out: &mut W) -> core::fmt::Result` — Write a [`TypeInner`] that has no representation as WGSL source, even including Naga extensions.
- `fn write_non_wgsl_scalar<W: Write>(&self, scalar: Scalar, out: &mut W) -> core::fmt::Result` — Write a [`Scalar`] that has no representation as WGSL source, even including Naga extensions.
- `fn write_type<W: Write>(&self, handle: Handle<Type>, out: &mut W) -> core::fmt::Result` — Write the type `ty` as it would appear in a value's declaration.
- `fn write_type_inner<W: Write>(&self, inner: &TypeInner, out: &mut W) -> core::fmt::Result` — Write the [`TypeInner`] `inner` as it would appear in a value's declaration.
- `fn write_scalar<W: Write>(&self, scalar: Scalar, out: &mut W) -> core::fmt::Result` — Write the [`Scalar`] `scalar` as a WGSL type.
- `fn write_type_resolution<W: Write>(&self, resolution: &TypeResolution, out: &mut W) -> core::fmt::Result` — Write the [`TypeResolution`] `resolution` as a WGSL type.
- `fn write_type_conclusion<W: Write>(&self, conclusion: &proc::Conclusion, out: &mut W) -> core::fmt::Result`
- `fn write_type_rule<W: Write>(&self, name: &str, rule: &proc::Rule, out: &mut W) -> core::fmt::Result`
- `fn type_to_string(&self, handle: Handle<Type>) -> String`
- `fn type_resolution_to_string(&self, resolution: &TypeResolution) -> String`
- `fn type_rule_to_string(&self, name: &str, rule: &proc::Rule) -> String`

### compact::compact — function

`fn naga::compact::compact(module: &mut Module, keep_unused: KeepUnused)`

Remove most unused objects from `module`, which must be valid.

### compact::KeepUnused — enum

Configuration option for [`compact`]. See [`compact`] for details.

Variants (2):

- `No`
- `Yes`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<KeepUnused>`, `PartialEq`, `StructuralPartialEq`

### ConservativeDepth — enum

Enables adjusting depth without disabling early Z.

Variants (3):

- `GreaterEqual` — Shader may rewrite depth only with a value greater than calculated.
- `LessEqual` — Shader may rewrite depth smaller than one that would have been written without the modification.
- `Unchanged` — Shader may not rewrite depth value.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Constant — struct

Constant value.

Fields:

- `name: Option<alloc::string::String>`
- `ty: arena::Handle<Type>`
- `init: arena::Handle<Expression>` — The value of the constant.

Implements: `Clone`, `Debug`, `PartialEq`, `StructuralPartialEq`

### CooperativeData — struct

Fields:

- `pointer: arena::Handle<Expression>`
- `stride: arena::Handle<Expression>`
- `row_major: bool`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### CooperativeRole — enum

Role of a cooperative variable in the equation "A * B + C"

Variants (3):

- `A`
- `B`
- `C`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<CooperativeRole>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `ToWgsl`

### CooperativeSize — enum

Number of components in a cooperative vector.

Variants (2):

- `Eight = 8`
- `Sixteen = 16`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<CooperativeSize>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### DerivativeAxis — enum

Axis on which to compute a derivative.

Variants (3):

- `X`
- `Y`
- `Width`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### DerivativeControl — enum

Hint at which precision to compute a derivative.

Variants (3):

- `Coarse`
- `Fine`
- `None`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### diagnostic_filter::DiagnosticFilter — struct

A filtering rule that modifies how diagnostics are emitted for shaders.

Fields:

- `new_severity: Severity`
- `triggering_rule: FilterableTriggeringRule`

Implements: `Clone`, `Debug`

### diagnostic_filter::DiagnosticFilterNode — struct

Represents a single parent-linking node in a tree of [`DiagnosticFilter`]s backed by a [`crate::Arena`].

Fields:

- `inner: DiagnosticFilter`
- `parent: Option<Handle<DiagnosticFilterNode>>`

Implements: `Clone`, `Debug`

### diagnostic_filter::FilterableTriggeringRule — enum

A filterable triggering rule in a [`DiagnosticFilter`].

Variants (3):

- `Standard(StandardFilterableTriggeringRule)`
- `Unknown(alloc::boxed::Box<str>)`
- `User(alloc::boxed::Box<[alloc::boxed::Box<str>; 2]>)`

Methods and constants:

- `const fn display_wgsl_ident(&self) -> impl Display + '_` — [`Display`] this rule's identifiers in WGSL.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### diagnostic_filter::Severity — enum

A severity set on a [`DiagnosticFilter`].

Variants (4):

- `Off`
- `Info`
- `Warning`
- `Error`

Methods and constants:

- `fn from_wgsl_ident(s: &str) -> Option<Self>` — Convert from a sentinel word in WGSL into its associated [`Severity`], if possible.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### diagnostic_filter::StandardFilterableTriggeringRule — enum

A filterable triggering rule in a [`DiagnosticFilter`].

Variants (1):

- `DerivativeUniformity`

Methods and constants:

- `fn from_wgsl_ident(s: &str) -> Option<Self>` — Convert from a sentinel word in WGSL into its associated [`StandardFilterableTriggeringRule`], if possible.
- `const fn to_wgsl_ident(self) -> &'static str` — Maps this [`StandardFilterableTriggeringRule`] into the sentinel word associated with it in WGSL.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Direction — enum

Variants (3):

- `X = 0`
- `Y = 1`
- `Diagonal = 2`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### DocComments — struct

Doc comments preceding items.

Fields:

- `types: FastIndexMap<arena::Handle<Type>, alloc::vec::Vec<alloc::string::String>>`
- `struct_members: FastIndexMap<(arena::Handle<Type>, usize), alloc::vec::Vec<alloc::string::String>>`
- `entry_points: FastIndexMap<usize, alloc::vec::Vec<alloc::string::String>>`
- `functions: FastIndexMap<arena::Handle<Function>, alloc::vec::Vec<alloc::string::String>>`
- `constants: FastIndexMap<arena::Handle<Constant>, alloc::vec::Vec<alloc::string::String>>`
- `global_variables: FastIndexMap<arena::Handle<GlobalVariable>, alloc::vec::Vec<alloc::string::String>>`
- `module: alloc::vec::Vec<alloc::string::String>`

Implements: `Clone`, `Debug`, `Default`

### EarlyDepthTest — enum

Explicitly allows early depth/stencil tests.

Variants (2):

- `Force` — Requires depth/stencil tests to be performed before fragment shading.
- `Allow { conservative: ConservativeDepth }` — Allows an additional depth/stencil test to be performed before fragment shading.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### EntryPoint — struct

The main function for a pipeline stage.

Fields:

- `name: alloc::string::String` — Name of this entry point, visible externally.
- `stage: ShaderStage` — Shader stage.
- `early_depth_test: Option<EarlyDepthTest>` — Early depth test for fragment stages.
- `workgroup_size: [u32; 3]` — Workgroup size for compute stages
- `workgroup_size_overrides: Option<[Option<arena::Handle<Expression>>; 3]>` — Override expressions for workgroup size in the global_expressions arena
- `function: Function` — The entrance function.
- `mesh_info: Option<MeshStageInfo>` — Information for [`Mesh`] shaders.
- `task_payload: Option<arena::Handle<GlobalVariable>>` — The unique global variable used as a task payload from task shader to mesh shader
- `incoming_ray_payload: Option<arena::Handle<GlobalVariable>>` — The unique global variable used as an incoming ray payload going into any hit, closest hit and miss shaders. Unlike the outgoing ray payload, an incoming ray payload must be unique

Implements: `Clone`, `Debug`

### error::ShaderError`<E>` — struct

Fields:

- `source: alloc::string::String` — The source code of the shader.
- `label: Option<alloc::string::String>`
- `inner: alloc::boxed::Box<E>`

Implements: `Clone`, `Debug`, `Display`, `Error`

### Expression — enum

An expression that can be evaluated to obtain a value.

Variants (34):

- `Literal(Literal)` — Literal.
- `Constant(arena::Handle<Constant>)` — Constant value.
- `Override(arena::Handle<Override>)` — Pipeline-overridable constant.
- `ZeroValue(arena::Handle<Type>)` — Zero value of a type.
- `Compose { ty: arena::Handle<Type>, components: alloc::vec::Vec<arena::Handle<Expression>> }` — Composite expression.
- `Access { base: arena::Handle<Expression>, index: arena::Handle<Expression> }` — Array access with a computed index.
- `AccessIndex { base: arena::Handle<Expression>, index: u32 }` — Access the same types as [`Access`], plus [`Struct`] with a known index.
- `Splat { size: VectorSize, value: arena::Handle<Expression> }` — Splat scalar into a vector.
- `Swizzle { size: VectorSize, vector: arena::Handle<Expression>, pattern: [SwizzleComponent; 4] }` — Vector swizzle.
- `FunctionArgument(u32)` — Reference a function parameter, by its index.
- `GlobalVariable(arena::Handle<GlobalVariable>)` — Reference a global variable.
- `LocalVariable(arena::Handle<LocalVariable>)` — Reference a local variable.
- `Load { pointer: arena::Handle<Expression> }` — Load a value indirectly.
- `ImageSample { image: arena::Handle<Expression>, sampler: arena::Handle<Expression>, gather: Option<SwizzleComponent>, coordinate: arena::Handle<Expression>, array_index: Option<arena::Handle<Expression>>, offset: Option<arena::Handle<Expression>>, level: SampleLevel, depth_ref: Option<arena::Handle<Expression>>, clamp_to_edge: bool }` — Sample a point from a sampled or a depth image.
- `ImageLoad { image: arena::Handle<Expression>, coordinate: arena::Handle<Expression>, array_index: Option<arena::Handle<Expression>>, sample: Option<arena::Handle<Expression>>, level: Option<arena::Handle<Expression>> }` — Load a texel from an image.
- `ImageQuery { image: arena::Handle<Expression>, query: ImageQuery }` — Query information from an image.
- `Unary { op: UnaryOperator, expr: arena::Handle<Expression> }` — Apply an unary operator.
- `Binary { op: BinaryOperator, left: arena::Handle<Expression>, right: arena::Handle<Expression> }` — Apply a binary operator.
- `Select { condition: arena::Handle<Expression>, accept: arena::Handle<Expression>, reject: arena::Handle<Expression> }` — Select between two values based on a condition.
- `Derivative { axis: DerivativeAxis, ctrl: DerivativeControl, expr: arena::Handle<Expression> }` — Compute the derivative on an axis.
- `Relational { fun: RelationalFunction, argument: arena::Handle<Expression> }` — Call a relational function.
- `Math { fun: MathFunction, arg: arena::Handle<Expression>, arg1: Option<arena::Handle<Expression>>, arg2: Option<arena::Handle<Expression>>, arg3: Option<arena::Handle<Expression>> }` — Call a math function
- `As { expr: arena::Handle<Expression>, kind: ScalarKind, convert: Option<Bytes> }` — Cast a simple type to another kind.
- `CallResult(arena::Handle<Function>)` — Result of calling another function.
- `AtomicResult { ty: arena::Handle<Type>, comparison: bool }` — Result of an atomic operation.
- `WorkGroupUniformLoadResult { ty: arena::Handle<Type> }` — Result of a [`WorkGroupUniformLoad`] statement.
- `ArrayLength(arena::Handle<Expression>)` — Get the length of an array. The expression must resolve to a pointer to an array with a dynamic size.
- `RayQueryVertexPositions { query: arena::Handle<Expression>, committed: bool }` — Get the Positions of the triangle hit by the [`RayQuery`]
- `RayQueryProceedResult` — Result of a [`Proceed`] [`RayQuery`] statement.
- `RayQueryGetIntersection { query: arena::Handle<Expression>, committed: bool }` — Return an intersection found by `query`.
- `SubgroupBallotResult` — Result of a [`SubgroupBallot`] statement.
- `SubgroupOperationResult { ty: arena::Handle<Type> }` — Result of a [`SubgroupCollectiveOperation`] or [`SubgroupGather`] statement.
- `CooperativeLoad { columns: CooperativeSize, rows: CooperativeSize, role: CooperativeRole, data: CooperativeData }` — Load a cooperative primitive from memory.
- `CooperativeMultiplyAdd { a: arena::Handle<Expression>, b: arena::Handle<Expression>, c: arena::Handle<Expression> }` — Compute `a * b + c`

Methods and constants:

- `const fn bake_ref_count(&self) -> usize` — Returns the ref count, upon reaching which this expression should be considered for baking.
- `const fn needs_pre_emit(&self) -> bool` — Returns true if the expression is considered emitted at the start of a function.
- `const fn is_dynamic_index(&self) -> bool` — Return true if this expression is a dynamic array/vector/matrix index, for [`Access`].

Implements: `Clone`, `Debug`, `PartialEq`, `StructuralPartialEq`

### front::atomic_upgrade::Error — enum

Variants (5):

- `Unsupported`
- `UnexpectedEndOfIndices`
- `GlobalInitUnsupported`
- `GlobalVariableMissing`
- `CompareExchangeNonScalarBaseType`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<Error>`

### front::atomic_upgrade::Upgrades — struct

Opaque (private fields).

Methods and constants:

- `fn insert_global(&mut self, global: Handle<GlobalVariable>)`
- `fn insert_field(&mut self, struct_type: Handle<Type>, field: usize)`
- `fn is_empty(&self) -> bool`

Implements: `Debug`, `Default`

### front::glsl::Error — struct

Error returned during shader parsing.

Fields:

- `kind: ErrorKind` — Holds the information about the error itself.
- `meta: Span` — Holds information about the range of the source code where the error happened.

Methods and constants:

- `fn location(&self, source: &str) -> Option<SourceLocation>` — Returns a [`SourceLocation`] for the error message.

Implements: `Clone`, `Debug`, `Display`, `Error`

### front::glsl::ErrorKind — enum

Information about the cause of an error.

Variants (15):

- `EndOfFile` — Whilst parsing as encountered an unexpected EOF.
- `InvalidProfile(alloc::string::String)` — The shader specified an unsupported or invalid profile.
- `InvalidVersion(u64)` — The shader requested an unsupported or invalid version.
- `InvalidToken(super::token::TokenValue, alloc::vec::Vec<ExpectedToken>)` — Whilst parsing an unexpected token was encountered.
- `NotImplemented(&'static str)` — A specific feature is not yet implemented.
- `UnknownVariable(alloc::string::String)` — A reference to a variable that wasn't declared was used.
- `UnknownType(alloc::string::String)` — A reference to a type that wasn't declared was used.
- `UnknownField(alloc::string::String)` — A reference to a non existent member of a type was made.
- `UnknownLayoutQualifier(alloc::string::String)` — An unknown layout qualifier was used.
- `UnsupportedMatrixWithTwoRowsInStd140 { columns: u8 }` — Unsupported matrix of the form matCx2
- `UnsupportedF16MatrixInStd140 { columns: u8, rows: u8 }` — Unsupported matrix of the form f16matCxR
- `VariableAlreadyDeclared(alloc::string::String)` — A variable with the same name already exists in the current scope.
- `SemanticError(alloc::borrow::Cow<'static, str>)` — A semantic error was detected in the shader.
- `PreprocessorError(pp_rs::token::PreprocessorError)` — An error was returned by the preprocessor.
- `InternalError(&'static str)` — The parser entered an illegal state and exited

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ConstantEvaluatorError>`

### front::glsl::ExpectedToken — enum

One of the expected tokens returned in [`InvalidToken`](ErrorKind::InvalidToken).

Variants (7):

- `Token(super::token::TokenValue)` — A specific token was expected.
- `TypeName` — A type was expected.
- `Identifier` — An identifier was expected.
- `IntLiteral` — An integer literal was expected.
- `FloatLiteral` — A float literal was expected.
- `BoolLiteral` — A boolean literal was expected.
- `Eof` — The end of file was expected.

Implements: `Clone`, `Debug`, `Display`, `From<TokenValue>`, `PartialEq`, `StructuralPartialEq`

### front::glsl::Frontend — struct

The `Frontend` is the central structure of the GLSL frontend.

Opaque (private fields).

Methods and constants:

- `fn parse(&mut self, options: &Options, source: &str) -> core::result::Result<Module, ParseErrors>` — Parses a shader either outputting a shader [`Module`] or a list of [`Error`]s.
- `const fn metadata(&self) -> &ShaderMetadata` — Returns additional information about the parsed shader which might not be stored in the [`Module`], see the documentation for [`ShaderMetadata`] for more information about the returned data.

Implements: `Debug`, `Default`

### front::glsl::Options — struct

Per-shader options passed to [`parse`](Frontend::parse).

Fields:

- `stage: ShaderStage` — The shader stage in the pipeline.
- `defines: FastHashMap<alloc::string::String, alloc::string::String>` — Preprocessor definitions to be used, akin to having `glsl #define key value ` for each key value pair in the map.

Implements: `Debug`, `From<ShaderStage>`

### front::glsl::ParseErrors — struct

A collection of errors returned during shader parsing.

Fields:

- `errors: alloc::vec::Vec<Error>`

Methods and constants:

- `fn emit_to_string(&self, source: &str) -> String`
- `fn emit_to_string_with_path(&self, source: &str, path: &str) -> String`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<Vec<Error>>`

### front::glsl::Precision — enum

A precision hint used in GLSL declarations.

Variants (3):

- `Low` — `lowp` precision
- `Medium` — `mediump` precision
- `High` — `highp` precision

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `StructuralPartialEq`

### front::glsl::Profile — enum

The GLSL profile used by a shader.

Variants (1):

- `Core` — The `core` profile, default when no profile is specified.

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `StructuralPartialEq`

### front::glsl::ShaderMetadata — struct

Additional information about the GLSL shader.

Fields:

- `version: u16` — The GLSL version specified in the shader through the use of the `#version` preprocessor directive.
- `profile: Profile` — The GLSL profile specified in the shader through the use of the `#version` preprocessor directive.
- `stage: ShaderStage` — The shader stage in the pipeline, passed to the [`parse`](Frontend::parse) method via the [`Options`] struct.
- `workgroup_size: [u32; 3]` — The workgroup size for compute shaders, defaults to `[1; 3]` for compute shaders and `[0; 3]` for non compute shaders.
- `early_fragment_tests: bool` — Whether or not early fragment tests where requested by the shader. Defaults to `false`.
- `extensions: FastHashSet<alloc::string::String>` — The shader can request extensions via the `#extension` preprocessor directive, in the directive a behavior parameter is used to control whether the extension should be disabled, w…

Implements: `Debug`, `Default`

### front::glsl::TokenValue — enum

A token passed from the lexing used in the parsing.

Variants (79):

- `Identifier(alloc::string::String)`
- `FloatConstant(Float)`
- `IntConstant(Integer)`
- `BoolConstant(bool)`
- `Layout`
- `In`
- `Out`
- `InOut`
- `Uniform`
- `Buffer`
- `Const`
- `Shared`
- `Restrict`
- `MemoryQualifier(StorageAccess)` — A `glsl` memory qualifier such as `writeonly`
- `Invariant`
- `Interpolation(Interpolation)`
- `Sampling(Sampling)`
- `Precision`
- `PrecisionQualifier(super::ast::Precision)`
- `Continue`
- `Break`
- `Return`
- `Discard`
- `If`
- `Else`
- `Switch`
- `Case`
- `Default`
- `While`
- `Do`
- `For`
- `Void`
- `Struct`
- `TypeName(Type)`
- `Assign`
- `AddAssign`
- `SubAssign`
- `MulAssign`
- `DivAssign`
- `ModAssign`
- `LeftShiftAssign`
- `RightShiftAssign`
- `AndAssign`
- `XorAssign`
- `OrAssign`
- `Increment`
- `Decrement`
- `LogicalOr`
- `LogicalAnd`
- `LogicalXor`
- `LessEqual`
- `GreaterEqual`
- `Equal`
- `NotEqual`
- `LeftShift`
- `RightShift`
- `LeftBrace`
- `RightBrace`
- `LeftParen`
- `RightParen`
- `LeftBracket`
- `RightBracket`
- `LeftAngle`
- `RightAngle`
- `Comma`
- `Semicolon`
- `Colon`
- `Dot`
- `Bang`
- `Dash`
- `Tilde`
- `Plus`
- `Star`
- `Slash`
- `Percent`
- `VerticalBar`
- `Caret`
- `Ampersand`
- `Question`

Implements: `Clone`, `Debug`, `From<TokenValue>`, `PartialEq`, `StructuralPartialEq`

### front::spv::Error — enum

Variants (62):

- `InvalidHeader`
- `InvalidWordCount`
- `UnknownInstruction(u16)`
- `UnknownCapability(spirv::Word)`
- `UnsupportedInstruction(super::ModuleState, spirv::Op)`
- `UnsupportedCapability(spirv::Capability)`
- `UnsupportedExtension(alloc::string::String)`
- `UnsupportedExtSet(alloc::string::String)`
- `UnsupportedExtInstSet(spirv::Word)`
- `UnsupportedExtInst(spirv::Word)`
- `UnsupportedType(arena::Handle<Type>)`
- `UnsupportedExecutionModel(spirv::Word)`
- `UnsupportedExecutionMode(spirv::Word)`
- `UnsupportedStorageClass(spirv::Word)`
- `UnsupportedImageDim(spirv::Word)`
- `UnsupportedImageFormat(spirv::Word)`
- `UnsupportedBuiltIn(spirv::Word)`
- `UnsupportedControlFlow(spirv::Word)`
- `UnsupportedBinaryOperator(spirv::Word)`
- `UnsupportedRuntimeArrayStorageClass`
- `UnsupportedMatrixStride { stride: u32, columns: u8, rows: u8, width: u8 }`
- `UnknownBinaryOperator(spirv::Op)`
- `UnknownRelationalFunction(spirv::Op)`
- `UnsupportedGroupOperation(spirv::Word)`
- `InvalidParameter(spirv::Op)`
- `InvalidOperandCount(spirv::Op, u16)`
- `InvalidOperand`
- `InvalidId(spirv::Word)`
- `InvalidDecoration(spirv::Word)`
- `InvalidTypeWidth(spirv::Word)`
- `InvalidSign(spirv::Word)`
- `InvalidInnerType(spirv::Word)`
- `InvalidVectorSize(spirv::Word)`
- `InvalidAccessType(spirv::Word)`
- `InvalidAccess(Expression)`
- `InvalidAccessIndex(spirv::Word)`
- `InvalidIndexType(spirv::Word)`
- `InvalidBinding(spirv::Word)`
- `InvalidGlobalVar(Expression)`
- `InvalidImageExpression(Expression)`
- `InvalidImageDepthStorage`
- `InvalidStorageImageWithoutFormat`
- `InvalidImageBaseType(arena::Handle<Type>)`
- `InvalidImage(arena::Handle<Type>)`
- `InvalidAsType(arena::Handle<Type>)`
- `InvalidVectorType(arena::Handle<Type>)`
- `InconsistentComparisonSampling(arena::Handle<GlobalVariable>)`
- `WrongFunctionResultType(spirv::Word)`
- `WrongFunctionArgumentType(spirv::Word)`
- `MissingDecoration(spirv::Decoration)`
- `BadString`
- `IncompleteData`
- `InvalidTerminator`
- `InvalidEdgeClassification`
- `ControlFlowGraphCycle(u32)`
- `FunctionCallCycle(spirv::Word)`
- `InvalidArraySize(spirv::Word)`
- `InvalidBarrierScope(spirv::Word)`
- `InvalidBarrierMemorySemantics(spirv::Word)`
- `NonBindingArrayOfImageOrSamplers`
- `SpecIdTooHigh(u32)`
- `AtomicUpgradeError(atomic_upgrade::Error)`

Methods and constants:

- `fn emit_to_string(&self, source: &str) -> String`
- `fn emit_to_string_with_path(&self, source: &str, path: &str) -> String`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<Error>`

### front::spv::Frontend`<I>` — struct

Opaque (private fields).

Methods and constants:

- `fn new(data: I, options: &Options) -> Self`
- `fn parse(self) -> Result<Module, Error>`

### front::spv::Instruction — struct

Opaque (private fields).

Implements: `Clone`, `Copy`, `Debug`

### front::spv::ModuleState — enum

Variants (13):

- `Empty`
- `Capability`
- `Extension`
- `ExtInstImport`
- `MemoryModel`
- `EntryPoint`
- `ExecutionMode`
- `Source`
- `Name`
- `ModuleProcessed`
- `Annotation`
- `Type`
- `Function`

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### front::spv::Options — struct

Fields:

- `adjust_coordinate_space: bool` — The IR coordinate space matches all the APIs except SPIR-V, so by default we flip the Y coordinate of the `BuiltIn::Position`. This flag can be used to avoid this.
- `strict_capabilities: bool` — Only allow shaders with the known set of capabilities.
- `block_ctx_dump_prefix: Option<alloc::string::String>`

Implements: `Clone`, `Debug`, `Default`

### front::spv::parse_u8_slice — function

`fn naga::front::spv::parse_u8_slice(data: &[u8], options: &Options) -> Result<Module, Error>`

### front::spv::SUPPORTED_CAPABILITIES — constant

`const front::spv::SUPPORTED_CAPABILITIES: &[spirv::Capability] = _`

### front::spv::SUPPORTED_EXTENSIONS — constant

`const front::spv::SUPPORTED_EXTENSIONS: &[&str] = _`

### front::SymbolTable`<Name, Var>` — struct

Structure responsible for managing variable lookups and keeping track of lexical scopes

Opaque (private fields).

Methods and constants:

- `fn push_scope(&mut self)` — Adds a new lexical scope.
- `fn pop_scope(&mut self)` — Removes the current lexical scope and all its variables
- `fn reduce_lookup_scope(&mut self)` — Reduces the lookup scope by one level.
- `fn reset_lookup_scope(&mut self)` — Resets the lookup scope to the current scope.
- `fn lookup<Q>(&self, name: &Q) -> Option<&Var> where Name: core::borrow::Borrow<Q>, Q: core::hash::Hash + Eq + ?Sized` — Perform a lookup for a variable named `name`.
- `fn add(&mut self, name: Name, var: Var) -> Option<Var>` — Adds a new variable to the current scope.
- `fn add_root(&mut self, name: Name, var: Var) -> Option<Var>` — Adds a new variable to the root scope.

Implements: `Debug`, `Default`

### front::Typifier — struct

A table of types for an `Arena<Expression>`.

Opaque (private fields).

Methods and constants:

- `const fn new() -> Self`
- `fn reset(&mut self)`
- `fn get<'a>(self: &'a Self, expr_handle: Handle<Expression>, types: &'a UniqueArena<Type>) -> &'a TypeInner`
- `fn register_type(&self, expr_handle: Handle<Expression>, types: &mut UniqueArena<Type>) -> Handle<Type>` — Add an expression's type to an `Arena<Type>`.
- `fn grow(&mut self, expr_handle: Handle<Expression>, expressions: &Arena<Expression>, ctx: &ResolveContext<'_>) -> Result<(), ResolveError>` — Grow this typifier until it contains a type for `expr_handle`.
- `fn invalidate(&mut self, expr_handle: Handle<Expression>, expressions: &Arena<Expression>, ctx: &ResolveContext<'_>) -> Result<(), ResolveError>` — Recompute the type resolution for `expr_handle`.

Implements: `Debug`, `Default`, `Index<Handle<Expression>>`

### front::wgsl::EnableExtension — enum

An enable-extension not guaranteed to be present in all environments.

Variants (2):

- `Implemented(ImplementedEnableExtension)`
- `Unimplemented(UnimplementedEnableExtension)`

Methods and constants:

- `const fn to_ident(self) -> &'static str` — Maps this [`EnableExtension`] into the sentinel word associated with it in WGSL.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<ImplementedEnableExtension>`, `Hash`, `PartialEq`, `StructuralPartialEq`

### front::wgsl::Frontend — struct

Opaque (private fields).

Methods and constants:

- `const fn new() -> Self`
- `const fn new_with_options(options: Options) -> Self`
- `const fn set_options(&mut self, options: Options)`
- `fn parse(&mut self, source: &str) -> core::result::Result<Module, ParseError>`

Implements: `Debug`

### front::wgsl::ImplementedEnableExtension — enum

A variant of [`EnableExtension::Implemented`].

Variants (13):

- `F16` — Enables `f16`/`half` primitive support in all shader languages.
- `DualSourceBlending` — Enables the `blend_src` attribute in WGSL.
- `ClipDistances` — Enables the `clip_distances` variable in WGSL.
- `WgpuMeshShader` — Enables the `wgpu_mesh_shader` extension, native only
- `WgpuRayQuery` — Enables the `wgpu_ray_query` extension, native only.
- `WgpuRayQueryVertexReturn` — Enables the `wgpu_ray_query_vertex_return` extension, native only.
- `WgpuRayTracingPipeline` — Enables the `wgpu_ray_tracing_pipeline` extension, native only.
- `WgpuCooperativeMatrix` — Enables the `wgpu_cooperative_matrix` extension, native only.
- `DrawIndex` — Enables the `draw_index` builtin. Not currently part of the WGSL spec but probably will be at some point.
- `PrimitiveIndex` — Enables the `@builtin(primitive_index)` attribute in WGSL.
- `WgpuPerVertex` — Enables the `wgpu_per_vertex` extension, allows using `@interpolate(per_vertex)` attribute in WGSL, native only.
- `WgpuBindingArray` — Enables the `wgpu_binding_array` extension, native only.
- `WgpuInt16` — Enables `i16`/`u16` 16-bit integer support in WGSL, native only.

Methods and constants:

- `const VARIANTS: &'static [Self]` — A slice of all variants of [`ImplementedEnableExtension`].
- `const fn all() -> &'static [Self]` — Returns slice of all variants of [`ImplementedEnableExtension`].
- `const fn capability(self) -> valid::Capabilities` — Returns the capability required for this enable extension.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<ImplementedEnableExtension>`, `Hash`, `PartialEq`, `StructuralPartialEq`

### front::wgsl::ImplementedLanguageExtension — enum

A variant of [`LanguageExtension::Implemented`].

Variants (3):

- `ReadOnlyAndReadWriteStorageTextures`
- `Packed4x8IntegerDotProduct`
- `PointerCompositeAccess`

Methods and constants:

- `const VARIANTS: &'static [Self]` — A slice of all variants of [`ImplementedLanguageExtension`].
- `const fn all() -> &'static [Self]` — Returns slice of all variants of [`ImplementedLanguageExtension`].
- `const fn to_ident(self) -> &'static str` — Maps this [`ImplementedLanguageExtension`] into the sentinel word associated with it in WGSL.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### front::wgsl::LanguageExtension — enum

A language extension recognized by Naga, but not guaranteed to be present in all environments.

Variants (2):

- `Implemented(ImplementedLanguageExtension)`
- `Unimplemented(UnimplementedLanguageExtension)`

Methods and constants:

- `fn from_ident(s: &str) -> Option<Self>` — Convert from a sentinel word in WGSL into its associated [`LanguageExtension`], if possible.
- `const fn to_ident(self) -> &'static str` — Maps this [`LanguageExtension`] into the sentinel word associated with it in WGSL.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### front::wgsl::Options — struct

Configuration for the whole parser run.

Fields:

- `parse_doc_comments: bool` — Controls whether the parser should parse doc comments.
- `capabilities: valid::Capabilities` — Capabilities to enable during parsing.

Methods and constants:

- `const fn new() -> Self` — Creates a new default [`Options`].

Implements: `Debug`

### front::wgsl::parse_str — function

`fn naga::front::wgsl::parse_str(source: &str) -> core::result::Result<Module, ParseError>`

<div class="warning">

### front::wgsl::ParseError — struct

Opaque (private fields).

Methods and constants:

- `fn labels(&self) -> impl ExactSizeIterator<Item = (Span, &str)> + '_`
- `fn message(&self) -> &str`
- `fn notes(&self) -> impl ExactSizeIterator<Item = &str> + '_`
- `fn emit_to_string(&self, source: &str) -> String` — Emits a summary of the error to a string.
- `fn emit_to_string_with_path(&self, source: &str, path: &str) -> String` — Emits a summary of the error to a string.
- `fn location(&self, source: &str) -> Option<SourceLocation>` — Returns a [`SourceLocation`] for the first label in the error message.

Implements: `Clone`, `Debug`, `Display`, `Error`

### front::wgsl::UnimplementedEnableExtension — enum

A variant of [`EnableExtension::Unimplemented`].

Variants (1):

- `Subgroups` — Enables subgroup built-ins in all languages.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### front::wgsl::UnimplementedLanguageExtension — enum

A variant of [`LanguageExtension::Unimplemented`].

Variants (1):

- `UnrestrictedPointerParameters`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Function — struct

A function defined in the module.

Fields:

- `name: Option<alloc::string::String>` — Name of the function, if any.
- `arguments: alloc::vec::Vec<FunctionArgument>` — Information about function argument.
- `result: Option<FunctionResult>` — The result of this function, if any.
- `local_variables: arena::Arena<LocalVariable>` — Local variables defined and used in the function.
- `expressions: arena::Arena<Expression>` — Expressions used inside this function.
- `named_expressions: FastIndexMap<Handle<Expression>, alloc::string::String>` — Map of expressions that have associated variable names
- `body: Block` — Block of instructions comprising the body of the function.
- `diagnostic_filter_leaf: Option<arena::Handle<diagnostic_filter::DiagnosticFilterNode>>` — The leaf of all diagnostic filter rules tree (stored in [`Module::diagnostic_filters`]) parsed on this function.

Methods and constants:

- `fn originating_global(&self, pointer: Handle<Expression>) -> Option<Handle<GlobalVariable>>` — Return the global variable being accessed by the expression `pointer`.

Implements: `Clone`, `Debug`, `Default`

### FunctionArgument — struct

A function argument.

Fields:

- `name: Option<alloc::string::String>` — Name of the argument, if any.
- `ty: arena::Handle<Type>` — Type of the argument.
- `binding: Option<Binding>` — For entry points, an argument has to have a binding unless it's a structure.

Implements: `Clone`, `Debug`

### FunctionResult — struct

A function result.

Fields:

- `ty: arena::Handle<Type>` — Type of the result.
- `binding: Option<Binding>` — For entry points, the result has to have a binding unless it's a structure.

Implements: `Clone`, `Debug`

### GatherMode — enum

The specific behavior of a [`SubgroupGather`] statement.

Variants (8):

- `BroadcastFirst` — All gather from the active lane with the smallest index
- `Broadcast(arena::Handle<Expression>)` — All gather from the same lane at the index given by the expression
- `Shuffle(arena::Handle<Expression>)` — Each gathers from a different lane at the index given by the expression
- `ShuffleDown(arena::Handle<Expression>)` — Each gathers from their lane plus the shift given by the expression
- `ShuffleUp(arena::Handle<Expression>)` — Each gathers from their lane minus the shift given by the expression
- `ShuffleXor(arena::Handle<Expression>)` — Each gathers from their lane xored with the given by the expression
- `QuadBroadcast(arena::Handle<Expression>)` — All gather from the same quad lane at the index given by the expression
- `QuadSwap(Direction)` — Each gathers from the opposite quad lane along the given direction

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### GlobalVariable — struct

Variable defined at module level.

Fields:

- `name: Option<alloc::string::String>` — Name of the variable, if any.
- `space: AddressSpace` — How this variable is to be stored.
- `binding: Option<ResourceBinding>` — For resources, defines the binding point.
- `ty: arena::Handle<Type>` — The type of this variable.
- `init: Option<arena::Handle<Expression>>` — Initial value for this variable.
- `memory_decorations: MemoryDecorations` — Memory decorations for this variable.

Implements: `Clone`, `Debug`, `PartialEq`, `StructuralPartialEq`

### Handle`<T>` — struct

A strongly typed reference to an arena item.

Opaque (private fields).

Methods and constants:

- `const fn index(self) -> usize` — Returns the index of this handle.
- `fn write_prefixed(&self, formatter: &mut fmt::Formatter<'_>, prefix: &'static str) -> fmt::Result` — Write this handle's index to `formatter`, preceded by `prefix`.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `ForDebugWithTypes`, `Hash`, `Index<Handle<Expression>>`, `Index<Handle<Function>>`, `Index<Handle<GlobalVariable>>`, `Index<Handle<T>>`, `Index<Handle<Type>>`, `IndexMut<Handle<T>>`, `Ord`, `PartialEq`, `PartialOrd`

### ImageClass — enum

Sub-class of the image type.

Variants (4):

- `Sampled { kind: ScalarKind, multi: bool }` — Regular sampled image.
- `Depth { multi: bool }` — Depth comparison image.
- `External` — External texture.
- `Storage { format: StorageFormat, access: StorageAccess }` — Storage image.

Methods and constants:

- `const fn is_multisampled(self) -> bool`
- `const fn is_mipmapped(self) -> bool`
- `const fn is_depth(self) -> bool`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### ImageDimension — enum

The number of dimensions an image has.

Variants (4):

- `D1` — 1D image
- `D2` — 2D image
- `D3` — 3D image
- `Cube` — Cube map

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<ImageDimension>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `ToWgsl`

### ImageQuery — enum

Type of an image query.

Variants (4):

- `Size { level: Option<arena::Handle<Expression>> }` — Get the size at the specified level.
- `NumLevels` — Get the number of mipmap levels, a `u32`.
- `NumLayers` — Get the number of array layers, a `u32`.
- `NumSamples` — Get the number of samples, a `u32`.

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `StructuralPartialEq`

### Interpolation — enum

The interpolation qualifier of a binding or struct field.

Variants (4):

- `Perspective` — The value will be interpolated in a perspective-correct fashion. Also known as "smooth" in glsl.
- `Linear` — Indicates that linear, non-perspective, correct interpolation must be used. Also known as "no_perspective" in glsl.
- `Flat` — Indicates that no interpolation will be performed.
- `PerVertex` — Indicates the fragment input binding holds an array of per-vertex values. This is typically used with barycentrics.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `ToWgsl`

### keywords::wgsl::BUILTIN_IDENTIFIER_SET — static

### keywords::wgsl::BUILTIN_IDENTIFIERS — constant

`const keywords::wgsl::BUILTIN_IDENTIFIERS: &[&str] = _`

Shadowable words that the WGSL backend should avoid using for declarations.

### keywords::wgsl::RESERVED — constant

`const keywords::wgsl::RESERVED: &[&str] = _`

### keywords::wgsl::RESERVED_SET — static

The above set of reserved keywords, turned into a cached HashSet. This saves significant time during [`Namer::reset`](crate::proc::Namer::reset).

### Literal — enum

Variants (12):

- `F64(f64)` — May not be NaN or infinity.
- `F32(f32)` — May not be NaN or infinity.
- `F16(half::f16)` — May not be NaN or infinity.
- `U16(u16)`
- `I16(i16)`
- `U32(u32)`
- `I32(i32)`
- `U64(u64)`
- `I64(i64)`
- `Bool(bool)`
- `AbstractInt(i64)`
- `AbstractFloat(f64)`

Methods and constants:

- `const fn new(value: u8, scalar: Scalar) -> Option<Self>`
- `const fn zero(scalar: Scalar) -> Option<Self>`
- `const fn one(scalar: Scalar) -> Option<Self>`
- `const fn minus_one(scalar: Scalar) -> Option<Self>`
- `const fn width(&self) -> Bytes`
- `const fn scalar(&self) -> Scalar`
- `const fn scalar_kind(&self) -> ScalarKind`
- `const fn ty_inner(&self) -> TypeInner`

Implements: `Clone`, `Copy`, `Debug`, `From<Literal>`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `TryFrom<Literal>`

### LocalVariable — struct

Variable defined at function level.

Fields:

- `name: Option<alloc::string::String>` — Name of the variable, if any.
- `ty: arena::Handle<Type>` — The type of this variable.
- `init: Option<arena::Handle<Expression>>` — Initial value for this variable.

Implements: `Clone`, `Debug`

### MathFunction — enum

Built-in shader function for math.

Variants (79):

- `Abs`
- `Min`
- `Max`
- `Clamp`
- `Saturate`
- `Cos`
- `Cosh`
- `Sin`
- `Sinh`
- `Tan`
- `Tanh`
- `Acos`
- `Asin`
- `Atan`
- `Atan2`
- `Asinh`
- `Acosh`
- `Atanh`
- `Radians`
- `Degrees`
- `Ceil`
- `Floor`
- `Round`
- `Fract`
- `Trunc`
- `Modf`
- `Frexp`
- `Ldexp`
- `Exp`
- `Exp2`
- `Log`
- `Log2`
- `Pow`
- `Dot`
- `Dot4I8Packed`
- `Dot4U8Packed`
- `Outer`
- `Cross`
- `Distance`
- `Length`
- `Normalize`
- `FaceForward`
- `Reflect`
- `Refract`
- `Sign`
- `Fma`
- `Mix`
- `Step`
- `SmoothStep`
- `Sqrt`
- `InverseSqrt`
- `Inverse`
- `Transpose`
- `Determinant`
- `QuantizeToF16`
- `CountTrailingZeros`
- `CountLeadingZeros`
- `CountOneBits`
- `ReverseBits`
- `ExtractBits`
- `InsertBits`
- `FirstTrailingBit`
- `FirstLeadingBit`
- `Pack4x8snorm`
- `Pack4x8unorm`
- `Pack2x16snorm`
- `Pack2x16unorm`
- `Pack2x16float`
- `Pack4xI8`
- `Pack4xU8`
- `Pack4xI8Clamp`
- `Pack4xU8Clamp`
- `Unpack4x8snorm`
- `Unpack4x8unorm`
- `Unpack2x16snorm`
- `Unpack2x16unorm`
- `Unpack2x16float`
- `Unpack4xI8`
- `Unpack4xU8`

Methods and constants:

- `fn overloads(self) -> impl OverloadSet`
- `const fn argument_count(&self) -> usize`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `TryToWgsl`

### MemoryDecorations — struct

Memory decorations for global variables.

Opaque (private fields).

Methods and constants:

- `const COHERENT: Self` — Reads and writes are automatically visible to other invocations without explicit barriers.
- `const VOLATILE: Self` — The variable may be modified by something external to the shader, preventing certain compiler optimizations.
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
- `const fn iter(&self) -> $crate::iter::Iter<MemoryDecorations>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<MemoryDecorations>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<MemoryDecorations>`, `Flags`, `FromIterator<MemoryDecorations>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### MeshOutputTopology — enum

The output topology for a mesh shader. Note that mesh shaders don't allow things like triangle-strips.

Variants (3):

- `Points` — Outputs individual vertices to be rendered as points.
- `Lines` — Outputs groups of 2 vertices to be renderedas lines .
- `Triangles` — Outputs groups of 3 vertices to be rendered as triangles.

Methods and constants:

- `const fn to_builtin(self) -> BuiltIn`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### MeshStageInfo — struct

Information specific to mesh shader entry points.

Fields:

- `topology: MeshOutputTopology` — The type of primitive outputted.
- `max_vertices: u32` — The maximum number of vertices a mesh shader may output.
- `max_vertices_override: Option<arena::Handle<Expression>>` — If pipeline constants are used, the expressions that override `max_vertices`
- `max_primitives: u32` — The maximum number of primitives a mesh shader may output.
- `max_primitives_override: Option<arena::Handle<Expression>>` — If pipeline constants are used, the expressions that override `max_primitives`
- `vertex_output_type: arena::Handle<Type>` — The type used by vertex outputs, i.e. what is passed to `setVertex`.
- `primitive_output_type: arena::Handle<Type>` — The type used by primitive outputs, i.e. what is passed to `setPrimitive`.
- `output_variable: arena::Handle<GlobalVariable>` — The global variable holding the outputted vertices, primitives, and counts

Implements: `Clone`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### Module — struct

Shader module.

Fields:

- `types: arena::UniqueArena<Type>` — Arena for the types defined in this module.
- `special_types: SpecialTypes` — Dictionary of special type handles.
- `constants: arena::Arena<Constant>` — Arena for the constants defined in this module.
- `overrides: arena::Arena<Override>` — Arena for the pipeline-overridable constants defined in this module.
- `global_variables: arena::Arena<GlobalVariable>` — Arena for the global variables defined in this module.
- `global_expressions: arena::Arena<Expression>` — [Constant expressions] and [override expressions] used by this module.
- `functions: arena::Arena<Function>` — Arena for the functions defined in this module.
- `entry_points: alloc::vec::Vec<EntryPoint>` — Entry points.
- `diagnostic_filters: arena::Arena<diagnostic_filter::DiagnosticFilterNode>` — Arena for all diagnostic filter rules parsed in this module, including those in functions and statements.
- `diagnostic_filter_leaf: Option<arena::Handle<diagnostic_filter::DiagnosticFilterNode>>` — The leaf of all diagnostic filter rules tree parsed from directives in this module.
- `doc_comments: Option<alloc::boxed::Box<DocComments>>` — Doc comments.

Methods and constants:

- `fn generate_ray_desc_type(&mut self) -> Handle<Type>` — Populate this module's [`SpecialTypes::ray_desc`] type.
- `fn generate_vertex_return_type(&mut self) -> Handle<Type>` — Make sure the types for the vertex return are in the module's type
- `fn generate_ray_intersection_type(&mut self) -> Handle<Type>` — Populate this module's [`SpecialTypes::ray_intersection`] type.
- `fn generate_external_texture_types(&mut self)` — Generate [`SpecialTypes::external_texture_params`] and [`SpecialTypes::external_texture_transfer_function`].
- `fn generate_predeclared_type(&mut self, special_type: PredeclaredType) -> Handle<Type>` — Populate this module's [`SpecialTypes::predeclared_types`] type and return the handle.
- `fn get_or_insert_default_doc_comments(&mut self) -> &mut Box<DocComments>`
- `const fn to_ctx(&self) -> GlobalCtx<'_>`
- `fn compare_types(&self, lhs: &TypeResolution, rhs: &TypeResolution) -> bool`
- `fn analyze_mesh_shader_info(&self, gv: Handle<GlobalVariable>) -> (MeshStageInfo, [Option<Handle<Override>>; 2], Option<WithSpan<valid::EntryPointError>>)` — Extracts mesh shader info from a mesh output global variable. Used in frontends and by validators. This only validates the output variable itself, and not the vertex and primitive output types.
- `fn uses_mesh_shaders(&self) -> bool`
- `fn uses_ray_tracing(&self, ep_index: Option<usize>) -> RayTracingUses`

Implements: `Clone`, `Debug`, `Default`

### Override — struct

Pipeline-overridable constant.

Fields:

- `name: Option<alloc::string::String>`
- `id: Option<u16>` — Pipeline Constant ID.
- `ty: arena::Handle<Type>`
- `init: Option<arena::Handle<Expression>>` — The default value of the pipeline-overridable constant.

Implements: `Clone`, `Debug`, `PartialEq`, `StructuralPartialEq`

### PredeclaredType — enum

Return types predeclared for the frexp, modf, and atomicCompareExchangeWeak built-in functions.

Variants (3):

- `AtomicCompareExchangeWeakResult(Scalar)`
- `ModfResult { size: Option<VectorSize>, scalar: Scalar }`
- `FrexpResult { size: Option<VectorSize>, scalar: Scalar }`

Methods and constants:

- `fn struct_name(&self) -> String`

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Range`<T>` — struct

A strongly typed range of handles.

Opaque (private fields).

Methods and constants:

- `fn new_from_bounds(first: Handle<T>, last: Handle<T>) -> Self` — Return a range enclosing handles `first` through `last`, inclusive.
- `const fn first_and_last(&self) -> Option<(Handle<T>, Handle<T>)>` — return the first and last handles included in `self`.
- `fn index_range(&self) -> ops::Range<u32>` — Return the index range covered by `self`.
- `fn from_index_range(inner: ops::Range<u32>, arena: &Arena<T>) -> Self` — Construct a `Range` that covers the indices in `inner`.

Implements: `Clone`, `Debug`, `Index<Range<T>>`, `Iterator`

### RayFlag — struct

Ray flags used when casting rays. Matching vulkan constants can be found in https://github.com/KhronosGroup/SPIRV-Registry/blob/main/extensions/KHR/ray_common/ray_flags_section.txt

Opaque (private fields).

Methods and constants:

- `const FORCE_OPAQUE: Self` — Force all intersections to be treated as opaque.
- `const FORCE_NO_OPAQUE: Self` — Force all intersections to be treated as non-opaque.
- `const TERMINATE_ON_FIRST_HIT: Self` — Stop traversal after the first hit.
- `const SKIP_CLOSEST_HIT_SHADER: Self` — Don't execute the closest hit shader.
- `const CULL_BACK_FACING: Self` — Cull back facing geometry.
- `const CULL_FRONT_FACING: Self` — Cull front facing geometry.
- `const CULL_OPAQUE: Self` — Cull opaque geometry.
- `const CULL_NO_OPAQUE: Self` — Cull non-opaque geometry.
- `const SKIP_TRIANGLES: Self` — Skip triangular geometry.
- `const SKIP_AABBS: Self` — Skip axis-aligned bounding boxes.
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
- `const fn iter(&self) -> $crate::iter::Iter<RayFlag>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<RayFlag>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<RayFlag>`, `Flags`, `FromIterator<RayFlag>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### RayPipelineFunction — enum

Ray tracing pipeline intrinsics

Variants (1):

- `TraceRay { acceleration_structure: arena::Handle<Expression>, descriptor: arena::Handle<Expression>, payload: arena::Handle<Expression> }` — Traces a ray through the given acceleration structure

Implements: `Clone`, `Copy`, `Debug`

### RayQueryFunction — enum

An operation that a [`RayQuery` statement] applies to its [`query`] operand.

Variants (5):

- `Initialize { acceleration_structure: arena::Handle<Expression>, descriptor: arena::Handle<Expression> }` — Initialize the `RayQuery` object.
- `Proceed { result: arena::Handle<Expression> }` — Start or continue the query given by the statement's [`query`] operand.
- `GenerateIntersection { hit_t: arena::Handle<Expression> }` — Add a candidate generated intersection to be included in the determination of the closest hit for a ray query.
- `ConfirmIntersection` — Confirm a triangle intersection to be included in the determination of the closest hit for a ray query.
- `Terminate`

Implements: `Clone`, `Debug`

### RayQueryIntersection — enum

Type of a ray query intersection. Matching vulkan constants can be found in <https://github.com/KhronosGroup/SPIRV-Registry/blob/main/extensions/KHR/SPV_KHR_ray_query.asciidoc> but the actual values are different for candidate intersections.

Variants (4):

- `None = 0` — No intersection found. Matches `RayQueryCommittedIntersectionNoneKHR`.
- `Triangle = 1` — Intersecting with triangles. Matches `RayQueryCommittedIntersectionTriangleKHR` and `RayQueryCandidateIntersectionTriangleKHR`.
- `Generated = 2` — Intersecting with generated primitives. Matches `RayQueryCommittedIntersectionGeneratedKHR`.
- `Aabb = 3` — Intersecting with Axis Aligned Bounding Boxes. Matches `RayQueryCandidateIntersectionAABBKHR`.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### RelationalFunction — enum

Built-in shader function for testing relation between values.

Variants (4):

- `All`
- `Any`
- `IsNan`
- `IsInf`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### SampleLevel — enum

Sampling modifier to control the level of detail.

Variants (5):

- `Auto`
- `Zero`
- `Exact(arena::Handle<Expression>)`
- `Bias(arena::Handle<Expression>)`
- `Gradient { x: arena::Handle<Expression>, y: arena::Handle<Expression> }`

Methods and constants:

- `const fn implicit_derivatives(&self) -> bool`

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `StructuralPartialEq`

### Sampling — enum

The sampling qualifiers of a binding or struct field.

Variants (5):

- `Center` — Interpolate the value at the center of the pixel.
- `Centroid` — Interpolate the value at a point that lies within all samples covered by the fragment within the current primitive. In multisampling, use a single value for all samples in the primitive.
- `Sample` — Interpolate the value at each sample location. In multisampling, invoke the fragment shader once per sample.
- `First` — Use the value provided by the first vertex of the current primitive.
- `Either` — Use the value provided by the first or last vertex of the current primitive. The exact choice is implementation-dependent.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `ToWgsl`

### Scalar — struct

Characteristics of a scalar type.

Fields:

- `kind: ScalarKind` — How the value's bits are to be interpreted.
- `width: Bytes` — This size of the value in bytes.

Methods and constants:

- `const fn automatic_conversion_combine(self, other: Self) -> Option<Scalar>` — Find the common type of `self` and `other` under WGSL's automatic conversions.
- `fn automatically_converts_to(self, goal: Self) -> bool` — Return `true` if automatic conversions will covert `self` to `goal`.
- `const I16: Self`
- `const U16: Self`
- `const I32: Self`
- `const U32: Self`
- `const F16: Self`
- `const F32: Self`
- `const F64: Self`
- `const I64: Self`
- `const U64: Self`
- `const BOOL: Self`
- `const ABSTRACT_INT: Self`
- `const ABSTRACT_FLOAT: Self`
- `const fn is_abstract(self) -> bool`
- `const fn float(width: Bytes) -> Self` — Construct a float `Scalar` with the given width.
- `const fn to_inner_scalar(self) -> TypeInner`
- `const fn to_inner_vector(self, size: VectorSize) -> TypeInner`
- `const fn to_inner_atomic(self) -> TypeInner`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `ForDebug`, `From<StorageFormat>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `TryFrom<Scalar>`, `TryToWgsl`

### ScalarKind — enum

Primitive type for a scalar.

Variants (6):

- `Sint` — Signed integer type.
- `Uint` — Unsigned integer type.
- `Float` — Floating point type.
- `Bool` — Boolean type.
- `AbstractInt` — WGSL abstract integer type.
- `AbstractFloat` — Abstract floating-point type.

Methods and constants:

- `const fn is_numeric(self) -> bool`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `TryFrom<ScalarKind>`

### SourceLocation — struct

A human-readable representation for a span, tailored for text source.

Fields:

- `line_number: u32` — 1-based line number.
- `line_position: u32` — 1-based column in code units (in bytes) of the start of the span.
- `offset: u32` — 0-based Offset in code units (in bytes) of the start of the span.
- `length: u32` — Length in code units (in bytes) of the span.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### Span — struct

A source code span, used for error reporting.

Opaque (private fields).

Methods and constants:

- `const UNDEFINED: Self`
- `const fn new(start: u32, end: u32) -> Self` — Creates a new `Span` from a range of byte indices
- `const fn until(&self, other: &Self) -> Self` — Returns a new `Span` starting at `self` and ending at `other`
- `fn subsume(&mut self, other: Self)` — Modifies `self` to contain the smallest `Span` possible that contains both `self` and `other`
- `fn total_span<T: Iterator<Item = Self>>(from: T) -> Self` — Returns the smallest `Span` possible that contains all the `Span`s defined in the `from` iterator
- `fn to_range(self) -> Option<Range<usize>>` — Converts `self` to a range if the span is not unknown
- `fn is_defined(&self) -> bool` — Check whether `self` was defined or is a default/unknown span
- `fn location(&self, source: &str) -> SourceLocation` — Return a [`SourceLocation`] for this span in the provided source.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `From<Location>`, `From<Range<usize>>`, `Index<Span>`, `PartialEq`, `StructuralPartialEq`

### SpanContext — type alias

`type SpanContext = (Span, alloc::string::String)`

A source code span together with "context", a user-readable description of what part of the error it refers to.

### SpecialTypes — struct

Set of special types that can be optionally generated by the frontends.

Fields:

- `ray_desc: Option<arena::Handle<Type>>` — Type for `RayDesc`.
- `ray_intersection: Option<arena::Handle<Type>>` — Type for `RayIntersection`.
- `ray_vertex_return: Option<arena::Handle<Type>>` — Type for `RayVertexReturn`.
- `external_texture_params: Option<arena::Handle<Type>>` — Struct containing parameters required by some backends to emit code for [`ImageClass::External`] textures.
- `external_texture_transfer_function: Option<arena::Handle<Type>>` — Struct describing a gamma encoding transfer function. Member of `NagaExternalTextureParams`, describing how the backend should perform color space conversion when sampling from [`…
- `predeclared_types: FastIndexMap<PredeclaredType, arena::Handle<Type>>` — Types for predeclared wgsl types instantiated on demand.

Implements: `Clone`, `Debug`, `Default`

### Statement — enum

Instructions which make up an executable block.

Variants (23):

- `Emit(arena::Range<Expression>)` — Emit a range of expressions, visible to all statements that follow in this block.
- `Block(Block)` — A block containing more statements, to be executed sequentially.
- `If { condition: arena::Handle<Expression>, accept: Block, reject: Block }` — Conditionally executes one of two blocks, based on the value of the condition.
- `Switch { selector: arena::Handle<Expression>, cases: alloc::vec::Vec<SwitchCase> }` — Conditionally executes one of multiple blocks, based on the value of the selector.
- `Loop { body: Block, continuing: Block, break_if: Option<arena::Handle<Expression>> }` — Executes a block repeatedly.
- `Break` — Exits the innermost enclosing [`Loop`] or [`Switch`].
- `Continue` — Skips to the `continuing` block of the innermost enclosing [`Loop`].
- `Return { value: Option<arena::Handle<Expression>> }` — Returns from the function (possibly with a value).
- `Kill` — Aborts the current shader execution.
- `ControlBarrier(Barrier)` — Synchronize invocations within the work group. The `Barrier` flags control which memory accesses should be synchronized. If empty, this becomes purely an execution barrier.
- `MemoryBarrier(Barrier)` — Synchronize invocations within the work group. The `Barrier` flags control which memory accesses should be synchronized.
- `Store { pointer: arena::Handle<Expression>, value: arena::Handle<Expression> }` — Stores a value at an address.
- `ImageStore { image: arena::Handle<Expression>, coordinate: arena::Handle<Expression>, array_index: Option<arena::Handle<Expression>>, value: arena::Handle<Expression> }` — Stores a texel value to an image.
- `Atomic { pointer: arena::Handle<Expression>, fun: AtomicFunction, value: arena::Handle<Expression>, result: Option<arena::Handle<Expression>> }` — Atomic function.
- `ImageAtomic { image: arena::Handle<Expression>, coordinate: arena::Handle<Expression>, array_index: Option<arena::Handle<Expression>>, fun: AtomicFunction, value: arena::Handle<Expression> }` — Performs an atomic operation on a texel value of an image.
- `WorkGroupUniformLoad { pointer: arena::Handle<Expression>, result: arena::Handle<Expression> }` — Load uniformly from a uniform pointer in the workgroup address space.
- `Call { function: arena::Handle<Function>, arguments: alloc::vec::Vec<arena::Handle<Expression>>, result: Option<arena::Handle<Expression>> }` — Calls a function.
- `RayQuery { query: arena::Handle<Expression>, fun: RayQueryFunction }`
- `RayPipelineFunction(RayPipelineFunction)` — A ray tracing pipeline shader intrinsic.
- `SubgroupBallot { result: arena::Handle<Expression>, predicate: Option<arena::Handle<Expression>> }` — Calculate a bitmask using a boolean from each active thread in the subgroup
- `SubgroupGather { mode: GatherMode, argument: arena::Handle<Expression>, result: arena::Handle<Expression> }` — Gather a value from another active thread in the subgroup
- `SubgroupCollectiveOperation { op: SubgroupOperation, collective_op: CollectiveOperation, argument: arena::Handle<Expression>, result: arena::Handle<Expression> }` — Compute a collective operation across all active threads in the subgroup
- `CooperativeStore { target: arena::Handle<Expression>, data: CooperativeData }` — Store a cooperative primitive into memory.

Methods and constants:

- `const fn is_terminator(&self) -> bool` — Returns true if the statement directly terminates the current block.

Implements: `Clone`, `Debug`

### StorageAccess — struct

Flags describing an image.

Opaque (private fields).

Methods and constants:

- `const LOAD: Self` — Storage can be used as a source for load ops.
- `const STORE: Self` — Storage can be used as a target for store ops.
- `const ATOMIC: Self` — Storage can be used as a target for atomic ops.
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
- `const fn iter(&self) -> $crate::iter::Iter<StorageAccess>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<StorageAccess>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<StorageAccess>`, `Flags`, `FromIterator<StorageAccess>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### StorageFormat — enum

Image storage format.

Variants (41):

- `R8Unorm`
- `R8Snorm`
- `R8Uint`
- `R8Sint`
- `R16Uint`
- `R16Sint`
- `R16Float`
- `Rg8Unorm`
- `Rg8Snorm`
- `Rg8Uint`
- `Rg8Sint`
- `R32Uint`
- `R32Sint`
- `R32Float`
- `Rg16Uint`
- `Rg16Sint`
- `Rg16Float`
- `Rgba8Unorm`
- `Rgba8Snorm`
- `Rgba8Uint`
- `Rgba8Sint`
- `Bgra8Unorm`
- `Rgb10a2Uint`
- `Rgb10a2Unorm`
- `Rg11b10Ufloat`
- `R64Uint`
- `Rg32Uint`
- `Rg32Sint`
- `Rg32Float`
- `Rgba16Uint`
- `Rgba16Sint`
- `Rgba16Float`
- `Rgba32Uint`
- `Rgba32Sint`
- `Rgba32Float`
- `R16Unorm`
- `R16Snorm`
- `Rg16Unorm`
- `Rg16Snorm`
- `Rgba16Unorm`
- `Rgba16Snorm`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<StorageFormat>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`, `ToWgsl`

### StructMember — struct

Member of a user-defined structure.

Fields:

- `name: Option<alloc::string::String>`
- `ty: arena::Handle<Type>` — Type of the field.
- `binding: Option<Binding>` — For I/O structs, defines the binding.
- `offset: u32` — Offset from the beginning from the struct.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SubgroupOperation — enum

Variants (9):

- `All = 0`
- `Any = 1`
- `Add = 2`
- `Mul = 3`
- `Min = 4`
- `Max = 5`
- `And = 6`
- `Or = 7`
- `Xor = 8`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### SwitchCase — struct

A case for a switch statement.

Fields:

- `value: SwitchValue` — Value, upon which the case is considered true.
- `body: Block` — Body of the case.
- `fall_through: bool` — If true, the control flow continues to the next case in the list, or default.

Implements: `Clone`, `Debug`

### SwitchValue — enum

The value of the switch case.

Variants (3):

- `I32(i32)`
- `U32(u32)`
- `Default`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SwizzleComponent — enum

Component selection for a vector swizzle.

Variants (4):

- `X = 0`
- `Y = 1`
- `Z = 2`
- `W = 3`

Methods and constants:

- `const XYZW: [Self; 4]`
- `const fn index(&self) -> u32`
- `const fn from_index(idx: u32) -> Self`

Implements: `Clone`, `Copy`, `Debug`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### Type — struct

A data type declared in the module.

Fields:

- `name: Option<alloc::string::String>` — The name of the type, if any.
- `inner: TypeInner` — Inner structure that depends on the kind of the type.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TypeInner — enum

Enum with additional information, depending on the kind of type.

Variants (14):

- `Scalar(Scalar)` — Number of integral or floating-point kind.
- `Vector { size: VectorSize, scalar: Scalar }` — Vector of numbers.
- `Matrix { columns: VectorSize, rows: VectorSize, scalar: Scalar }` — Matrix of numbers.
- `CooperativeMatrix { columns: CooperativeSize, rows: CooperativeSize, scalar: Scalar, role: CooperativeRole }` — Matrix that is cooperatively processed by all the threads in an opaque mapping.
- `Atomic(Scalar)` — Atomic scalar.
- `Pointer { base: arena::Handle<Type>, space: AddressSpace }` — Pointer to another type.
- `ValuePointer { size: Option<VectorSize>, scalar: Scalar, space: AddressSpace }` — Pointer to a scalar or vector.
- `Array { base: arena::Handle<Type>, size: ArraySize, stride: u32 }` — Homogeneous list of elements.
- `Struct { members: alloc::vec::Vec<StructMember>, span: u32 }` — User-defined structure.
- `Image { dim: ImageDimension, arrayed: bool, class: ImageClass }` — Possibly multidimensional array of texels.
- `Sampler { comparison: bool }` — Can be used to sample values from images.
- `AccelerationStructure { vertex_return: bool }` — Opaque object representing an acceleration structure of geometry.
- `RayQuery { vertex_return: bool }` — Locally used handle for ray queries.
- `BindingArray { base: arena::Handle<Type>, size: ArraySize }` — Array of bindings.

Methods and constants:

- `const fn is_handle(&self) -> bool` — Returns true if a variable of this type is a handle.
- `fn pointer_automatically_convertible_scalar(&self, types: &UniqueArena<Type>) -> Option<Scalar>` — Return the leaf scalar type of `pointer`.
- `fn indexable_length(&self, module: &Module) -> Result<IndexableLength, IndexableLengthError>` — Return the length of a subscriptable type.
- `fn indexable_length_pending(&self, module: &Module) -> Result<IndexableLength, IndexableLengthError>` — Return the length of `self`, assuming overrides are yet to be supplied.
- `fn indexable_length_resolved(&self, module: &Module) -> Result<IndexableLength, IndexableLengthError>` — Return the length of `self`, assuming overrides have been resolved.
- `const fn scalar(&self) -> Option<Scalar>` — Return the scalar type of `self`.
- `fn scalar_kind(&self) -> Option<ScalarKind>`
- `fn scalar_width(&self) -> Option<u8>` — Returns the scalar width in bytes
- `fn scalar_for_conversions(&self, types: &UniqueArena<Type>) -> Option<Scalar>` — Return the leaf scalar type of `self`, as needed for automatic conversions.
- `const fn pointer_space(&self) -> Option<AddressSpace>`
- `const fn pointer_base_type(&self) -> Option<TypeResolution>` — If `self` is a pointer type, return its base type.
- `fn is_atomic_pointer(&self, types: &UniqueArena<Type>) -> bool`
- `fn try_size(&self, gctx: super::GlobalCtx<'_>) -> Option<u32>` — Attempt to calculate the size of this type. Returns `None` if the size exceeds the limit of [`crate::valid::MAX_TYPE_SIZE`].
- `fn size(&self, gctx: super::GlobalCtx<'_>) -> u32` — Get the size of this type.
- `fn canonical_form(&self, types: &UniqueArena<Type>) -> Option<TypeInner>` — Return the canonical form of `self`, or `None` if it's already in canonical form.
- `fn non_struct_equivalent(&self, rhs: &ir::TypeInner, types: &UniqueArena<Type>) -> bool` — Compare value type `self` and `rhs` as types.
- `fn is_dynamically_sized(&self, types: &UniqueArena<Type>) -> bool` — Returns true if `self` is runtime- or override-sized.
- `fn needs_host_buffer_byte_size(&self, types: &UniqueArena<Type>) -> bool` — True when host code may need a storage buffer byte size for this type, for bounds checks or WGSL `arrayLength`. Includes runtime-sized arrays and `binding_array` of element types that qualify.
- `fn is_constructible(&self, types: &UniqueArena<Type>) -> bool` — Returns true if `self` is a constructible type.
- `const fn components(&self) -> Option<u32>`
- `fn component_type(&self, index: usize) -> Option<TypeResolution>`
- `const fn vector_size_and_scalar(&self) -> Option<(Option<VectorSize>, Scalar)>` — If the type is a scalar or vector (not a matrix), return a tuple of the vector size (or `None` for scalars), and the scalar kind. Returns `None` for other types.
- `fn is_abstract(&self, types: &UniqueArena<Type>) -> bool` — Return true if `self` is an abstract type.
- `fn automatically_converts_to(&self, goal: &Self, types: &UniqueArena<Type>) -> Option<(Scalar, Scalar)>` — Determine whether `self` automatically converts to `goal`.

Implements: `Clone`, `Debug`, `Eq`, `ForDebugWithTypes`, `Hash`, `PartialEq`, `StructuralPartialEq`, `TryFrom<&TypeInner>`

### UnaryOperator — enum

Operation that can be applied on a single value.

Variants (3):

- `Negate`
- `LogicalNot`
- `BitwiseNot`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### UniqueArena`<T>` — struct

An arena whose elements are guaranteed to be unique.

Opaque (private fields).

Methods and constants:

- `fn new() -> Self` — Create a new arena with no initial capacity allocated.
- `fn len(&self) -> usize` — Return the current number of items stored in this arena.
- `fn is_empty(&self) -> bool` — Return `true` if the arena contains no elements.
- `fn clear(&mut self)` — Clears the arena, keeping all allocations.
- `fn take(&mut self) -> Self` — Replaces this arena with an empty one, returning the old data.
- `fn get_span(&self, handle: Handle<T>) -> Span` — Return the span associated with `handle`.
- `fn iter(&self) -> impl DoubleEndedIterator<Item = (Handle<T>, &T)> + ExactSizeIterator` — Returns an iterator over the items stored in this arena, returning both the item's handle and a reference to it.
- `fn insert(&mut self, value: T, span: Span) -> Handle<T>` — Insert a new value into the arena.
- `fn replace(&mut self, old: Handle<T>, new: T)` — Replace an old value with a new value.
- `fn get(&self, value: &T) -> Option<Handle<T>>` — Return this arena's handle for `value`, if present.
- `fn get_handle(&self, handle: Handle<T>) -> Result<&T, BadHandle>` — Return this arena's value at `handle`, if that is a valid handle.
- `fn check_contains_handle(&self, handle: Handle<T>) -> Result<(), BadHandle>` — Assert that `handle` is valid for this arena.

Implements: `Clone`, `Debug`, `Default`, `Index<Handle<T>>`, `TypeContext`

### valid::CallError — enum

Variants (6):

- `Argument { index: usize, source: super::ExpressionError }`
- `ResultAlreadyInScope(arena::Handle<Expression>)`
- `ResultAlreadyPopulated(arena::Handle<Expression>)`
- `ArgumentCount { required: usize, seen: usize }`
- `ArgumentType { index: usize, required: arena::Handle<Type>, seen_expression: arena::Handle<Expression> }`
- `ExpressionMismatch(Option<arena::Handle<Expression>>)`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::Capabilities — struct _[must_use]_

Allowed IR capabilities.

Opaque (private fields).

Methods and constants:

- `const IMMEDIATES: Self` — Support for [`AddressSpace::Immediate`][1].
- `const FLOAT64: Self` — Float values with width = 8.
- `const PRIMITIVE_INDEX: Self` — Support for [`BuiltIn::PrimitiveIndex`][1].
- `const TEXTURE_AND_SAMPLER_BINDING_ARRAY: Self` — Support for binding arrays of sampled textures and samplers.
- `const BUFFER_BINDING_ARRAY: Self` — Support for binding arrays of uniform buffers.
- `const STORAGE_TEXTURE_BINDING_ARRAY: Self` — Support for binding arrays of storage textures.
- `const STORAGE_BUFFER_BINDING_ARRAY: Self` — Support for binding arrays of storage buffers.
- `const CLIP_DISTANCES: Self` — Support for [`BuiltIn::ClipDistances`].
- `const CULL_DISTANCE: Self` — Support for [`BuiltIn::CullDistance`].
- `const STORAGE_TEXTURE_16BIT_NORM_FORMATS: Self` — Support for 16-bit normalized storage texture formats.
- `const MULTIVIEW: Self` — Support for [`BuiltIn::ViewIndex`].
- `const EARLY_DEPTH_TEST: Self` — Support for `early_depth_test`.
- `const MULTISAMPLED_SHADING: Self` — Support for [`BuiltIn::SampleIndex`] and [`Sampling::Sample`].
- `const RAY_QUERY: Self` — Support for ray queries and acceleration structures.
- `const DUAL_SOURCE_BLENDING: Self` — Support for generating two sources for blending from fragment shaders.
- `const CUBE_ARRAY_TEXTURES: Self` — Support for arrayed cube textures.
- `const SHADER_INT64: Self` — Support for 64-bit signed and unsigned integers.
- `const SUBGROUP: Self` — Support for subgroup operations (except barriers) in fragment and compute shaders.
- `const SUBGROUP_BARRIER: Self` — Support for subgroup barriers in compute shaders.
- `const SUBGROUP_VERTEX_STAGE: Self` — Support for subgroup operations (not including barriers) in the vertex stage.
- `const SHADER_INT64_ATOMIC_MIN_MAX: Self` — Support for [`AtomicFunction::Min`] and [`AtomicFunction::Max`] on 64-bit integers in the [`Storage`] address space, when the return value is not used.
- `const SHADER_INT64_ATOMIC_ALL_OPS: Self` — Support for all atomic operations on 64-bit integers.
- `const SHADER_FLOAT32_ATOMIC: Self` — Support for [`AtomicFunction::Add`], [`AtomicFunction::Sub`], and [`AtomicFunction::Exchange { compare: None }`] on 32-bit floating-point numbers in the [`Stor…
- `const TEXTURE_ATOMIC: Self` — Support for atomic operations on images.
- `const TEXTURE_INT64_ATOMIC: Self` — Support for atomic operations on 64-bit images.
- `const RAY_HIT_VERTEX_POSITION: Self` — Support for ray queries returning vertex position
- `const SHADER_FLOAT16: Self` — Support for 16-bit floating-point types.
- `const TEXTURE_EXTERNAL: Self` — Support for [`ImageClass::External`]
- `const SHADER_FLOAT16_IN_FLOAT32: Self` — Support for `quantizeToF16`, `pack2x16float`, and `unpack2x16float`, which store `f16`-precision values in `f32`s.
- `const SHADER_BARYCENTRICS: Self` — Support for fragment shader barycentric coordinates.
- `const MESH_SHADER: Self` — Support for task shaders, mesh shaders, and per-primitive fragment inputs
- `const MESH_SHADER_POINT_TOPOLOGY: Self` — Support for mesh shaders which output points.
- `const TEXTURE_AND_SAMPLER_BINDING_ARRAY_NON_UNIFORM_INDEXING: Self` — Support for non-uniform indexing of binding arrays of sampled textures and samplers.
- `const BUFFER_BINDING_ARRAY_NON_UNIFORM_INDEXING: Self` — Support for non-uniform indexing of binding arrays of uniform buffers.
- `const STORAGE_TEXTURE_BINDING_ARRAY_NON_UNIFORM_INDEXING: Self` — Support for non-uniform indexing of binding arrays of storage textures.
- `const STORAGE_BUFFER_BINDING_ARRAY_NON_UNIFORM_INDEXING: Self` — Support for non-uniform indexing of binding arrays of storage buffers.
- `const COOPERATIVE_MATRIX: Self` — Support for cooperative matrix types and operations
- `const PER_VERTEX: Self` — Support for per-vertex fragment input.
- `const RAY_TRACING_PIPELINE: Self` — Support for ray generation, any hit, closest hit, and miss shaders.
- `const DRAW_INDEX: Self` — Support for draw index builtin
- `const ACCELERATION_STRUCTURE_BINDING_ARRAY: Self` — Support for binding arrays of acceleration structures.
- `const MEMORY_DECORATION_COHERENT: Self` — Support for the `@coherent` memory decoration on storage buffers.
- `const MEMORY_DECORATION_VOLATILE: Self` — Support for the `@volatile` memory decoration on storage buffers.
- `const SHADER_INT16: Self` — Support for 16-bit integer types.
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
- `const fn iter(&self) -> $crate::iter::Iter<Capabilities>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<Capabilities>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<Capabilities>`, `Flags`, `FromIterator<Capabilities>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::check_literal_value — function

`const fn naga::valid::check_literal_value(literal: Literal) -> Result<(), LiteralError>`

### valid::ComposeError — enum

Variants (3):

- `Type(arena::Handle<Type>)`
- `ComponentCount { given: u32, expected: u32 }`
- `ComponentType { index: u32 }`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ComposeError>`

### valid::ConstantError — enum

Variants (3):

- `InitializerExprType`
- `InvalidType`
- `NonConstructibleType`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::ConstExpressionError — enum

Variants (7):

- `NonConstOrOverride`
- `NonFullyEvaluatedConst`
- `Compose(super::ComposeError)`
- `InvalidSplatType(arena::Handle<Expression>)`
- `Type(proc::ResolveError)`
- `Literal(LiteralError)`
- `Width(super::type::WidthError)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ComposeError>`, `From<LiteralError>`, `From<ResolveError>`, `From<WidthError>`

### valid::Disalignment — enum

Variants (6):

- `ArrayStride { stride: u32, alignment: proc::Alignment }`
- `StructSpan { span: u32, alignment: proc::Alignment }`
- `MemberOffset { index: u32, offset: u32, alignment: proc::Alignment }`
- `MemberOffsetAfterStruct { index: u32, offset: u32, expected: u32 }`
- `UnsizedMember { index: u32 }`
- `NonHostShareable`

Implements: `Clone`, `Copy`, `Debug`, `Display`, `Error`

### valid::EntryPointError — enum

Variants (29):

- `Conflict`
- `MissingVertexOutputPosition`
- `UnexpectedEarlyDepthTest`
- `UnexpectedWorkgroupSize`
- `OutOfRangeWorkgroupSize`
- `ForbiddenStageOperations`
- `InvalidGlobalUsage(arena::Handle<GlobalVariable>, super::analyzer::GlobalUse)`
- `MoreThanOneImmediateUsed`
- `BindingCollision(arena::Handle<GlobalVariable>)`
- `Argument(u32, VaryingError)`
- `Result(VaryingError)`
- `Function(super::FunctionError)`
- `UnsupportedCapability(super::Capabilities)`
- `ExpectedMeshShaderAttributes`
- `UnexpectedMeshShaderAttributes`
- `UnexpectedTaskPayload`
- `TaskPayloadWrongAddressSpace`
- `WrongTaskPayloadUsed`
- `WrongTaskShaderEntryResult`
- `ExpectedTaskPayload`
- `BadMeshOutputVariableType`
- `BadMeshOutputVariableField`
- `UnexpectedMeshShaderEntryResult`
- `InvalidMeshOutputType`
- `InvalidMeshPrimitiveOutputType`
- `WrongMeshOutputAddressSpace`
- `TaskPayloadTooSmall(u32)`
- `RayPayloadInInvalidStage(ShaderStage)`
- `IncomingRayPayloadInInvalidStage(ShaderStage)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<FunctionError>`, `From<VaryingError>`

### valid::ExpressionError — enum

Variants (62):

- `NotInScope`
- `InvalidBaseType(arena::Handle<Expression>)`
- `InvalidIndexType(arena::Handle<Expression>)`
- `NegativeIndex(arena::Handle<Expression>)`
- `IndexOutOfBounds(arena::Handle<Expression>, u32)`
- `FunctionArgumentDoesntExist(u32)`
- `InvalidPointerType(arena::Handle<Expression>)`
- `InvalidArrayType(arena::Handle<Expression>)`
- `InvalidRayQueryType(arena::Handle<Expression>)`
- `InvalidSplatType(arena::Handle<Expression>)`
- `InvalidVectorType(arena::Handle<Expression>)`
- `InvalidSwizzleComponent(SwizzleComponent, VectorSize)`
- `Compose(super::ComposeError)`
- `InvalidZeroValue(arena::Handle<Type>)`
- `IndexableLength(proc::IndexableLengthError)`
- `InvalidUnaryOperandType(UnaryOperator, arena::Handle<Expression>)`
- `InvalidBinaryOperandTypes { op: BinaryOperator, lhs_expr: arena::Handle<Expression>, lhs_type: TypeInner, rhs_expr: arena::Handle<Expression>, rhs_type: TypeInner }`
- `SelectValuesTypeMismatch { accept: TypeInner, reject: TypeInner }`
- `SelectConditionNotABool { actual: TypeInner }`
- `InvalidBooleanVector(arena::Handle<Expression>)`
- `InvalidFloatArgument(arena::Handle<Expression>)`
- `Type(proc::ResolveError)`
- `ExpectedGlobalVariable`
- `ExpectedGlobalOrArgument`
- `ExpectedBindingArrayType(arena::Handle<Type>)`
- `ExpectedImageType(arena::Handle<Type>)`
- `ExpectedSamplerType(arena::Handle<Type>)`
- `InvalidImageClass(ImageClass)`
- `InvalidImageFormat(StorageFormat)`
- `InvalidImageStorageAccess(StorageAccess)`
- `InvalidDerivative`
- `InvalidImageArrayIndex`
- `InvalidImageSampleSelector`
- `MissingImageSampleSelector`
- `InvalidImageLevelSelector`
- `MissingImageLevelSelector`
- `InvalidImageArrayIndexType(arena::Handle<Expression>)`
- `InvalidImageOtherIndexType(arena::Handle<Expression>)`
- `InvalidImageCoordinateType(ImageDimension, arena::Handle<Expression>)`
- `ComparisonSamplingMismatch { image: ImageClass, sampler: bool, has_ref: bool }`
- `InvalidSampleOffsetExprType`
- `InvalidSampleOffset(ImageDimension, arena::Handle<Expression>)`
- `InvalidDepthReference(arena::Handle<Expression>)`
- `InvalidDepthSampleLevel`
- `InvalidGatherLevel`
- `InvalidGatherComponent(SwizzleComponent)`
- `InvalidGatherDimension(ImageDimension)`
- `InvalidSampleLevelExactType(arena::Handle<Expression>)`
- `InvalidSampleLevelBiasType(arena::Handle<Expression>)`
- `InvalidSampleLevelBiasDimension(ImageDimension)`
- `InvalidSampleLevelGradientType(ImageDimension, arena::Handle<Expression>)`
- `InvalidSampleClampCoordinateToEdge(alloc::string::String)`
- `InvalidCastArgument`
- `WrongArgumentCount(MathFunction)`
- `InvalidArgumentType(MathFunction, u32, arena::Handle<Expression>)`
- `InvalidWorkGroupUniformLoadResultType(arena::Handle<Type>)`
- `MissingCapabilities(super::Capabilities)`
- `Literal(LiteralError)`
- `UnsupportedWidth(MathFunction, ScalarKind, Bytes)`
- `InvalidCooperativeOperand(arena::Handle<Expression>)`
- `ShiftAmountTooLarge { lhs_type: TypeInner, rhs_expr: arena::Handle<Expression> }`
- `DivideByZero`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<ComposeError>`, `From<IndexableLengthError>`, `From<LiteralError>`, `From<ResolveError>`

### valid::ExpressionInfo — struct

Information about an expression in a function body.

Fields:

- `uniformity: Uniformity` — Whether this expression is uniform, and why.
- `ref_count: usize` — The number of direct references to this expression in statements and other expressions.
- `ty: proc::TypeResolution` — The type of this expression.
- (private fields omitted)

Implements: `Clone`, `Debug`

### valid::FunctionError — enum

Variants (54):

- `Expression { handle: arena::Handle<Expression>, source: super::ExpressionError }`
- `ExpressionAlreadyInScope(arena::Handle<Expression>)`
- `LocalVariable { handle: arena::Handle<LocalVariable>, name: alloc::string::String, source: LocalVariableError }`
- `InvalidArgumentType { index: usize, name: alloc::string::String }`
- `NonConstructibleReturnType`
- `InvalidArgumentPointerSpace { index: usize, name: alloc::string::String, space: AddressSpace }`
- `BreakOutsideOfLoopOrSwitch`
- `ContinueOutsideOfLoop`
- `InvalidReturnSpot`
- `InvalidReturnType { expression: Option<arena::Handle<Expression>>, expected_ty: Option<arena::Handle<Type>> }`
- `InvalidIfType(arena::Handle<Expression>)`
- `InvalidSwitchType(arena::Handle<Expression>)`
- `ConflictingSwitchCase(SwitchValue)`
- `ConflictingCaseType`
- `MissingDefaultCase`
- `MultipleDefaultCases`
- `LastCaseFallTrough`
- `InvalidStorePointer(arena::Handle<Expression>)`
- `InvalidStoreTexture { actual: arena::Handle<Expression>, actual_ty: TypeInner }`
- `InvalidStoreValue { actual: arena::Handle<Expression>, actual_ty: TypeInner, expected_ty: TypeInner }`
- `InvalidStoreTypes { pointer: arena::Handle<Expression>, value: arena::Handle<Expression> }`
- `InvalidImageStore(super::ExpressionError)`
- `InvalidImageAtomic(super::ExpressionError)`
- `InvalidImageAtomicFunction(AtomicFunction)`
- `InvalidImageAtomicValue(arena::Handle<Expression>)`
- `InvalidCall { function: arena::Handle<Function>, error: CallError }`
- `InvalidAtomic(AtomicError)`
- `InvalidRayQueryExpression(arena::Handle<Expression>)`
- `InvalidAccelerationStructure(arena::Handle<Expression>)`
- `MissingAccelerationStructureVertexReturn(arena::Handle<Expression>, arena::Handle<Expression>)`
- `MissingRayQueryVertexReturn(arena::Handle<Expression>)`
- `InvalidRayDescriptor(arena::Handle<Expression>)`
- `InvalidRayQueryType(arena::Handle<Type>)`
- `InvalidHitDistanceType(arena::Handle<Expression>)`
- `MissingCapability(super::Capabilities)`
- `NonUniformControlFlow(super::analyzer::UniformityRequirements, arena::Handle<Expression>, super::analyzer::UniformityDisruptor)`
- `PipelineInputRegularFunction { name: alloc::string::String }`
- `PipelineOutputRegularFunction`
- `NonUniformWorkgroupUniformLoad(super::analyzer::UniformityDisruptor)`
- `WorkgroupUniformLoadExpressionMismatch(arena::Handle<Expression>)`
- `WorkgroupUniformLoadInvalidPointer(arena::Handle<Expression>)`
- `InvalidSubgroup(SubgroupError)`
- `InvalidCooperativeStoreTarget(arena::Handle<Expression>)`
- `InvalidCooperativeDataPointer(arena::Handle<Expression>)`
- `EmitResult(arena::Handle<Expression>)`
- `UnvisitedExpression(arena::Handle<Expression>)`
- `InvalidMeshFunctionCall(arena::Handle<Expression>)`
- `ConflictingMeshOutputTypes(arena::Handle<Expression>, arena::Handle<Expression>)`
- `ConflictingTaskPayloadVariables(arena::Handle<Expression>, arena::Handle<Expression>)`
- `InvalidMeshShaderOutputType(arena::Handle<Expression>)`
- `InvalidPayloadType`
- `InvalidPayloadAddressSpace(AddressSpace)`
- `MismatchedPayloadType(arena::Handle<Type>, arena::Handle<Type>)`
- `PayloadPointerNotGlobal`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<FunctionError>`, `From<SubgroupError>`

### valid::FunctionInfo — struct

Fields:

- `available_stages: super::ShaderStages` — Set of shader stages where calling this function is valid.
- `uniformity: Uniformity` — Uniformity characteristics.
- `may_kill: bool` — Function may kill the invocation.
- `sampling_set: FastHashSet<SamplingKey>` — All pairs of (texture, sampler) globals that may be used together in sampling operations by this function and its callees. This includes pairings that arise when this function pas…
- `global_uses: alloc::boxed::Box<[GlobalUse]>` — How this function and its callees use this module's globals.
- `dual_source_blending: bool` — Indicates that the function is using dual source blending.
- `immediate_slots_used: super::ImmediateSlots` — A bitmask, tracking which 4-byte slots this function (possibly transitively) reads. Used to determine the minimum set of slots that must be written via `set_immediates`.
- (private fields omitted)

Methods and constants:

- `const fn global_variable_count(&self) -> usize`
- `const fn expression_count(&self) -> usize`
- `fn dominates_global_use(&self, other: &Self) -> bool`

Implements: `Clone`, `Debug`, `Index<Handle<Expression>>`, `Index<Handle<GlobalVariable>>`

### valid::GlobalUse — struct

Indicates how a global variable is used.

Opaque (private fields).

Methods and constants:

- `const READ: Self` — Data will be read from the variable.
- `const WRITE: Self` — Data will be written to the variable.
- `const QUERY: Self` — The information about the data is queried.
- `const ATOMIC: Self` — Atomic operations will be performed on the variable.
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
- `const fn iter(&self) -> $crate::iter::Iter<GlobalUse>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<GlobalUse>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<GlobalUse>`, `Flags`, `FromIterator<GlobalUse>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::GlobalVariableError — enum

Variants (16):

- `InvalidUsage(AddressSpace)`
- `InvalidType(AddressSpace)`
- `InvalidBindingArray(arena::Handle<Type>)`
- `MissingTypeFlags { required: super::TypeFlags, seen: super::TypeFlags }`
- `UnsupportedCapability(super::Capabilities)`
- `InvalidBinding`
- `Alignment(AddressSpace, arena::Handle<Type>, super::Disalignment)`
- `InitializerExprType`
- `InitializerType`
- `InitializerNotAllowed(AddressSpace)`
- `StorageAddressSpaceWriteOnlyNotSupported`
- `InvalidImmediateType(super::ImmediateError)`
- `ZeroSizedTaskPayload`
- `InvalidMemoryDecorationsAddressSpace`
- `CoherentNotSupported`
- `VolatileNotSupported`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::ImmediateError — enum

Variants (1):

- `InvalidScalar(Scalar)`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::ImmediateSlots — struct

A bitmask, tracking which 4-byte slots have been written via `set_immediates`. Bit N corresponds to bytes [N*4 .. N*4+4).

Opaque (private fields).

Methods and constants:

- `const fn from_raw(raw: u64) -> Self`
- `const fn from_range(offset: u32, size_bytes: u32) -> Self` — Compute the bitmask for a byte range [offset .. offset + size_bytes).
- `fn from_type(ty: &TypeInner, offset: u32, types: &UniqueArena<Type>, gctx: proc::GlobalCtx<'_>) -> Self` — Compute the slots occupied by a type at a given byte offset, excluding padding between struct members.
- `const fn contains(self, other: Self) -> bool` — Returns true if `self` contains all bits in `other`.
- `const fn difference(self, other: Self) -> Self` — Returns the bits in `self` that are not set in `other`.
- `fn size_for_module(module: &Module) -> u32` — Returns the byte size of the `var<immediate>` type in a module. Zero if the module has no `var<immediate>`.

Implements: `BitOr`, `BitOrAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Display`, `Eq`, `PartialEq`, `StructuralPartialEq`

### valid::LiteralError — enum

Variants (3):

- `NaN`
- `Infinity`
- `Width(super::type::WidthError)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<LiteralError>`, `From<WidthError>`

### valid::LocalVariableError — enum

Variants (3):

- `InvalidType(arena::Handle<Type>)`
- `InitializerType`
- `NonConstOrOverrideInitializer`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::MAX_TYPE_SIZE — constant

`const valid::MAX_TYPE_SIZE: u32 = _`

Maximum size of a type, in bytes.

### valid::ModuleInfo — struct

Opaque (private fields).

Methods and constants:

- `fn get_entry_point(&self, index: usize) -> &FunctionInfo`

Implements: `Clone`, `Debug`, `Default`, `Index<Handle<Expression>>`, `Index<Handle<Function>>`, `Index<Handle<Type>>`

### valid::OverrideError — enum

Variants (9):

- `MissingNameAndID`
- `DuplicateID`
- `InitializerExprType`
- `InvalidType`
- `NonConstructibleType`
- `TypeNotScalar`
- `NotAllowed`
- `UninitializedOverride`
- `ConstExpression { handle: arena::Handle<Expression>, source: ConstExpressionError }`

Implements: `Clone`, `Debug`, `Display`, `Error`

### valid::ShaderStages — struct

Validation flags.

Opaque (private fields).

Methods and constants:

- `const VERTEX: Self`
- `const FRAGMENT: Self`
- `const COMPUTE: Self`
- `const MESH: Self`
- `const TASK: Self`
- `const RAY_GENERATION: Self`
- `const ANY_HIT: Self`
- `const CLOSEST_HIT: Self`
- `const MISS: Self`
- `const COMPUTE_LIKE: Self`
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
- `const fn iter(&self) -> $crate::iter::Iter<ShaderStages>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<ShaderStages>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<ShaderStages>`, `Flags`, `FromIterator<ShaderStages>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::SubgroupError — enum

Variants (5):

- `InvalidOperand(arena::Handle<Expression>)`
- `ResultTypeMismatch(arena::Handle<Expression>)`
- `UnsupportedOperation(super::SubgroupOperationSet)`
- `UnknownOperation`
- `InvalidInvocationIdExprType(arena::Handle<Expression>)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<SubgroupError>`

### valid::SubgroupOperationSet — struct

Supported subgroup operations

Opaque (private fields).

Methods and constants:

- `const BASIC: Self` — Barriers
- `const VOTE: Self` — Any, All
- `const ARITHMETIC: Self` — reductions, scans
- `const BALLOT: Self` — ballot, broadcast
- `const SHUFFLE: Self` — shuffle, shuffle xor
- `const SHUFFLE_RELATIVE: Self` — shuffle up, down
- `const QUAD_FRAGMENT_COMPUTE: Self` — Quad supported
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
- `const fn iter(&self) -> $crate::iter::Iter<SubgroupOperationSet>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<SubgroupOperationSet>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<SubgroupOperationSet>`, `Flags`, `FromIterator<SubgroupOperationSet>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::TypeError — enum

Variants (20):

- `MissingCapability(super::Capabilities)`
- `InvalidAtomicWidth(ScalarKind, Bytes)`
- `InvalidPointerBase(arena::Handle<Type>)`
- `InvalidPointerToUnsized { base: arena::Handle<Type>, space: AddressSpace }`
- `InvalidData(arena::Handle<Type>)`
- `InvalidArrayBaseType(arena::Handle<Type>)`
- `MatrixElementNotFloat`
- `UnsupportedSpecializedArrayLength(arena::Handle<Constant>)`
- `UnsupportedImageType { dim: ImageDimension, arrayed: bool, class: ImageClass }`
- `InvalidArrayStride { stride: u32, expected: u32 }`
- `InvalidDynamicArray(alloc::string::String, arena::Handle<Type>)`
- `BindingArrayBaseTypeNotStruct(arena::Handle<Type>)`
- `BindingArrayBaseExternalTextures`
- `MemberOverlap { index: u32, offset: u32 }`
- `MemberOutOfBounds { index: u32, offset: u32, size: u32, span: u32 }`
- `EmptyStruct`
- `InvalidBlendSrc(super::VaryingError)`
- `WidthError(WidthError)`
- `UnresolvedOverride(arena::Handle<Type>)`
- `InvalidArraySize(arena::Handle<Type>)`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<WidthError>`

### valid::TypeFlags — struct

Flags associated with [`Type`]s by [`Validator`].

Opaque (private fields).

Methods and constants:

- `const DATA: Self` — Can be used for data variables.
- `const SIZED: Self` — The data type has a size known by pipeline creation time.
- `const COPY: Self` — The data can be copied around.
- `const IO_SHAREABLE: Self` — Can be be used in pipeline stage I/O.
- `const HOST_SHAREABLE: Self` — Can be used for host-shareable structures.
- `const CREATION_RESOLVED: Self` — The set of types with a fixed size at shader-creation time (ie. everything except arrays sized by an override-expression)
- `const ARGUMENT: Self` — This type can be passed as a function argument.
- `const CONSTRUCTIBLE: Self` — A WGSL [constructible] type.
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
- `const fn iter(&self) -> $crate::iter::Iter<TypeFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<TypeFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<TypeFlags>`, `Flags`, `FromIterator<TypeFlags>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::Uniformity — struct

Uniform control flow characteristics.

Fields:

- `non_uniform_result: Option<arena::Handle<Expression>>` — A child expression with non-uniform result.
- `requirements: UniformityRequirements` — If this expression requires uniform control flow, store the reason here.

Implements: `Clone`, `Debug`

### valid::UniformityRequirements — struct

Kinds of expressions that require uniform control flow.

Opaque (private fields).

Methods and constants:

- `const WORK_GROUP_BARRIER: Self`
- `const DERIVATIVE: Self`
- `const IMPLICIT_LEVEL: Self`
- `const COOP_OPS: Self`
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
- `const fn iter(&self) -> $crate::iter::Iter<UniformityRequirements>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<UniformityRequirements>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<UniformityRequirements>`, `Flags`, `FromIterator<UniformityRequirements>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::ValidationError — enum

Variants (11):

- `InvalidHandle(self::handles::InvalidHandleError)`
- `Layouter(proc::LayoutError)`
- `Type { handle: arena::Handle<Type>, name: alloc::string::String, source: TypeError }`
- `ConstExpression { handle: arena::Handle<Expression>, source: ConstExpressionError }`
- `ArraySizeError { handle: arena::Handle<Expression> }`
- `Constant { handle: arena::Handle<Constant>, name: alloc::string::String, source: ConstantError }`
- `Override { handle: arena::Handle<Override>, name: alloc::string::String, source: OverrideError }`
- `GlobalVariable { handle: arena::Handle<GlobalVariable>, name: alloc::string::String, source: GlobalVariableError }`
- `Function { handle: arena::Handle<Function>, name: alloc::string::String, source: FunctionError }`
- `EntryPoint { stage: ShaderStage, name: alloc::string::String, source: EntryPointError }`
- `Corrupted`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<LayoutError>`

### valid::ValidationFlags — struct

Validation flags.

Opaque (private fields).

Methods and constants:

- `const EXPRESSIONS: Self` — Expressions.
- `const BLOCKS: Self` — Statements and blocks of them.
- `const CONTROL_FLOW_UNIFORMITY: Self` — Uniformity of control flow for operations that require it.
- `const STRUCT_LAYOUTS: Self` — Host-shareable structure layouts.
- `const CONSTANTS: Self` — Constants.
- `const BINDINGS: Self` — Group, binding, and location attributes.
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
- `const fn iter(&self) -> $crate::iter::Iter<ValidationFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<ValidationFlags>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<ValidationFlags>`, `Flags`, `FromIterator<ValidationFlags>`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### valid::Validator — struct

Opaque (private fields).

Methods and constants:

- `fn validate_literal(&self, literal: Literal) -> Result<(), LiteralError>`
- `fn new(flags: ValidationFlags, capabilities: Capabilities) -> Self` — Create a validator for Naga [`Module`]s.
- `const fn subgroup_stages(&mut self, stages: ShaderStages) -> &mut Self`
- `const fn subgroup_operations(&mut self, operations: SubgroupOperationSet) -> &mut Self`
- `fn reset(&mut self)` — Reset the validator internals
- `fn validate(&mut self, module: &Module) -> Result<ModuleInfo, WithSpan<ValidationError>>` — Check the given module to be valid.
- `fn validate_resolved_overrides(&mut self, module: &Module) -> Result<ModuleInfo, WithSpan<ValidationError>>` — Check the given module to be valid, requiring overrides to be resolved.

Implements: `Debug`

### valid::VaryingError — enum

Variants (26):

- `InvalidType(arena::Handle<Type>)`
- `NotIOShareableType(arena::Handle<Type>)`
- `InvalidInterpolationInStage(Interpolation, ShaderStage)`
- `InvalidInterpolationSamplingCombination { interpolation: Interpolation, sampling: Sampling }`
- `InvalidInterpolationForInteger`
- `MissingInterpolation`
- `InvalidBuiltInStage(BuiltIn)`
- `InvalidBuiltInType(BuiltIn, TypeInner)`
- `MissingBinding`
- `MemberMissingBinding(u32)`
- `BindingCollision { location: u32 }`
- `BindingCollisionBlendSrc { blend_src: u32 }`
- `DuplicateBuiltIn(BuiltIn)`
- `UnsupportedCapability(super::Capabilities)`
- `InvalidInputAttributeInStage(&'static str, ShaderStage)`
- `InvalidAttributeInStage(&'static str, ShaderStage)`
- `InvalidBlendSrcIndex { location: u32, blend_src: u32 }`
- `IncompleteBlendSrcUsage { present_blend_src: u32 }`
- `InvalidBlendSrcWithOtherBindings { location: u32 }`
- `BlendSrcOutputTypeMismatch { blend_src_0_type: arena::Handle<Type>, blend_src_1_type: arena::Handle<Type> }`
- `BlendSrcNotOnStructMember`
- `InvalidMultiDimensionalSubgroupBuiltIn`
- `InvalidPerPrimitive`
- `MissingPerPrimitive`
- `PerVertexNotArrayOfThree`
- `InvalidPerVertexSampling`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<VaryingError>`

### valid::WidthError — enum

Variants (3):

- `Invalid(ScalarKind, Bytes)`
- `MissingCapability { name: &'static str, flag: &'static str }`
- `Abstract`

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<WidthError>`

### VectorSize — enum

Number of components in a vector.

Variants (3):

- `Bi = 2` — 2D vector
- `Tri = 3` — 3D vector
- `Quad = 4` — 4D vector

Methods and constants:

- `const MAX: usize`

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<VectorSize>`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### WithSpan`<E>` — struct

Wrapper class for [`Error`], augmenting it with a list of [`SpanContext`]s.

Opaque (private fields).

Methods and constants:

- `const fn new(inner: E) -> Self` — Create a new [`WithSpan`] from an [`Error`], containing no spans.
- `fn into_inner(self) -> E` — Reverse of [`Self::new`], discards span information and returns an inner error.
- `const fn as_inner(&self) -> &E`
- `fn spans(&self) -> impl ExactSizeIterator<Item = &SpanContext>` — Iterator over stored [`SpanContext`]s.
- `fn with_span<S>(self, span: Span, description: S) -> Self where S: ToString` — Add a new span with description.
- `fn with_context(self, span_context: SpanContext) -> Self` — Add a [`SpanContext`].
- `fn into_other<E2>(self) -> WithSpan<E2> where E2: From<E>` — Convert inner error using [`From`].
- `fn and_then<F, E2>(self, func: F) -> WithSpan<E2> where F: FnOnce(E) -> WithSpan<E2>` — Convert inner error into another type. Joins span information contained in `self` with what is returned from `func`.
- `fn location(&self, source: &str) -> Option<SourceLocation>` — Return a [`SourceLocation`] for our first span, if we have one.
- `fn emit_to_string(&self, source: &str) -> String where E: Error` — Emits a summary of the error to a string.
- `fn emit_to_string_with_path(&self, source: &str, path: &str) -> String where E: Error` — Emits a summary of the error to a string.

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<WithSpan<ValidationError>>`

## naga::ir (names only)

AddressSpace, ArraySize, AtomicFunction, Barrier, BinaryOperator, Binding, Block, BuiltIn, Bytes, CollectiveOperation, ConservativeDepth, Constant, CooperativeData, CooperativeRole, CooperativeSize, DerivativeAxis, DerivativeControl, Direction, DocComments, EarlyDepthTest, EntryPoint, Expression, Function, FunctionArgument, FunctionResult, GatherMode, GlobalVariable, ImageClass, ImageDimension, ImageQuery, Interpolation, Literal, LocalVariable, MathFunction, MemoryDecorations, MeshOutputTopology, MeshStageInfo, Module, Override, PredeclaredType, RayFlag, RayPipelineFunction, RayQueryFunction, RayQueryIntersection, RelationalFunction, SampleLevel, Sampling, Scalar, ScalarKind, SpecialTypes, Statement, StorageAccess, StorageFormat, StructMember, SubgroupOperation, SwitchCase, SwitchValue, SwizzleComponent, Type, TypeInner, UnaryOperator, VectorSize

## naga::proc (names only)

Alignment, BoundsCheckPolicies, BoundsCheckPolicy, CaseInsensitiveKeywordSet, compare_types, Conclusion, concrete_int_scalars, ConstantEvaluator, ConstantEvaluatorError, ConstValueError, Emitter, ensure_block_returns, EntryPointIndex, ExpressionKind, ExpressionKindTracker, ExternalTextureNameKey, flatten_compose, GlobalCtx, HashableLiteral, access_needs_check, BoundsCheckPolicies, BoundsCheckPolicy, find_checked_indexes, GuardedIndex, IndexableLength, IndexableLengthError, oob_local_types, IndexableLength, IndexableLengthError, KeywordSet, Layouter, LayoutError, LayoutErrorInner, min_max_float_representable_by, MissingSpecialType, NameKey, Namer, OverloadSet, RayTracingUses, ResolveArraySizeError, ResolveContext, ResolveError, Rule, TypeLayout, TypeResolution, vector_size_str, vector_sizes
