# wgpu 30.0.1 API map — Pipelines, shaders, bind groups, vertex layouts

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 39 public items.

### BindGroup — struct

Handle to a binding group.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### BindGroupDescriptor`<'a>` — struct

Describes a group of bindings and the resources to be bound.

Fields:

- `label: Label<'a>` — Debug label of the bind group. This will show up in graphics debuggers for easy identification.
- `layout: &'a BindGroupLayout` — The [`BindGroupLayout`] that corresponds to this bind group.
- `entries: &'a [BindGroupEntry<'a>]` — The resources to bind to this bind group.

Implements: `Clone`, `Debug`

### BindGroupEntry`<'a>` — struct

An element of a [`BindGroupDescriptor`], consisting of a bindable resource and the slot to bind it to.

Fields:

- `binding: u32` — Slot for which binding provides resource. Corresponds to an entry of the same binding index in the [`BindGroupLayoutDescriptor`].
- `resource: BindingResource<'a>` — Resource to attach to the binding

Implements: `Clone`, `Debug`

### BindGroupLayout — struct

Handle to a binding group layout.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### BindGroupLayoutDescriptor`<'a>` — struct

Describes a [`BindGroupLayout`].

Fields:

- `label: Label<'a>` — Debug label of the bind group layout. This will show up in graphics debuggers for easy identification.
- `entries: &'a [BindGroupLayoutEntry]` — Array of entries in this BindGroupLayout

Implements: `Clone`, `Debug`

### BindGroupLayoutEntry — struct

Describes a single binding inside a bind group.

Fields:

- `binding: u32` — Binding index. Must match shader index and be unique inside a `BindGroupLayout`. A binding of index 1, would be described as `@group(0) @binding(1)` in shaders.
- `visibility: ShaderStages` — Which shader stages can see this binding.
- `ty: BindingType` — The type of the binding
- `count: Option<core::num::NonZeroU32>` — If the binding is an array of multiple resources. Corresponds to `binding_array<T>` in the shader.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BindingResource`<'a>` — enum _[non_exhaustive]_

Resource to be bound by a [`BindGroup`] for use with a pipeline.

Variants (9):

- `Buffer(BufferBinding<'a>)` — Binding is backed by a buffer.
- `BufferArray(&'a [BufferBinding<'a>])` — Binding is backed by an array of buffers.
- `Sampler(&'a Sampler)` — Binding is a sampler.
- `SamplerArray(&'a [&'a Sampler])` — Binding is backed by an array of samplers.
- `TextureView(&'a TextureView)` — Binding is backed by a texture.
- `TextureViewArray(&'a [&'a TextureView])` — Binding is backed by an array of textures.
- `AccelerationStructure(&'a Tlas)` — Binding is backed by a top level acceleration structure
- `AccelerationStructureArray(&'a [&'a Tlas])` — Binding is backed by an array of top level acceleration structures.
- `ExternalTexture(&'a ExternalTexture)` — Binding is backed by an external texture.

Implements: `Clone`, `Debug`, `TryFrom<BufferSlice<'a>>`

### BindingType — enum

Type of a binding in a [bind group layout][`BindGroupLayoutEntry`].

Variants (6):

- `Buffer { ty: BufferBindingType, has_dynamic_offset: bool, min_binding_size: Option<BufferSize> }` — A buffer binding.
- `Sampler(SamplerBindingType)` — A sampler that can be used to sample a texture.
- `Texture { sample_type: TextureSampleType, view_dimension: TextureViewDimension, multisampled: bool }` — A texture binding.
- `StorageTexture { access: StorageTextureAccess, format: TextureFormat, view_dimension: TextureViewDimension }` — A storage texture.
- `AccelerationStructure { vertex_return: bool }` — A ray-tracing acceleration structure binding.
- `ExternalTexture` — An external texture binding.

Methods and constants:

- `fn has_dynamic_offset(&self) -> bool` — Returns true for buffer bindings with dynamic offset enabled. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BufferBinding`<'a>` — struct

Describes the segment of a buffer to bind.

Fields:

