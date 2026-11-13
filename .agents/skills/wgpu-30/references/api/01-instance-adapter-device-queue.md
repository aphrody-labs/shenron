# wgpu 30.0.1 API map — Instance, adapter, device, queue

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 73 public items.

### Adapter — struct

Handle to a physical graphics and/or compute device.

Opaque (private fields).

Methods and constants:

- `fn request_device(&self, desc: &DeviceDescriptor<'_>) -> impl Future<Output = Result<(Device, Queue), RequestDeviceError>> + WasmNotSend` — Requests a connection to a physical device, creating a logical device.
- `unsafe fn create_device_from_hal<A: hal::Api>(&self, hal_device: hal::OpenDevice<A>, desc: &DeviceDescriptor<'_>) -> Result<(Device, Queue), RequestDeviceError>` — Create a wgpu [`Device`] and [`Queue`] from a wgpu-hal [`hal::OpenDevice`].
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl Deref<Target = <A as >::Adapter> + WasmNotSendSync>` — Get the [`wgpu_hal`] adapter from this `Adapter`.
- `fn is_surface_supported(&self, surface: &Surface<'_>) -> bool` — Returns whether this adapter may present to the passed surface.
- `fn features(&self) -> Features` — The features which can be used to create devices on this adapter.
- `fn limits(&self) -> Limits` — The best limits which can be used to create devices on this adapter.
- `fn get_info(&self) -> AdapterInfo` — Get info about the adapter itself.
- `fn get_downlevel_capabilities(&self) -> DownlevelCapabilities` — Get info about the adapter itself.
- `fn get_texture_format_features(&self, format: TextureFormat) -> TextureFormatFeatures` — Returns the features supported for a given texture format by this adapter.
- `fn get_presentation_timestamp(&self) -> PresentationTimestamp` — Generates a timestamp using the clock used by the presentation engine.
- `fn cooperative_matrix_properties(&self) -> Vec<CooperativeMatrixProperties>` — Returns the supported cooperative matrix configurations for this adapter.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### AdapterInfo — struct

Information about an adapter.

Fields:

- `name: alloc::string::String` — Adapter name
- `vendor: u32` — [`Backend`]-specific vendor ID of the adapter
- `device: u32` — [`Backend`]-specific device ID of the adapter
- `device_type: DeviceType` — Type of device
- `device_pci_bus_id: alloc::string::String` — [`Backend`]-specific PCI bus ID of the adapter.
- `driver: alloc::string::String` — Driver name
- `driver_info: alloc::string::String` — Driver info
- `backend: Backend` — Backend used for device
- `subgroup_min_size: u32` — Minimum possible size of a subgroup on this adapter. Will never be lower than [`crate::MINIMUM_SUBGROUP_MIN_SIZE`].
- `subgroup_max_size: u32` — Maximum possible size of a subgroup on this adapter. Will never be higher than [`crate::MAXIMUM_SUBGROUP_MAX_SIZE`].
- `transient_saves_memory: Option<bool>` — Whether adding [`TextureUsages::TRANSIENT_ATTACHMENT`] to a texture will decrease memory usage. This is None on web, which means it is unknown from the adapter.
- `limit_bucket: Option<AdapterLimitBucketInfo>` — If limit bucketing was requested, contains the name of the applied bucket and the original capabilities of the adapter.

Methods and constants:

- `const fn new(device_type: DeviceType, backend: Backend) -> Self` — Create a new `AdapterInfo` with the given device type and backend.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### align_to — function

`fn util::align_to<T: AlignTo>(value: T, alignment: T) -> T`

Aligns a `value` to an `alignment`.

### AlignTo — trait

Trait for adjusting integers to the next multiple of an alignment.

Items:

- `fn align_to(self, alignment: Self) -> Self` — Aligns `self` to `alignment`.

### AllocatorReport — struct

A report that can be generated for informational purposes using `Allocator::generate_report()`.

Fields:

- `allocations: alloc::vec::Vec<AllocationReport>` — All live allocations, sub-allocated from memory blocks.
- `blocks: alloc::vec::Vec<MemoryBlockReport>` — All memory blocks.
- `total_allocated_bytes: u64` — Sum of the memory used by all allocations, in bytes.
- `total_reserved_bytes: u64` — Sum of the memory reserved by all memory blocks including unallocated regions, in bytes.

Implements: `Clone`, `Debug`

### Backend — enum

Backends supported by wgpu.

Variants (6):

- `Noop = 0` — Dummy backend, which may be used for testing.
- `Vulkan = 1` — Vulkan API (Windows, Linux, Android, MacOS via `vulkan-portability`/MoltenVK)
- `Metal = 2` — Metal API (Apple platforms)
- `Dx12 = 3` — Direct3D-12 (Windows)
- `Gl = 4` — OpenGL 3.3+ (Windows), OpenGL ES 3.0+ (Linux, Android, MacOS via Angle), and WebGL2
- `BrowserWebGpu = 5` — WebGPU in the browser

Methods and constants:

- `const ALL: [Backend; 6]` — Array of all [`Backend`] values, corresponding to [`Backends::all()`].
- `const fn to_str(self) -> &'static str` — Returns the string name of the backend. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Display`, `Eq`, `From<Backend>`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BackendOptions — struct

Options that are passed to a given backend.

Fields:

- `gl: GlBackendOptions` — Options for the OpenGL/OpenGLES backend, [`Backend::Gl`].
- `dx12: Dx12BackendOptions` — Options for the DX12 backend, [`Backend::Dx12`].
- `noop: NoopBackendOptions` — Options for the noop backend, [`Backend::Noop`].

Methods and constants:

- `fn from_env_or_default() -> Self` — Choose backend options by calling `from_env` on every field. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given options, modifies them based on the environment variables, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### Backends — struct

Represents the backends that wgpu will use.

Opaque (private fields).

Methods and constants:

- `const NOOP: Self` — [`Backend::Noop`].
- `const VULKAN: Self` — [`Backend::Vulkan`]. Supported on Windows, Linux/Android, and macOS/iOS via Vulkan Portability (with the Vulkan feature enabled)
- `const GL: Self` — [`Backend::Gl`]. Supported on Linux/Android, the web through webassembly via WebGL, and Windows and macOS/iOS via ANGLE
- `const METAL: Self` — [`Backend::Metal`]. Supported on macOS and iOS.
- `const DX12: Self` — [`Backend::Dx12`]. Supported on Windows 10 and later
- `const BROWSER_WEBGPU: Self` — [`Backend::BrowserWebGpu`]. Supported when targeting the web through WebAssembly with the `webgpu` feature enabled.
- `const PRIMARY: Self` — All the apis that wgpu offers first tier of support for.
- `const SECONDARY: Self` — All the apis that wgpu offers second tier of support for. These may be unsupported/still experimental.
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
- `const fn iter(&self) -> $crate::iter::Iter<Backends>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<Backends>` — Yield a set of contained named flags values.
- `fn from_env() -> Option<Self>` — Gets a set of backends from the environment variable `WGPU_BACKEND`.
- `fn with_env(&self) -> Self` — Takes the given options, modifies them based on the `WGPU_BACKEND` environment variable, and returns the result.
- `fn from_comma_list(string: &str) -> Self` — Generates a set of backends from a comma separated list of case-insensitive backend names.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<Backends>`, `Flags`, `From<Backend>`, `FromIterator<Backends>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### BufferAddress — type alias

`type BufferAddress = u64`

Integral type used for [`Buffer`] offsets and sizes.

### BufferSize — type alias

`type BufferSize = core::num::NonZeroU64`

Integral type used for [`BufferSlice`] sizes.

### Color — struct

RGBA double precision color.

Fields:

- `r: f64` — Red component of the color
- `g: f64` — Green component of the color
- `b: f64` — Blue component of the color
- `a: f64` — Alpha component of the color

Methods and constants:

- `const TRANSPARENT: Self`
- `const BLACK: Self`
- `const WHITE: Self`
- `const RED: Self`
- `const GREEN: Self`
- `const BLUE: Self`

Implements: `Clone`, `Copy`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### CommandBufferDescriptor`<L>` — struct

Describes a [`CommandBuffer`](../wgpu/struct.CommandBuffer.html).

Fields:

- `label: L` — Debug label of this command buffer.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> CommandBufferDescriptor<K>` — Takes a closure and maps the label of the command buffer descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### CooperativeMatrixProperties — struct

Describes a supported cooperative matrix configuration.

Fields:

- `m_size: u32` — Number of rows in matrices A and C (M dimension)
- `n_size: u32` — Number of columns in matrices B and C (N dimension)
- `k_size: u32` — Number of columns in A / rows in B (K dimension)
- `ab_type: CooperativeScalarType` — Element type for input matrices A and B
- `cr_type: CooperativeScalarType` — Element type for accumulator matrix C and the result
- `saturating_accumulation: bool` — Whether saturating accumulation is supported.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### CooperativeScalarType — enum

The underlying scalar type of the cooperative matrix component.

Variants (4):

- `F32` — 32-bit floating point.
- `F16` — 16-bit floating point.
- `I32` — 32-bit signed integer.
- `U32` — 32-bit unsigned integer.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### COPY_BUFFER_ALIGNMENT — constant

`const COPY_BUFFER_ALIGNMENT: BufferAddress = 4`

Buffer to buffer copy as well as buffer clear offsets and sizes must be aligned to this number.

### COPY_BYTES_PER_ROW_ALIGNMENT — constant

`const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256`

Buffer-texture copies must have [`bytes_per_row`] aligned to this number.

### CoreCounters — struct

`wgpu-core`'s part of [`InternalCounters`].

Implements: `Clone`, `Debug`, `Default`

### Device — struct

Open connection to a graphics and/or compute device.

Opaque (private fields).

Methods and constants:

- `fn poll(&self, poll_type: PollType) -> Result<PollStatus, PollError>` — Check for resource cleanups and mapping callbacks. Will block if [`PollType::Wait`] is passed.
- `fn features(&self) -> Features` — The [features][Features] which can be used on this device. _[must_use]_
- `fn limits(&self) -> Limits` — The limits which can be used on this device. _[must_use]_
- `fn adapter_info(&self) -> AdapterInfo` — Get info about the adapter that this device was created from.
- `fn create_shader_module(&self, desc: ShaderModuleDescriptor<'_>) -> ShaderModule` — Creates a shader module. _[must_use]_
- `unsafe fn create_shader_module_unchecked(&self, desc: ShaderModuleDescriptor<'_>) -> ShaderModule` — Deprecated: Use [`create_shader_module_trusted`][csmt] instead. _[must_use; deprecated: Use `Device::create_shader_module_trusted(desc, wgpu::ShaderRuntimeChecks::unchecked())` instead.]_
- `unsafe fn create_shader_module_trusted(&self, desc: ShaderModuleDescriptor<'_>, runtime_checks: ShaderRuntimeChecks) -> ShaderModule` — Creates a shader module with flags to dictate runtime checks. _[must_use]_
- `unsafe fn create_shader_module_passthrough(&self, desc: ShaderModuleDescriptorPassthrough<'_>) -> ShaderModule` — Creates a shader module which will bypass wgpu's shader tooling and validation and be used directly by the backend. _[must_use]_
- `fn create_command_encoder(&self, desc: &CommandEncoderDescriptor<'_>) -> CommandEncoder` — Creates an empty [`CommandEncoder`]. _[must_use]_
- `fn create_render_bundle_encoder<'a>(&self, desc: &RenderBundleEncoderDescriptor<'_>) -> RenderBundleEncoder<'a>` — Creates an empty [`RenderBundleEncoder`]. _[must_use]_
- `fn create_bind_group(&self, desc: &BindGroupDescriptor<'_>) -> BindGroup` — Creates a new [`BindGroup`]. _[must_use]_
- `fn create_bind_group_layout(&self, desc: &BindGroupLayoutDescriptor<'_>) -> BindGroupLayout` — Creates a [`BindGroupLayout`]. _[must_use]_
- `fn create_pipeline_layout(&self, desc: &PipelineLayoutDescriptor<'_>) -> PipelineLayout` — Creates a [`PipelineLayout`]. _[must_use]_
- `fn create_render_pipeline(&self, desc: &RenderPipelineDescriptor<'_>) -> RenderPipeline` — Creates a [`RenderPipeline`]. _[must_use]_
- `fn create_mesh_pipeline(&self, desc: &MeshPipelineDescriptor<'_>) -> RenderPipeline` — Creates a mesh shader based [`RenderPipeline`]. _[must_use]_
- `fn create_compute_pipeline(&self, desc: &ComputePipelineDescriptor<'_>) -> ComputePipeline` — Creates a [`ComputePipeline`]. _[must_use]_
- `fn create_buffer(&self, desc: &BufferDescriptor<'_>) -> Buffer` — Creates a [`Buffer`]. _[must_use]_
- `fn create_texture(&self, desc: &TextureDescriptor<'_>) -> Texture` — Creates a new [`Texture`]. _[must_use]_
- `unsafe fn create_texture_from_hal<A: hal::Api>(&self, hal_texture: <A as >::Texture, desc: &TextureDescriptor<'_>, initial_state: TextureUses) -> Texture` — Creates a [`Texture`] from a wgpu-hal Texture. _[must_use]_
- `fn create_external_texture(&self, desc: &ExternalTextureDescriptor<'_>, planes: &[&TextureView]) -> ExternalTexture` — Creates a new [`ExternalTexture`]. _[must_use]_
- `unsafe fn create_buffer_from_hal<A: hal::Api>(&self, hal_buffer: <A as >::Buffer, desc: &BufferDescriptor<'_>) -> Buffer` — Creates a [`Buffer`] from a wgpu-hal Buffer. _[must_use]_
- `fn create_sampler(&self, desc: &SamplerDescriptor<'_>) -> Sampler` — Creates a new [`Sampler`]. _[must_use]_
- `fn create_query_set(&self, desc: &QuerySetDescriptor<'_>) -> QuerySet` — Creates a new [`QuerySet`]. _[must_use]_
- `fn on_uncaptured_error(&self, handler: Arc<dyn UncapturedErrorHandler>)` — Set a callback which will be called for all errors that are not handled in error scopes.
- `fn push_error_scope(&self, filter: ErrorFilter) -> ErrorScopeGuard` — Push an error scope on this device's thread-local error scope stack. All operations on this device, or on resources created from this device, will have their errors captured by this scope until the scope is popped.
- `unsafe fn start_graphics_debugger_capture(&self)` — Starts a capture in the attached graphics debugger.
- `unsafe fn stop_graphics_debugger_capture(&self)` — Stops the current capture in the attached graphics debugger.
- `fn get_internal_counters(&self) -> InternalCounters` — Query internal counters from the native backend for debugging purposes. _[must_use]_
- `fn generate_allocator_report(&self) -> Option<AllocatorReport>` — Generate an GPU memory allocation report if the underlying backend supports it. _[must_use]_
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl Deref<Target = <A as >::Device> + WasmNotSendSync>` — Get the [`wgpu_hal`] device from this `Device`.
- `fn destroy(&self)` — Destroy this device.
- `fn set_device_lost_callback(&self, callback: impl Fn(DeviceLostReason, String) + Send + 'static)` — Set a DeviceLostCallback on this device.
- `unsafe fn create_pipeline_cache(&self, desc: &PipelineCacheDescriptor<'_>) -> PipelineCache` — Create a [`PipelineCache`] with initial data _[must_use]_
- `fn create_blas(&self, desc: &CreateBlasDescriptor<'_>, sizes: BlasGeometrySizeDescriptors) -> Blas` — Create a bottom level acceleration structure, used inside a top level acceleration structure for ray tracing. - `desc`: The descriptor of the acceleration structure. - `sizes`: Size descriptor limiting what can be built… _[must_use]_
- `fn create_tlas(&self, desc: &CreateTlasDescriptor<'_>) -> Tlas` — Create a top level acceleration structure, used for ray tracing. - `desc`: The descriptor of the acceleration structure. _[must_use]_

Implements: `Clone`, `Debug`, `DeviceExt`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### DeviceDescriptor — type alias

`type DeviceDescriptor = DeviceDescriptor<Label<'a>>`

Describes a [`Device`](../wgpu/struct.Device.html).

Fields:

- `label: L` — Debug label for the device.
- `required_features: Features` — Specifies the features that are required by the device request. The request will fail if the adapter cannot provide these features.
- `required_limits: Limits` — Specifies the limits that are required by the device request. The request will fail if the adapter cannot provide these limits.
- `experimental_features: ExperimentalFeatures` — Specifies whether `self.required_features` is allowed to contain experimental features.
- `memory_hints: MemoryHints` — Hints for memory allocation strategies.
- `trace: Trace` — Whether API tracing for debugging is enabled, and where the trace is written if so.

Methods and constants:

- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> DeviceDescriptor<K>` — Takes a closure and maps the label of the device descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### DeviceLostReason — enum

Corresponds to a [`GPUDeviceLostReason`].

Variants (2):

- `Unknown = 0` — The device was lost for an unspecific reason, including driver errors.
- `Destroyed = 1` — The device's `destroy` method was called.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### DeviceType — enum

Supported physical device types.

Variants (5):

- `Other` — Other or Unknown.
- `IntegratedGpu` — Integrated GPU with shared CPU/GPU memory.
- `DiscreteGpu` — Discrete GPU with separate CPU/GPU memory.
- `VirtualGpu` — Virtual / Hosted.
- `Cpu` — Cpu / Software Rendering.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Dx12BackendOptions — struct

Configuration for the DX12 backend.

Fields:

- `shader_compiler: Dx12Compiler` — Which DX12 shader compiler to use.
- `presentation_system: Dx12SwapchainKind` — Presentation system to use.
- `latency_waitable_object: Dx12UseFrameLatencyWaitableObject` — Whether to wait for the latency waitable object before acquiring the next swapchain image.
- `force_shader_model: ForceShaderModelToken` — For use with passthrough shaders. Expose features as if this shader model is present, even if you do not intend to ship DXC with your app.
- `agility_sdk: Option<Dx12AgilitySDK>` — Optional Agility SDK configuration for using the Independent Devices API.

Methods and constants:

- `fn from_env_or_default() -> Self` — Choose DX12 backend options by calling `from_env` on every field. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given options, modifies them based on the environment variables, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### Dx12Compiler — enum

Selects which DX12 shader compiler to use.

Variants (4):

- `Fxc` — The Fxc compiler (default) is old, slow and unmaintained.
- `DynamicDxc { dxc_path: alloc::string::String }` — The Dxc compiler is new, fast and maintained.
- `StaticDxc` — The statically-linked variant of Dxc.
- `Auto` — Use statically-linked DXC if available. Otherwise check for dynamically linked DXC on the PATH. Finally, fallback to FXC.

Methods and constants:

- `fn default_dynamic_dxc() -> Self` — Helper function to construct a `DynamicDxc` variant with default paths.
- `fn from_env() -> Option<Self>` — Choose which DX12 shader compiler to use from the environment variable `WGPU_DX12_COMPILER`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given compiler, modifies it based on the `WGPU_DX12_COMPILER` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `FromStr`

### Dx12SwapchainKind — enum

Selects which kind of swapchain to use on DX12.

Variants (2):

- `DxgiFromHwnd` — Use a DXGI swapchain made directly from the window's HWND.
- `DxgiFromVisual` — Use a DXGI swapchain made from a DirectComposition visual made automatically from the window's HWND.

Methods and constants:

- `fn from_env() -> Option<Self>` — Choose which presentation system to use from the environment variable `WGPU_DX12_PRESENTATION_SYSTEM`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given presentation system, modifies it based on the `WGPU_DX12_PRESENTATION_SYSTEM` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### Dx12UseFrameLatencyWaitableObject — enum

Whether and how to use a waitable handle obtained from `GetFrameLatencyWaitableObject`.

Variants (3):

- `None` — Do not obtain a waitable handle and do not wait for it. The swapchain will be created without the `DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT` flag.
- `Wait` — Obtain a waitable handle and wait for it before acquiring the next swapchain image.
- `DontWait` — Create the swapchain with the `DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT` flag and obtain a waitable handle, but do not wait for it before acquiring the next swapchain image. This is useful…

Methods and constants:

- `fn from_env() -> Option<Self>` — Choose whether to use a frame latency waitable object from the environment variable `WGPU_DX12_USE_FRAME_LATENCY_WAITABLE_OBJECT`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given setting, modifies it based on the `WGPU_DX12_USE_FRAME_LATENCY_WAITABLE_OBJECT` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### DxcShaderModel — enum

DXC shader model.

Variants (10):

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

- `fn from_dxc_version(major: u32, minor: u32) -> Self` — Get the shader model supported by a certain DXC version.
- `fn from_parts(major: u32, minor: u32) -> Self` — Parse a DxcShaderModel from its version components.

Implements: `Clone`, `Debug`

### DynamicOffset — type alias

`type DynamicOffset = u32`

Integral type used for [dynamic bind group offsets](../wgpu/struct.RenderPass.html#method.set_bind_group).

### Error — enum

Errors resulting from usage of GPU APIs.

Variants (3):

- `OutOfMemory { source: ErrorSource }` — Out of memory.
- `Validation { source: ErrorSource, description: alloc::string::String }` — Validation error, signifying a bug in code or data provided to `wgpu`.
- `Internal { source: ErrorSource, description: alloc::string::String }` — Internal error. Used for signalling any failures not explicitly expected by WebGPU.

Implements: `Debug`, `Display`, `Error`

### ErrorFilter — enum

Kinds of [`Error`]s a [`Device::push_error_scope()`] may be configured to catch.

Variants (3):

- `OutOfMemory` — Catch only out-of-memory errors.
- `Validation` — Catch only validation errors.
- `Internal` — Catch only internal errors.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### ErrorScopeGuard — struct _[must_use]_

Guard for an error scope pushed with [`Device::push_error_scope()`].

Opaque (private fields).

Methods and constants:

- `fn pop(self) -> impl Future<Output = Option<Error>> + WasmNotSend` — Pops the error scope.

Implements: `Debug`, `Drop`

### ErrorSource — type alias

`type ErrorSource = alloc::boxed::Box<dyn error::Error + Send + Sync + 'static>`

Lower level source of the error.

### ExperimentalFeatures — struct

Token of the user agreeing to access experimental features.

Opaque (private fields).

Methods and constants:

- `const fn disabled() -> Self` — Uses of [`Features`] prefixed with "EXPERIMENTAL" are disallowed.
- `const unsafe fn enabled() -> Self` — Uses of [`Features`] prefixed with "EXPERIMENTAL" may result in undefined behavior when used incorrectly. The exact bounds of these issues varies by the feature. These instances are inherently bugs in our implementation…
- `const fn is_enabled(&self) -> bool` — Returns true if the user has agreed to access experimental features.

Implements: `Clone`, `Copy`, `Debug`, `Default`

### ForceShaderModelToken — struct

Used to force wgpu to expose certain features on passthrough shaders even when those features aren't present on runtime-compiled shaders

Opaque (private fields).

Methods and constants:

- `unsafe fn with_shader_model(sm: DxcShaderModel) -> Self` — Creates an unsafe token, opting you in to seeing features that you may not necessarily use on standard runtime-compiled shaders. # Safety Do not make use in runtime-compiled shaders of any features that may not be suppo…
- `fn get(&self) -> Option<DxcShaderModel>` — Returns the shader model version, if any, in this token.

Implements: `Clone`, `Debug`, `Default`

### GlBackendOptions — struct

Configuration for the OpenGL/OpenGLES backend.

Fields:

- `gles_minor_version: Gles3MinorVersion` — Which OpenGL ES 3 minor version to request, if using OpenGL ES.
- `fence_behavior: GlFenceBehavior` — Behavior of OpenGL fences. Affects how `on_completed_work_done` and `device.poll` behave.
- `debug_fns: GlDebugFns` — Controls whether debug functions (`glPushDebugGroup`, `glPopDebugGroup`, `glObjectLabel`, etc.) are enabled when supported by the driver.

Methods and constants:

- `fn from_env_or_default() -> Self` — Choose OpenGL backend options by calling `from_env` on every field. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given options, modifies them based on the environment variables, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### GlDebugFns — enum

Controls whether OpenGL debug functions are enabled.

Variants (3):

- `Auto` — Automatically decide whether to enable debug functions.
- `ForceEnabled` — Force enable debug functions if supported by the driver.
- `Disabled` — Disable debug functions entirely.

Methods and constants:

- `fn from_env() -> Option<Self>` — Choose debug functions setting from the environment variable `WGPU_GL_DEBUG_FNS`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given setting, modifies it based on the `WGPU_GL_DEBUG_FNS` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### Gles3MinorVersion — enum

Selects which OpenGL ES 3 minor version to request.

Variants (4):

- `Automatic` — No explicit minor version is requested, the driver automatically picks the highest available.
- `Version0` — Request an ES 3.0 context.
- `Version1` — Request an ES 3.1 context.
- `Version2` — Request an ES 3.2 context.

Methods and constants:

- `fn from_env() -> Option<Self>` — Choose which minor OpenGL ES version to use from the environment variable `WGPU_GLES_MINOR_VERSION`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given compiler, modifies it based on the `WGPU_GLES_MINOR_VERSION` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### GlFenceBehavior — enum

Dictate the behavior of fences in OpenGL.

Variants (2):

- `Normal` — Fences in OpenGL behave normally. If you don't know what to pick, this is what you want.
- `AutoFinish` — Fences in OpenGL are short-circuited to always return `true` immediately.

Methods and constants:

- `fn is_auto_finish(&self) -> bool` — Returns true if the fence behavior is `AutoFinish`.
- `fn is_normal(&self) -> bool` — Returns true if the fence behavior is `Normal`.
- `fn from_env() -> Option<Self>` — Choose which minor OpenGL ES version to use from the environment variable `WGPU_GL_FENCE_BEHAVIOR`. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given compiler, modifies it based on the `WGPU_GL_FENCE_BEHAVIOR` environment variable, and returns the result. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### HalCounters — struct

`wgpu-hal`'s part of [`InternalCounters`].

Fields:

- `buffers: InternalCounter`
- `textures: InternalCounter`
- `texture_views: InternalCounter`
- `bind_groups: InternalCounter`
- `bind_group_layouts: InternalCounter`
- `render_pipelines: InternalCounter`
- `compute_pipelines: InternalCounter`
- `ray_tracing_pipelines: InternalCounter`
- `pipeline_layouts: InternalCounter`
- `samplers: InternalCounter`
- `command_encoders: InternalCounter`
- `shader_modules: InternalCounter`
- `query_sets: InternalCounter`
- `fences: InternalCounter`
- `buffer_memory: InternalCounter` — Amount of allocated gpu memory attributed to buffers, in bytes.
- `texture_memory: InternalCounter` — Amount of allocated gpu memory attributed to textures, in bytes.
- `acceleration_structure_memory: InternalCounter` — Amount of allocated gpu memory attributed to acceleration structures, in bytes.
- `memory_allocations: InternalCounter` — Number of gpu memory allocations.

Implements: `Clone`, `Debug`, `Default`

### IMMEDIATE_DATA_ALIGNMENT — constant

`const IMMEDIATE_DATA_ALIGNMENT: u32 = 4`

Ranges of [writes to immediate data] must be at least this aligned.

### Instance — struct

Contains the various entry points to start interacting with the system's GPUs.

Opaque (private fields).

Methods and constants:

- `fn new(desc: InstanceDescriptor) -> Self` — Create an new instance of wgpu using the given options and enabled backends.
- `const fn enabled_backend_features() -> Backends` — Returns which backends can be picked for the current build configuration.
- `fn wgsl_language_features(&self) -> WgslLanguageFeatures` — Returns the set of [WGSL language extensions] supported by this instance.
- `fn enumerate_adapters(&self, backends: Backends) -> impl Future<Output = Vec<Adapter>>` — Retrieves all available [`Adapter`]s that match the given [`Backends`].
- `fn request_adapter(&self, options: &RequestAdapterOptions<'_, '_>) -> impl Future<Output = Result<Adapter, RequestAdapterError>> + WasmNotSend` — Retrieves an [`Adapter`] which matches the given [`RequestAdapterOptions`].
- `fn create_surface<'window>(&self, target: impl Into<SurfaceTarget<'window>>) -> Result<Surface<'window>, CreateSurfaceError>` — Creates a new surface targeting a given window/canvas/surface/etc..
- `unsafe fn create_surface_unsafe<'window>(&self, target: SurfaceTargetUnsafe) -> Result<Surface<'window>, CreateSurfaceError>` — Creates a new surface targeting a given window/canvas/surface/etc. using an unsafe target.
- `fn poll_all(&self, force_wait: bool) -> bool` — Polls all devices.
- `fn generate_report(&self) -> Option<wgc::global::GlobalReport>` — Generates memory report.
- `unsafe fn from_hal<A: hal::Api>(hal_instance: <A as >::Instance) -> Self` — Create an new instance of wgpu from a wgpu-hal instance. This is often useful when you need to do backend specific logic, or interop with an existing backend instance.
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<&<A as >::Instance>` — Get the [`wgpu_hal`] instance from this `Instance`.
- `unsafe fn create_adapter_from_hal<A: hal::Api>(&self, hal_adapter: hal::ExposedAdapter<A>) -> Adapter` — Converts a wgpu-hal [`hal::ExposedAdapter`] to a wgpu [`Adapter`].
- `unsafe fn from_core(core_instance: wgc::instance::Instance) -> Self` — Create an new instance of wgpu from a wgpu-core instance.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### InstanceDescriptor — struct

Options for creating an instance.

Fields:

- `backends: Backends` — Which [`Backends`] to enable.
- `flags: InstanceFlags` — Flags to tune the behavior of the instance.
- `memory_budget_thresholds: MemoryBudgetThresholds` — Memory budget thresholds used by some backends.
- `backend_options: BackendOptions` — Options for configuring the behavior of specific backends.
- `display: Option<alloc::boxed::Box<dyn WgpuHasDisplayHandle>>` — System platform or compositor connection to connect this `Instance` to.

Methods and constants:

- `fn new_without_display_handle() -> Self` — The default instance options, without display handle. _[must_use]_
- `fn new_with_display_handle(display: alloc::boxed::Box<dyn WgpuHasDisplayHandle>) -> Self` — The default instance options, with display handle. _[must_use]_
- `fn new_without_display_handle_from_env() -> Self` — Choose instance options entirely from environment variables. _[must_use]_
- `fn new_with_display_handle_from_env(display: alloc::boxed::Box<dyn WgpuHasDisplayHandle>) -> Self` — Choose instance options entirely from environment variables, while including a display handle. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given options, modifies them based on the environment variables, and returns the result. _[must_use]_
- `fn with_display_handle(self, display: alloc::boxed::Box<dyn WgpuHasDisplayHandle>) -> Self` — Appends the given `display` object to the descriptor. _[must_use]_

Implements: `Debug`

### InstanceFlags — struct

Instance debugging flags.

Opaque (private fields).

Methods and constants:

- `const DEBUG: Self` — Generate debug information in shaders and objects.
- `const VALIDATION: Self` — Enable validation in the backend API, if possible:
- `const DISCARD_HAL_LABELS: Self` — Don't pass labels to wgpu-hal.
- `const ALLOW_UNDERLYING_NONCOMPLIANT_ADAPTER: Self` — Whether wgpu should expose adapters that run on top of non-compliant adapters.
- `const GPU_BASED_VALIDATION: Self` — Enable GPU-based validation. Implies [`Self::VALIDATION`]. Currently, this only changes behavior on the DX12 and Vulkan backends.
- `const VALIDATION_INDIRECT_CALL: Self` — Validate indirect buffer content prior to issuing indirect draws/dispatches.
- `const AUTOMATIC_TIMESTAMP_NORMALIZATION: Self` — Enable automatic timestamp normalization. This means that in [`CommandEncoder::resolve_query_set`][rqs], the timestamps will automatically be normalized to be…
- `const STRICT_WEBGPU_COMPLIANCE: Self` — Restrict the available feature set to the one defined by the WebGPU specification.
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
- `const fn iter(&self) -> $crate::iter::Iter<InstanceFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<InstanceFlags>` — Yield a set of contained named flags values.
- `fn debugging() -> Self` — Enable recommended debugging and validation flags. _[must_use]_
- `fn advanced_debugging() -> Self` — Enable advanced debugging and validation flags (potentially very slow). _[must_use]_
- `fn from_build_config() -> Self` — Infer decent defaults from the build type. _[must_use]_
- `fn from_env_or_default() -> Self` — Derive defaults from environment variables. See [`Self::with_env()`] for more information. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given flags, modifies them based on the environment variables, and returns the result. _[must_use]_

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<InstanceFlags>`, `Flags`, `FromIterator<InstanceFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### InternalCounters — struct

All internal counters, exposed for debugging purposes.

Fields:

- `core: CoreCounters` — `wgpu-core` counters.
- `hal: HalCounters` — `wgpu-hal` counters.

Implements: `Clone`, `Debug`, `Default`

### Label — type alias

`type Label = Option<&'a str>`

Object debugging label.

### LoadOpDontCare — struct

Token of the user agreeing to use [`LoadOp::DontCare`](crate::LoadOp::DontCare).

Opaque (private fields).

Methods and constants:

- `const unsafe fn enabled() -> Self` — Using [`LoadOp::DontCare`](crate::LoadOp::DontCare) will result in the render target having undefined contents at the start of the render pass. This may lead to undefined behavior if you read from the any of the render…

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### MAP_ALIGNMENT — constant

`const MAP_ALIGNMENT: BufferAddress = 8`

Minimum alignment of buffer mappings.

### MAXIMUM_SUBGROUP_MAX_SIZE — constant

`const MAXIMUM_SUBGROUP_MAX_SIZE: u32 = 128`

The maximum allowed value for [`AdapterInfo::subgroup_max_size`].

### MemoryBudgetThresholds — struct

Memory budget thresholds used by backends to try to avoid high memory pressure situations.

Fields:

- `for_resource_creation: Option<u8>` — Threshold at which texture, buffer, query set and acceleration structure creation will start to return OOM errors. This is a percent of the memory budget reported by native APIs.
- `for_device_loss: Option<u8>` — Threshold at which devices will become lost due to memory pressure. This is a percent of the memory budget reported by native APIs.

Implements: `Clone`, `Copy`, `Debug`, `Default`

### MemoryHints — enum

Hints to the device about the memory allocation strategy.

Variants (3):

- `Performance` — Favor performance over memory usage (the default value).
- `MemoryUsage` — Favor memory usage over performance.
- `Manual { suballocated_device_memory_block_size: core::ops::Range<u64> }` — Applications that have control over the content that is rendered (typically games) may find an optimal compromise between memory usage and performance by specifying the allocation configuration.

Implements: `Clone`, `Debug`, `Default`

### MINIMUM_SUBGROUP_MIN_SIZE — constant

`const MINIMUM_SUBGROUP_MIN_SIZE: u32 = 4`

The minimum allowed value for [`AdapterInfo::subgroup_min_size`].

### NoopBackendOptions — struct

Configuration for the noop backend.

Fields:

- `enable: bool` — Whether to allow the noop backend to be used.
- `limits: Option<Limits>` — Specify the reported limits values. If `None`, reports maximally permissive limits.
- `features: Option<Features>` — Specify the reported feature support. If `None`, reports support for all features.
- `device_type: Option<DeviceType>` — Specify the reported device type. If `None`, uses [`crate::DeviceType::Other`].
- `subgroup_min_size: Option<u32>` — Specify the reported minimum subgroup size.
- `subgroup_max_size: Option<u32>` — Specify the reported maximum subgroup size.

Methods and constants:

- `fn enabled() -> Self` — Enable the noop backend.
- `fn from_env_or_default() -> Self` — Choose whether the noop backend is enabled from the environment. _[must_use]_
- `fn with_env(self) -> Self` — Takes the given options, modifies them based on the environment variables, and returns the result. _[must_use]_

Implements: `Clone`, `Debug`, `Default`

### PipelineStatisticsTypes — struct

Flags for which pipeline data should be recorded in a query.

Opaque (private fields).

Methods and constants:

- `const VERTEX_SHADER_INVOCATIONS: Self` — Amount of times the vertex shader is ran. Accounts for the vertex cache when doing indexed rendering.
- `const CLIPPER_INVOCATIONS: Self` — Amount of times the clipper is invoked. This is also the amount of triangles output by the vertex shader.
- `const CLIPPER_PRIMITIVES_OUT: Self` — Amount of primitives that are not culled by the clipper. This is the amount of triangles that are actually on screen and will be rasterized and rendered.
- `const FRAGMENT_SHADER_INVOCATIONS: Self` — Amount of times the fragment shader is ran. Accounts for fragment shaders running in 2x2 blocks in order to get derivatives.
- `const COMPUTE_SHADER_INVOCATIONS: Self` — Amount of times a compute shader is invoked. This will be equivalent to the dispatch count times the workgroup size.
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
- `const fn iter(&self) -> $crate::iter::Iter<PipelineStatisticsTypes>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<PipelineStatisticsTypes>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<PipelineStatisticsTypes>`, `Flags`, `FromIterator<PipelineStatisticsTypes>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### PollError — enum

Error states after a device poll.

Variants (2):

- `Timeout` — The requested Wait timed out before the submission was completed.
- `WrongSubmissionIndex(u64, u64)` — The requested Wait was given a wrong submission index.

Implements: `Debug`, `Display`, `Error`

### PollStatus — enum

Status of device poll operation.

Variants (3):

- `QueueEmpty` — There are no active submissions in flight as of the beginning of the poll call. Other submissions may have been queued on other threads during the call.
- `WaitSucceeded` — The requested Wait was satisfied before the timeout.
- `Poll` — This was a poll.

Methods and constants:

- `fn is_queue_empty(&self) -> bool` — Returns true if the result is [`Self::QueueEmpty`]. _[must_use]_
- `fn wait_finished(&self) -> bool` — Returns true if the result is either [`Self::WaitSucceeded`] or [`Self::QueueEmpty`]. _[must_use]_

Implements: `Debug`, `Eq`, `PartialEq`, `StructuralPartialEq`

### PollType — type alias

`type PollType = PollType<SubmissionIndex>`

Passed to `Device::poll` to control how and if it should block.

Variants (2):

- `Wait { submission_index: Option<T>, timeout: Option<core::time::Duration> }` — On wgpu-core based backends, block until the given submission has completed execution, and any callbacks have been invoked.
- `Poll` — Check the device for a single time without blocking.

Methods and constants:

- `const fn wait_indefinitely() -> Self` — Wait indefinitely until for the most recent submission to complete. _[must_use]_
- `fn is_wait(&self) -> bool` — This `PollType` represents a wait of some kind. _[must_use]_
- `fn map_index<U, F>(self, func: F) -> PollType<U> where F: FnOnce(T) -> U` — Map on the wait index type. _[must_use]_

Implements: `Clone`, `Debug`

### PowerPreference — enum

Power Preference when choosing a physical adapter.

Variants (3):

- `None = 0` — Power usage is not considered when choosing an adapter.
- `LowPower = 1` — Adapter that uses the least possible power. This is often an integrated GPU.
- `HighPerformance = 2` — Adapter that has the highest performance. This is often a discrete GPU.

Methods and constants:

- `fn from_env() -> Option<Self>` — Get a power preference from the environment variable `WGPU_POWER_PREF`.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### QUERY_RESOLVE_BUFFER_ALIGNMENT — constant

`const QUERY_RESOLVE_BUFFER_ALIGNMENT: BufferAddress = 256`

An [offset into the query resolve buffer] has to be aligned to this.

### QUERY_SET_MAX_QUERIES — constant

`const QUERY_SET_MAX_QUERIES: u32 = 4096`

Maximum number of query result slots that can be requested in a [`QuerySetDescriptor`].

### QUERY_SIZE — constant

`const QUERY_SIZE: u32 = 8`

Size in bytes of a single piece of [query] data.

### QueryType — enum

Type of queries contained in a [`QuerySet`].

Variants (3):

- `Occlusion` — An occlusion query reports whether any of the fragments drawn within the scope of the query passed all per-fragment tests (i.e. were not occluded).
- `Timestamp` — A timestamp query records a GPU-timestamp value at which a certain command started or finished executing.
- `PipelineStatistics(PipelineStatisticsTypes)` — A pipeline statistics query records information about the execution of pipelines; see [`PipelineStatisticsTypes`]'s documentation for details.

Implements: `Clone`, `Copy`, `Debug`

### Queue — struct

Handle to a command queue on a device.

Opaque (private fields).

Methods and constants:

- `fn write_buffer(&self, buffer: &Buffer, offset: BufferAddress, data: &[u8])` — Copies the bytes of `data` into `buffer` starting at `offset`.
- `fn write_buffer_with(&self, buffer: &Buffer, offset: BufferAddress, size: BufferSize) -> Option<QueueWriteBufferView>` — Prepares to write data to a buffer via a mapped staging buffer. _[must_use]_
- `fn write_texture(&self, texture: TexelCopyTextureInfo<'_>, data: &[u8], data_layout: TexelCopyBufferLayout, size: Extent3d)` — Copies the bytes of `data` into a texture.
- `fn submit<I: IntoIterator<Item = CommandBuffer>>(&self, command_buffers: I) -> SubmissionIndex` — Submits a series of finished command buffers for execution.
- `fn get_timestamp_period(&self) -> f32` — Gets the amount of nanoseconds each tick of a timestamp query represents.
- `fn on_submitted_work_done(&self, callback: impl FnOnce() + Send + 'static)` — Registers a callback that is invoked when the previous [`Queue::submit`] finishes executing on the GPU. When this callback runs, all mapped-buffer callbacks registered for the same submission are guaranteed to have been…
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl core::ops::Deref<Target = <A as >::Queue> + WasmNotSendSync>` — Get the [`wgpu_hal`] device from this `Queue`.
- `fn present(&self, surface_texture: SurfaceTexture)` — Schedule a surface texture to be presented on the owning surface.
- `fn compact_blas(&self, blas: &Blas) -> Blas` — Compact a BLAS, it must have had [`Blas::prepare_compaction_async`] called on it and had the callback provided called.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### QueueWriteBufferView — struct

A write-only view into a staging buffer.

Opaque (private fields).

Methods and constants:

- `fn len(&self) -> usize` — Returns the length of this view; the number of bytes to be written.
- `fn is_empty(&self) -> bool` — Returns `true` if the view has a length of 0.
- `fn slice<'a, S: RangeBounds<usize>>(self: &'a mut Self, bounds: S) -> WriteOnly<'a, [u8]>` — Returns a [`WriteOnly`] reference to a portion of this.
- `fn copy_from_slice(&mut self, src: &[u8])` — Copies all elements from src into `self`.

Implements: `Debug`, `Drop`

### RequestAdapterError — enum _[non_exhaustive]_

Error when [`Instance::request_adapter()`] fails.

Variants (2):

- `NotFound {  }` — No adapter available via the instance’s backends matched the request’s adapter criteria.
- `EnvNotSet` — Attempted to obtain adapter specified by environment variable, but the environment variable was not set.

Implements: `Clone`, `Debug`, `Display`, `Error`, `PartialEq`, `StructuralPartialEq`

### RequestAdapterOptions — type alias

`type RequestAdapterOptions = RequestAdapterOptionsBase<&'a Surface<'b>>`

Options for requesting adapter.

Fields:

- `power_preference: PowerPreference` — Power preference for the adapter.
- `force_fallback_adapter: bool` — Indicates that only a fallback adapter can be returned. This is generally a "software" implementation on the system.
- `compatible_surface: Option<S>` — Surface that is required to be presentable with the requested adapter. This does not create the surface, only guarantees that the adapter can present to said surface. For WebGL, t…
- `apply_limit_buckets: bool` — Requests that the returned adapter's limits are mapped to one of several pre-defined buckets, as described in [limit bucketing]. If your application exposes `wgpu` to untrusted co…

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### RequestAdapterOptionsBase`<S>` — struct

Options for requesting adapter.

Fields:

- `power_preference: PowerPreference` — Power preference for the adapter.
- `force_fallback_adapter: bool` — Indicates that only a fallback adapter can be returned. This is generally a "software" implementation on the system.
- `compatible_surface: Option<S>` — Surface that is required to be presentable with the requested adapter. This does not create the surface, only guarantees that the adapter can present to said surface. For WebGL, t…
- `apply_limit_buckets: bool` — Requests that the returned adapter's limits are mapped to one of several pre-defined buckets, as described in [limit bucketing]. If your application exposes `wgpu` to untrusted co…

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### RequestDeviceError — struct

Requesting a device from an [`Adapter`] failed.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<RequestDeviceError>`

### ShaderLocation — type alias

`type ShaderLocation = u32`

Integral type used for binding locations in shaders.

### SubmissionIndex — struct

Identifier for a particular call to [`Queue::submit`]. Can be used as part of an argument to [`Device::poll`] to block for a particular submission to finish.

Opaque (private fields).

Implements: `Clone`, `Debug`

### Trace — enum _[non_exhaustive]_

Controls API call tracing and specifies where the trace is written.

Variants (1):

- `Off` — Tracing disabled.

Implements: `Clone`, `Debug`, `Default`

### UncapturedErrorHandler — trait

The callback of [`Device::on_uncaptured_error()`].

### VERTEX_ALIGNMENT — constant

`const VERTEX_ALIGNMENT: BufferAddress = 4`

[Vertex buffer offsets] and [strides] have to be a multiple of this number.

### VERTEX_STRIDE_ALIGNMENT — constant

`const VERTEX_STRIDE_ALIGNMENT: BufferAddress = 4`

[Vertex buffer strides] have to be a multiple of this number.

### WgslLanguageFeatures — struct

WGSL language extensions.

Opaque (private fields).

Methods and constants:

- `const ReadOnlyAndReadWriteStorageTextures: Self` — <https://www.w3.org/TR/WGSL/#language_extension-readonly_and_readwrite_storage_textures>
- `const Packed4x8IntegerDotProduct: Self` — <https://www.w3.org/TR/WGSL/#language_extension-packed_4x8_integer_dot_product>
- `const UnrestrictedPointerParameters: Self` — <https://www.w3.org/TR/WGSL/#language_extension-unrestricted_pointer_parameters>
- `const PointerCompositeAccess: Self` — <https://www.w3.org/TR/WGSL/#language_extension-pointer_composite_access>
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
- `const fn iter(&self) -> $crate::iter::Iter<WgslLanguageFeatures>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<WgslLanguageFeatures>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Debug`, `Eq`, `Extend<WgslLanguageFeatures>`, `Flags`, `FromIterator<WgslLanguageFeatures>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`
