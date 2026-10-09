# wgpu 30.0.1 API map — wgpu::util helpers

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 13 public items.

### BufferInitDescriptor`<'a>` — struct

Describes a [Buffer](crate::Buffer) when allocating.

Fields:
- `label: Label<'a>` — Debug label of a buffer. This will show up in graphics debuggers for easy identification.
- `contents: &'a [u8]` — Contents of a buffer on creation.
- `usage: BufferUsages` — Usages of a buffer. If the buffer is used in any way that isn't specified here, the operation will panic.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### DeviceExt — trait

Utility methods not meant to be in the main API.

Items:
- `fn create_buffer_init(&self, desc: &BufferInitDescriptor<'_>) -> Buffer` — Creates a [Buffer](crate::Buffer) with data to initialize it.
- `fn create_texture_with_data(&self, queue: &Queue, desc: &TextureDescriptor<'_>, order: TextureDataOrder, data: &[u8]) -> Texture` — Upload an entire texture and its mipmaps from a source buffer.

### DownloadBuffer — struct

CPU-accessible buffer used to retrieve data from buffers that cannot or must not be mapped.

Opaque (private fields).

Methods and constants:
- `fn read_buffer(device: &super::Device, queue: &super::Queue, buffer_slice: &super::BufferSlice<'_>, callback: impl FnOnce(Result<Self, super::BufferAsyncError>) + Send + 'static)` — Asynchronously read the contents of a buffer by copying it to a staging buffer.

Implements: `Debug`, `Deref`

### initialize_adapter_from_env — function

`async fn util::initialize_adapter_from_env(instance: &Instance, compatible_surface: Option<&Surface<'_>>) -> Result<Adapter, RequestAdapterError>`

Initialize the adapter obeying the `WGPU_ADAPTER_NAME` environment variable.

### initialize_adapter_from_env_or_default — function

`async fn util::initialize_adapter_from_env_or_default(instance: &Instance, compatible_surface: Option<&Surface<'_>>) -> Result<Adapter, RequestAdapterError>`

Initialize the adapter obeying the `WGPU_ADAPTER_NAME` environment variable and if it doesn't exist fall back on a default adapter.

### is_browser_webgpu_supported — function

`async fn util::is_browser_webgpu_supported() -> bool`

Determines whether the [`Backends::BROWSER_WEBGPU`] backend is supported.

### make_spirv_raw — function

`fn util::make_spirv_raw(bytes: &[u8]) -> alloc::borrow::Cow<'_, [u32]>`

Version of [`make_spirv()`] intended for use with [`Device::create_shader_module_passthrough()`].

### new_instance_with_webgpu_detection — function

`async fn util::new_instance_with_webgpu_detection(instance_desc: InstanceDescriptor) -> Instance`

Create an new instance of wgpu, but disabling [`Backends::BROWSER_WEBGPU`] if no WebGPU support was detected.

### pipeline_cache_key — function

`fn util::pipeline_cache_key(adapter_info: &AdapterInfo) -> Option<alloc::string::String>`

A recommended key for storing [`PipelineCache`]s for the adapter associated with the given [`AdapterInfo`](wgt::AdapterInfo) This key will define a class of adapters for which the same cache might be valid.

### StagingBelt — struct

Efficiently performs many buffer writes by sharing and reusing temporary buffers.

Opaque (private fields).

Methods and constants:
- `fn new(device: Device, chunk_size: BufferAddress) -> Self` — Create a new staging belt.
- `fn new_with_buffer_usages(device: Device, chunk_size: BufferAddress, buffer_usages: BufferUsages) -> Self` — Create a new staging belt.
- `fn write_buffer(&mut self, encoder: &mut CommandEncoder, target: &Buffer, offset: BufferAddress, size: BufferSize) -> BufferViewMut` — Allocate a staging belt slice of `size` to be copied into the `target` buffer at the specified offset.
- `fn allocate(&mut self, size: BufferSize, alignment: BufferSize) -> BufferSlice<'_>` — Allocate a staging belt slice with the given `size` and `alignment` and return it.
- `fn finish(&mut self)` — Prepare currently mapped buffers for use in a submission.
- `fn recall(&mut self)` — Recall all of the closed buffers back to be reused.
- `fn finish_and_recall_on_submit(&mut self, encoder: &CommandEncoder)` — Convenience for [`StagingBelt::finish()`] followed by a deferred [`StagingBelt::recall()`] that runs automatically when `encoder`'s command buffer is submitted.

Implements: `Debug`

### TextureBlitter — struct

Texture Blitting (Copying) Utility

Opaque (private fields).

Methods and constants:
- `fn new(device: &Device, format: TextureFormat) -> Self` — Returns a [`TextureBlitter`] with default settings.
- `fn copy(&self, device: &Device, encoder: &mut CommandEncoder, source: &TextureView, target: &TextureView)` — Copies the data from the source [`TextureView`] to the target [`TextureView`]

Implements: `Debug`

### TextureBlitterBuilder`<'a>` — struct

A builder for the [`TextureBlitter`] utility. If you want the default [`TextureBlitter`] use [`TextureBlitter::new`] instead.

Opaque (private fields).

Methods and constants:
- `fn new(device: &'a Device, format: TextureFormat) -> Self` — Returns a new [`TextureBlitterBuilder`]
- `fn sample_type(self, sample_type: FilterMode) -> Self` — Sets the [`Sampler`] Filtering Mode
- `fn blend_state(self, blend_state: BlendState) -> Self` — Sets the [`BlendState`] that is used.
- `fn build(self) -> TextureBlitter` — Returns a new [`TextureBlitter`] with given settings.

Implements: `Debug`

### TextureFormatExt — trait

Adds extra conversion functions to `TextureFormat`.

Items:
- `fn from_storage_format(storage_format: naga::StorageFormat) -> Self` — Finds the [`TextureFormat`](wgt::TextureFormat) corresponding to the given [`StorageFormat`](wgc::naga::StorageFormat).
- `fn to_storage_format(&self) -> Option<naga::StorageFormat>` — Finds the [`StorageFormat`](wgc::naga::StorageFormat) corresponding to the given [`TextureFormat`](wgt::TextureFormat). Returns `None` if there is no matching storage format, which typically indicates this format is not…