- `buffer: &'a Buffer` — The buffer to bind.
- `offset: BufferAddress` — Base offset of the buffer, in bytes.
- `size: Option<BufferSize>` — Size of the binding in bytes, or `None` for using the rest of the buffer.

Implements: `Clone`, `Debug`, `TryFrom<BufferSlice<'a>>`

### BufferBindingType — enum

Specific type of a buffer binding.

Variants (2):

- `Uniform` — A buffer for uniform values.
- `Storage { read_only: bool }` — A storage buffer.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### CompilationInfo — struct

Compilation information for a shader module.

Fields:

- `messages: alloc::vec::Vec<CompilationMessage>` — The messages from the shader compilation process.

Implements: `Clone`, `Debug`, `From<CreateShaderModuleError>`, `From<ShaderError<ParseError>>`, `From<ShaderError<WithSpan<ValidationError>>>`

### CompilationMessage — struct

A single message from the shader compilation process.

Fields:

- `message: alloc::string::String` — The text of the message.
- `message_type: CompilationMessageType` — The type of the message.
- `location: Option<SourceLocation>` — Where in the source code the message points at.

Implements: `Clone`, `Debug`

### CompilationMessageType — enum

The type of a compilation message.

Variants (3):

- `Error` — An error message.
- `Warning` — A warning message.
- `Info` — An informational message.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### ComputePipeline — struct

Handle to a compute pipeline.

Opaque (private fields).

Methods and constants:

- `fn get_bind_group_layout(&self, index: u32) -> BindGroupLayout` — Get an object representing the bind group layout at a given index.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### ComputePipelineDescriptor`<'a>` — struct

Describes a compute pipeline.

Fields:

- `label: Label<'a>` — Debug label of the pipeline. This will show up in graphics debuggers for easy identification.
- `layout: Option<&'a PipelineLayout>` — The layout of bind groups for this pipeline.
- `module: &'a ShaderModule` — The compiled shader module for this stage.
- `entry_point: Option<&'a str>` — The name of the entry point in the compiled shader to use.
- `compilation_options: PipelineCompilationOptions<'a>` — Advanced options for when this pipeline is compiled
- `cache: Option<&'a PipelineCache>` — The pipeline cache to use when creating this pipeline.

Implements: `Clone`, `Debug`

### FragmentState`<'a>` — struct

Describes the fragment processing in a render pipeline.

Fields:

- `module: &'a ShaderModule` — The compiled shader module for this stage.
- `entry_point: Option<&'a str>` — The name of the entry point in the compiled shader to use.
- `compilation_options: PipelineCompilationOptions<'a>` — Advanced options for when this pipeline is compiled
- `targets: &'a [Option<ColorTargetState>]` — The color state of the render targets.

Implements: `Clone`, `Debug`

### MeshPipelineDescriptor`<'a>` — struct

Describes a mesh shader (graphics) pipeline.

Fields:

- `label: Label<'a>` — Debug label of the pipeline. This will show up in graphics debuggers for easy identification.
- `layout: Option<&'a PipelineLayout>` — The layout of bind groups for this pipeline.
- `task: Option<TaskState<'a>>` — The mesh pipeline's task shader.
- `mesh: MeshState<'a>` — The compiled mesh stage and its entry point
- `primitive: PrimitiveState` — The properties of the pipeline at the primitive assembly and rasterization level.
- `depth_stencil: Option<DepthStencilState>` — The effect of draw calls on the depth and stencil aspects of the output target, if any.
- `multisample: MultisampleState` — The multi-sampling properties of the pipeline.
- `fragment: Option<FragmentState<'a>>` — The compiled fragment stage, its entry point, and the color targets.
- `multiview: Option<core::num::NonZeroU32>` — If the pipeline will be used with a multiview render pass, this indicates how many array layers the attachments will have.
- `cache: Option<&'a PipelineCache>` — The pipeline cache to use when creating this pipeline.

Implements: `Clone`, `Debug`

### MeshState`<'a>` — struct

Describes the mesh shader stage in a mesh shader pipeline.

Fields:

- `module: &'a ShaderModule` — The compiled shader module for this stage.
- `entry_point: Option<&'a str>` — The name of the entry point in the compiled shader to use.
- `compilation_options: PipelineCompilationOptions<'a>` — Advanced options for when this pipeline is compiled

Implements: `Clone`, `Debug`

### PassthroughShaderEntryPoint`<'a>` — struct

Describes a single entry point in a passthrough shader descriptor.

Fields:

- `name: alloc::borrow::Cow<'a, str>` — The name of the entry point. Only used in validation and for GLSL or DXIL.
- `workgroup_size: (u32, u32, u32)` — Number of workgroups in each dimension x, y and z. Only used for metal with compute-like shader stages.

Implements: `Clone`, `Debug`

### PipelineCache — struct

Handle to a pipeline cache, which is used to accelerate creating [`RenderPipeline`]s and [`ComputePipeline`]s in subsequent executions

Opaque (private fields).

Methods and constants:

- `fn get_data(&self) -> Option<Vec<u8>>` — Get the data associated with this pipeline cache. The data format is an implementation detail of `wgpu`. The only defined operation on this data setting it as the `data` field on [`PipelineCacheDescriptor`], then to [`D…

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### PipelineCacheDescriptor`<'a>` — struct

Describes a pipeline cache, which allows reusing compilation work between program runs.

Fields:

- `label: Label<'a>` — Debug label of the pipeline cache. This might show up in some logs from `wgpu`
- `data: Option<&'a [u8]>` — The data used to initialise the cache initialise
- `fallback: bool` — Whether to create a cache without data when the provided data is invalid.

Implements: `Clone`, `Debug`

### PipelineCompilationOptions`<'a>` — struct

Advanced options for use when a pipeline is compiled

Fields:

- `constants: &'a [(&'a str, f64)]` — Specifies the values of pipeline-overridable constants in the shader module.
- `zero_initialize_workgroup_memory: bool` — Whether workgroup scoped memory will be initialized with zero values for this stage.

Implements: `Clone`, `Debug`, `Default`

### PipelineLayout — struct

Handle to a pipeline layout.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### PipelineLayoutDescriptor`<'a>` — struct

Describes a [`PipelineLayout`].

Fields:

- `label: Label<'a>` — Debug label of the pipeline layout. This will show up in graphics debuggers for easy identification.
- `bind_group_layouts: &'a [Option<&'a BindGroupLayout>]` — Bind groups that this pipeline uses. The first entry will provide all the bindings for "set = 0", second entry will provide all the bindings for "set = 1" etc.
- `immediate_size: u32` — The number of bytes of immediate data that are allocated for use in the shader. The `var<immediate>`s in the shader attached to this pipeline must be equal or smaller than this si…

Implements: `Clone`, `Debug`, `Default`

### RenderPipeline — struct

Handle to a rendering (graphics) pipeline.

Opaque (private fields).

Methods and constants:

- `fn get_bind_group_layout(&self, index: u32) -> BindGroupLayout` — Get an object representing the bind group layout at a given index.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### RenderPipelineDescriptor`<'a>` — struct

Describes a render (graphics) pipeline.

Fields:

- `label: Label<'a>` — Debug label of the pipeline. This will show up in graphics debuggers for easy identification.
- `layout: Option<&'a PipelineLayout>` — The layout of bind groups for this pipeline.
- `vertex: VertexState<'a>` — The compiled vertex stage, its entry point, and the input buffers layout.
- `primitive: PrimitiveState` — The properties of the pipeline at the primitive assembly and rasterization level.
- `depth_stencil: Option<DepthStencilState>` — The effect of draw calls on the depth and stencil aspects of the output target, if any.
- `multisample: MultisampleState` — The multi-sampling properties of the pipeline.
- `fragment: Option<FragmentState<'a>>` — The compiled fragment stage, its entry point, and the color targets.
- `multiview_mask: Option<core::num::NonZeroU32>` — If the pipeline will be used with a multiview render pass, this indicates what multiview mask the render pass will be used with. The masks must match exactly.
- `cache: Option<&'a PipelineCache>` — The pipeline cache to use when creating this pipeline.

Implements: `Clone`, `Debug`

### SamplerBindingType — enum

Specific type of a sampler binding.

Variants (3):

- `Filtering` — The sampling result is produced based on more than a single color sample from a texture, e.g. when bilinear interpolation is enabled.
- `NonFiltering` — The sampling result is produced based on a single color sample from a texture.
- `Comparison` — Use as a comparison sampler instead of a normal sampler. For more info take a look at the analogous functionality in OpenGL: <https://www.khronos.org/opengl/wiki/Sampler_Object#Comparison_mode>.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ShaderModule — struct

Handle to a compiled shader module.

Opaque (private fields).

Methods and constants:

- `fn get_compilation_info(&self) -> impl Future<Output = CompilationInfo> + WasmNotSend` — Get the compilation info for the shader module.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### ShaderModuleDescriptor`<'a>` — struct

Descriptor for use with [`Device::create_shader_module`].

Fields:

- `label: Label<'a>` — Debug label of the shader module. This will show up in graphics debuggers for easy identification.
- `source: ShaderSource<'a>` — Source code for the shader.

Implements: `Clone`, `Debug`

### ShaderModuleDescriptorPassthrough — type alias

`type ShaderModuleDescriptorPassthrough = CreateShaderModuleDescriptorPassthrough<'a, Label<'a>>`

Descriptor for a shader module given by any of several sources. These shaders are passed through directly to the underlying api. At least one shader type that may be used by the backend must be `Some` or a panic is raised.

Fields:

- `label: L` — Debug label of the shader module. This will show up in graphics debuggers for easy identification.
- `entry_points: alloc::borrow::Cow<'a, [PassthroughShaderEntryPoint<'a>]>` — The list of entry points and their corresponding workgroup sizes.
- `spirv: Option<alloc::borrow::Cow<'a, [u32]>>` — Binary SPIR-V data, in 4-byte words.
- `dxil: Option<alloc::borrow::Cow<'a, [u8]>>` — Shader DXIL source.
- `hlsl: Option<alloc::borrow::Cow<'a, str>>` — Shader HLSL source.
- `metallib: Option<alloc::borrow::Cow<'a, [u8]>>` — Shader MetalLib source.
- `msl: Option<alloc::borrow::Cow<'a, str>>` — Shader MSL source.
- `glsl: Option<alloc::borrow::Cow<'a, str>>` — Shader GLSL source (currently unused).
- `wgsl: Option<alloc::borrow::Cow<'a, str>>` — Shader WGSL source.

Methods and constants:

- `fn map_label<K>(&self, fun: impl FnOnce(&L) -> K) -> CreateShaderModuleDescriptorPassthrough<'a, K>` — Takes a closure and maps the label of the shader module descriptor into another.

Implements: `Clone`, `Debug`, `Default`

### ShaderRuntimeChecks — struct

Describes how shader bound checks should be performed.

Fields:

- `bounds_checks: bool` — Enforce bounds checks in shaders, even if the underlying driver doesn't support doing so natively.
- `force_loop_bounding: bool` — If false, the caller MUST ensure that all passed shaders do not contain any infinite loops.
- `ray_query_initialization_tracking: bool` — If false, the caller **MUST** ensure that in all passed shaders every function operating on a ray query must obey these rules (functions using wgsl naming) - `rayQueryInitialize`…
- `task_shader_dispatch_tracking: bool` — If false, task shaders will not validate that the mesh shader grid they dispatch is within legal limits.
- `mesh_shader_primitive_indices_clamp: bool` — If false, mesh shaders won't clamp the output primitives' vertex indices, which can lead to undefined behavior and arbitrary memory access.
- `int_div_checks: bool` — If false, integer division and modulo operations will use raw instructions without guards against division by zero or signed integer overflow (`INT_MIN / -1`). The caller **MUST**…

Methods and constants:

- `const fn checked() -> Self` — Creates a new configuration where the shader is fully checked. _[must_use]_
- `const fn unchecked() -> Self` — Creates a new configuration where none of the checks are performed. _[must_use]_
- `const unsafe fn all(all_checks: bool) -> Self` — Creates a new configuration where all checks are enabled or disabled. To safely create a configuration with all checks enabled, use [`ShaderRuntimeChecks::checked`]. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`

### ShaderSource`<'a>` — enum _[non_exhaustive]_

Source of a shader module.

Variants (1):

- `Wgsl(alloc::borrow::Cow<'a, str>)` — WGSL module as a string slice.

Implements: `Clone`, `Debug`

### ShaderStages — struct

Describes the shader stages that a binding will be visible from.

Opaque (private fields).

Methods and constants:

- `const NONE: Self` — Binding is not visible from any shader stage.
- `const VERTEX: Self` — Binding is visible from the vertex shader of a render pipeline.
- `const FRAGMENT: Self` — Binding is visible from the fragment shader of a render pipeline.
- `const COMPUTE: Self` — Binding is visible from the compute shader of a compute pipeline.
- `const VERTEX_FRAGMENT: Self` — Binding is visible from the vertex and fragment shaders of a render pipeline.
- `const TASK: Self` — Binding is visible from the task shader of a mesh pipeline.
- `const MESH: Self` — Binding is visible from the mesh shader of a mesh pipeline.
- `const RAY_GENERATION: Self` — Binding is visible from the ray generation shader of a ray tracing pipeline.
- `const ANY_HIT: Self` — Binding is visible from the ray any hit shader of a ray tracing pipeline.
- `const CLOSEST_HIT: Self` — Binding is visible from the ray closest hit shader of a ray tracing pipeline.
- `const MISS: Self` — Binding is visible from the ray miss shader of a ray tracing pipeline.
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
- `const fn iter(&self) -> $crate::iter::Iter<ShaderStages>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<ShaderStages>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<ShaderStages>`, `Flags`, `FromIterator<ShaderStages>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### SourceLocation — struct

A human-readable representation for a span, tailored for text source.

Fields:

- `line_number: u32` — 1-based line number.
- `line_position: u32` — 1-based column in code units (in bytes) of the start of the span. Remember to convert accordingly when displaying to the user.
- `offset: u32` — 0-based Offset in code units (in bytes) of the start of the span.
- `length: u32` — Length in code units (in bytes) of the span.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<SourceLocation>`, `PartialEq`, `StructuralPartialEq`

### TaskState`<'a>` — struct

Describes the task shader stage in a mesh shader pipeline.

Fields:

- `module: &'a ShaderModule` — The compiled shader module for this stage.
- `entry_point: Option<&'a str>` — The name of the task shader entry point in the shader module to use.
- `compilation_options: PipelineCompilationOptions<'a>` — Advanced options for when this pipeline is compiled.

Implements: `Clone`, `Debug`

### VertexAttribute — struct

Vertex inputs (attributes) to shaders.

Fields:

- `format: nt::VertexFormat` — Format of the input
- `offset: BufferAddress` — Byte offset of the start of the input
- `shader_location: ShaderLocation` — Location for this input. Must match the location in the shader.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### VertexBufferLayout`<'a>` — struct

Specifies an interpretation of the bytes of a vertex buffer as vertex attributes.

Fields:

- `array_stride: BufferAddress` — The stride, in bytes, between elements of this buffer (between vertices).
- `step_mode: VertexStepMode` — How often this vertex buffer is "stepped" forward.
- `attributes: &'a [VertexAttribute]` — The list of attributes which comprise a single vertex.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### VertexState`<'a>` — struct

Describes the vertex processing in a render pipeline.

Fields:

- `module: &'a ShaderModule` — The compiled shader module for this stage.
- `entry_point: Option<&'a str>` — The name of the entry point in the compiled shader to use.
- `compilation_options: PipelineCompilationOptions<'a>` — Advanced options for when this pipeline is compiled
- `buffers: &'a [Option<VertexBufferLayout<'a>>]` — The format of any vertex buffers used with this pipeline via [`RenderPass::set_vertex_buffer()`].

Implements: `Clone`, `Debug`

### VertexStepMode — enum

Whether a vertex buffer is indexed by vertex or by instance.

Variants (2):

- `Vertex = 0` — Vertex data is advanced every vertex.
- `Instance = 1` — Vertex data is advanced every instance.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`
