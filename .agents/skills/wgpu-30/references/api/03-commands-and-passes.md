# wgpu 30.0.1 API map — Command encoding, render and compute passes, bundles

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 18 public items.

### CommandBuffer — struct

Handle to a command buffer on the GPU.

Opaque (private fields).

Methods and constants:
- `fn map_buffer_on_submit<S: core::ops::RangeBounds<BufferAddress>>(&self, buffer: &api::Buffer, mode: MapMode, bounds: S, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — On submission, maps the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Buffer::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`O…
- `fn on_submitted_work_done(&self, callback: impl FnOnce() + Send + 'static)` — Registers a callback that is invoked when this command buffer’s work finishes executing on the GPU. When this callback runs, all mapped-buffer callbacks registered for the same submission are guaranteed to have been cal…

Implements: `Debug`

### CommandEncoder — struct

Encodes a series of GPU operations.

Opaque (private fields).

Methods and constants:
- `fn finish(self) -> CommandBuffer` — Finishes recording and returns a [`CommandBuffer`] that can be submitted for execution.
- `fn begin_render_pass<'encoder>(self: &'encoder mut Self, desc: &RenderPassDescriptor<'_>) -> RenderPass<'encoder>` — Begins recording of a render pass.
- `fn begin_compute_pass<'encoder>(self: &'encoder mut Self, desc: &ComputePassDescriptor<'_>) -> ComputePass<'encoder>` — Begins recording of a compute pass.
- `fn copy_buffer_to_buffer(&mut self, source: &Buffer, source_offset: BufferAddress, destination: &Buffer, destination_offset: BufferAddress, copy_size: impl Into<Option<BufferAddress>>)` — Copy data from one buffer to another.
- `fn copy_buffer_to_texture(&mut self, source: TexelCopyBufferInfo<'_>, destination: TexelCopyTextureInfo<'_>, copy_size: Extent3d)` — Copy data from a buffer to a texture.
- `fn copy_texture_to_buffer(&mut self, source: TexelCopyTextureInfo<'_>, destination: TexelCopyBufferInfo<'_>, copy_size: Extent3d)` — Copy data from a texture to a buffer.
- `fn copy_texture_to_texture(&mut self, source: TexelCopyTextureInfo<'_>, destination: TexelCopyTextureInfo<'_>, copy_size: Extent3d)` — Copy data from one texture to another.
- `fn clear_texture(&mut self, texture: &Texture, subresource_range: &ImageSubresourceRange)` — Clears texture to zero.
- `fn clear_buffer(&mut self, buffer: &Buffer, offset: BufferAddress, size: Option<BufferAddress>)` — Clears buffer to zero.
- `fn insert_debug_marker(&mut self, label: &str)` — Inserts debug marker.
- `fn push_debug_group(&mut self, label: &str)` — Start record commands and group it into debug marker group.
- `fn pop_debug_group(&mut self)` — Stops command recording and creates debug group.
- `fn resolve_query_set(&mut self, query_set: &QuerySet, query_range: Range<u32>, destination: &Buffer, destination_offset: BufferAddress)` — Copies query results stored in `query_set` into `destination` so that they can be read by compute shaders or buffer operations.
- `fn map_buffer_on_submit<S: core::ops::RangeBounds<BufferAddress>>(&self, buffer: &api::Buffer, mode: MapMode, bounds: S, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — On submission, maps the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Buffer::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`O…
- `fn on_submitted_work_done(&self, callback: impl FnOnce() + Send + 'static)` — Registers a callback that is invoked when this command buffer’s work finishes executing on the GPU. When this callback runs, all mapped-buffer callbacks registered for the same submission are guaranteed to have been cal…
- `unsafe fn as_hal_mut<A: hal::Api, F: FnOnce(Option<&mut <A as >::CommandEncoder>) -> R, R>(&mut self, hal_command_encoder_callback: F) -> R` — Get the [`wgpu_hal`] command encoder from this `CommandEncoder`.
- `fn write_timestamp(&mut self, query_set: &QuerySet, query_index: u32)` — Issue a timestamp command at this point in the queue. The timestamp will be written to the specified query set, at the specified index.
- `unsafe fn mark_acceleration_structures_built<'a>(&self, blas: impl IntoIterator<Item = &'a Blas>, tlas: impl IntoIterator<Item = &'a Tlas>)` — When encoding the acceleration structure build with the raw Hal encoder (obtained from [`CommandEncoder::as_hal_mut`]), this function marks the acceleration structures as having been built.
- `fn build_acceleration_structures<'a>(&mut self, blas: impl IntoIterator<Item = &'a BlasBuildEntry<'a>>, tlas: impl IntoIterator<Item = &'a Tlas>)` — Build bottom and top level acceleration structures.
- `fn transition_resources<'a>(&mut self, buffer_transitions: impl Iterator<Item = BufferTransition<&'a Buffer>>, texture_transitions: impl Iterator<Item = TextureTransition<&'a Texture>>)` — Transition resources to an underlying hal resource state.

Implements: `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### CommandEncoderDescriptor — type alias

`type CommandEncoderDescriptor = CommandEncoderDescriptor<Label<'a>>`

Describes a [`CommandEncoder`](../wgpu/struct.CommandEncoder.html).

Fields:
- `label: L` — Debug label for the command encoder. This will show up in graphics debuggers for easy identification.

Methods and constants:
- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> CommandEncoderDescriptor<K>` — Takes a closure and maps the label of the command encoder descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ComputePass`<'encoder>` — struct

In-progress recording of a compute pass.

Opaque (private fields).

Methods and constants:
- `fn forget_lifetime(self) -> ComputePass<'static>` — Drops the lifetime relationship to the parent command encoder, making usage of the encoder while this pass is recorded a run-time error instead.
- `fn set_bind_group<'a, BG>(&mut self, index: u32, bind_group: BG, offsets: &[DynamicOffset]) where Option<&'a BindGroup>: From<BG>` — Sets the active bind group for a given bind group index. The bind group layout in the active pipeline when the `dispatch_workgroups()` function is called must match the layout of this bind group.
- `fn set_pipeline(&mut self, pipeline: &ComputePipeline)` — Sets the active compute pipeline.
- `fn insert_debug_marker(&mut self, label: &str)` — Inserts debug marker.
- `fn push_debug_group(&mut self, label: &str)` — Start record commands and group it into debug marker group.
- `fn pop_debug_group(&mut self)` — Stops command recording and creates debug group.
- `fn dispatch_workgroups(&mut self, x: u32, y: u32, z: u32)` — Dispatches compute work operations.
- `fn dispatch_workgroups_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress)` — Dispatches compute work operations, based on the contents of the `indirect_buffer`.
- `fn transition_resources<'a>(&mut self, buffer_transitions: impl Iterator<Item = BufferTransition<&'a Buffer>>, texture_transitions: impl Iterator<Item = TextureTransition<&'a TextureView>>)` — Transition resources to an underlying hal resource state. Compute pass version of [`CommandEncoder::transition_resources`].
- `fn map_buffer_on_submit<S: core::ops::RangeBounds<BufferAddress>>(&self, buffer: &api::Buffer, mode: MapMode, bounds: S, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — On submission, maps the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Buffer::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`O…
- `fn on_submitted_work_done(&self, callback: impl FnOnce() + Send + 'static)` — Registers a callback that is invoked when this command buffer’s work finishes executing on the GPU. When this callback runs, all mapped-buffer callbacks registered for the same submission are guaranteed to have been cal…
- `fn set_immediates(&mut self, offset: u32, data: &[u8])` — Set immediate data for subsequent dispatch calls.
- `fn write_timestamp(&mut self, query_set: &QuerySet, query_index: u32)` — Issue a timestamp command at this point in the queue. The timestamp will be written to the specified query set, at the specified index.
- `fn begin_pipeline_statistics_query(&mut self, query_set: &QuerySet, query_index: u32)` — Start a pipeline statistics query on this compute pass. It can be ended with `end_pipeline_statistics_query`. Pipeline statistics queries may not be nested.
- `fn end_pipeline_statistics_query(&mut self)` — End the pipeline statistics query on this compute pass. It can be started with `begin_pipeline_statistics_query`. Pipeline statistics queries may not be nested.

Implements: `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### ComputePassDescriptor`<'a>` — struct

Describes the attachments of a compute pass.

Fields:
- `label: Label<'a>` — Debug label of the compute pass. This will show up in graphics debuggers for easy identification.
- `timestamp_writes: Option<ComputePassTimestampWrites<'a>>` — Defines which timestamp values will be written for this pass, and where to write them to.

Implements: `Clone`, `Debug`, `Default`

### ComputePassTimestampWrites`<'a>` — struct

Describes the timestamp writes of a compute pass.

Fields:
- `query_set: &'a QuerySet` — The query set to write to.
- `beginning_of_pass_write_index: Option<u32>` — The index of the query set at which a start timestamp of this pass is written, if any.
- `end_of_pass_write_index: Option<u32>` — The index of the query set at which an end timestamp of this pass is written, if any.

Implements: `Clone`, `Debug`

### RenderBundle — struct

Pre-prepared reusable bundle of GPU operations.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### RenderBundleDescriptor — type alias

`type RenderBundleDescriptor = RenderBundleDescriptor<Label<'a>>`

Describes a [`RenderBundle`](../wgpu/struct.RenderBundle.html).

Fields:
- `label: L` — Debug label of the render bundle encoder. This will show up in graphics debuggers for easy identification.

Methods and constants:
- `fn map_label<'a, K>(self: &'a Self, fun: impl FnOnce(&'a L) -> K) -> RenderBundleDescriptor<K>` — Takes a closure and maps the label of the render bundle descriptor into another. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### RenderBundleEncoder`<'a>` — struct

Encodes a series of GPU operations into a reusable "render bundle".

Opaque (private fields).

Methods and constants:
- `fn finish(self, desc: &RenderBundleDescriptor<'_>) -> RenderBundle` — Finishes recording and returns a [`RenderBundle`] that can be executed in other render passes.
- `fn set_bind_group<'b, BG>(&mut self, index: u32, bind_group: BG, offsets: &[DynamicOffset]) where Option<&'b BindGroup>: From<BG>` — Sets the active bind group for a given bind group index. The bind group layout in the active pipeline when any `draw()` function is called must match the layout of this bind group.
- `fn set_pipeline(&mut self, pipeline: &'a RenderPipeline)` — Sets the active render pipeline.
- `fn set_index_buffer(&mut self, buffer_slice: BufferSlice<'a>, index_format: IndexFormat)` — Sets the active index buffer.
- `fn set_vertex_buffer<'b, B>(&mut self, slot: u32, buffer_slice: B) where Option<BufferSlice<'b>>: From<B>` — Assign a vertex buffer to a slot.
- `fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>)` — Draws primitives from the active vertex buffer(s).
- `fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>)` — Draws indexed primitives using the active index buffer and the active vertex buffer(s).
- `fn draw_indirect(&mut self, indirect_buffer: &'a Buffer, indirect_offset: BufferAddress)` — Draws primitives from the active vertex buffer(s) based on the contents of the `indirect_buffer`.
- `fn draw_indexed_indirect(&mut self, indirect_buffer: &'a Buffer, indirect_offset: BufferAddress)` — Draws indexed primitives using the active index buffer and the active vertex buffers, based on the contents of the `indirect_buffer`.
- `fn set_immediates(&mut self, offset: u32, data: &[u8])` — Set immediate data for subsequent draw calls within the render bundle.

Implements: `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `RenderEncoder<'a>`

### RenderBundleEncoderDescriptor`<'a>` — struct

Describes a [`RenderBundleEncoder`].

Fields:
- `label: Label<'a>` — Debug label of the render bundle encoder. This will show up in graphics debuggers for easy identification.
- `color_formats: &'a [Option<TextureFormat>]` — The formats of the color attachments that this render bundle is capable to rendering to. This must match the formats of the color attachments in the render pass this render bundle…
- `depth_stencil: Option<RenderBundleDepthStencil>` — Information about the depth attachment that this render bundle is capable to rendering to. This must match the format of the depth attachments in the render pass this render bundl…
- `sample_count: u32` — Sample count this render bundle is capable of rendering to. This must match the pipelines and the render passes it is used in.
- `multiview: Option<core::num::NonZeroU32>` — If this render bundle will rendering to multiple array layers in the attachments at the same time.

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### RenderEncoder`<'a>` — trait

Methods shared by [`RenderPass`] and [`RenderBundleEncoder`].

Items:
- `fn set_bind_group(&mut self, index: u32, bind_group: Option<&'a BindGroup>, offsets: &[DynamicOffset])` — Sets the active bind group for a given bind group index. The bind group layout in the active pipeline when any `draw()` function is called must match the layout of this bind group.
- `fn set_pipeline(&mut self, pipeline: &'a RenderPipeline)` — Sets the active render pipeline.
- `fn set_index_buffer(&mut self, buffer_slice: BufferSlice<'a>, index_format: IndexFormat)` — Sets the active index buffer.
- `fn set_vertex_buffer(&mut self, slot: u32, buffer_slice: Option<BufferSlice<'a>>)` — Assign a vertex buffer to a slot.
- `fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>)` — Draws primitives from the active vertex buffer(s).
- `fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>)` — Draws indexed primitives using the active index buffer and the active vertex buffers.
- `fn draw_indirect(&mut self, indirect_buffer: &'a Buffer, indirect_offset: BufferAddress)` — Draws primitives from the active vertex buffer(s) based on the contents of the `indirect_buffer`.
- `fn draw_indexed_indirect(&mut self, indirect_buffer: &'a Buffer, indirect_offset: BufferAddress)` — Draws indexed primitives using the active index buffer and the active vertex buffers, based on the contents of the `indirect_buffer`.
- `fn set_immediates(&mut self, offset: u32, data: &[u8])` — [`wgt::Features::IMMEDIATES`] must be enabled on the device in order to call this function.

### RenderPass`<'encoder>` — struct

In-progress recording of a render pass: a list of render commands in a [`CommandEncoder`].

Opaque (private fields).

Methods and constants:
- `fn forget_lifetime(self) -> RenderPass<'static>` — Drops the lifetime relationship to the parent command encoder, making usage of the encoder while this pass is recorded a run-time error instead.
- `fn set_bind_group<'a, BG>(&mut self, index: u32, bind_group: BG, offsets: &[DynamicOffset]) where Option<&'a BindGroup>: From<BG>` — Sets the active bind group for a given bind group index. The bind group layout in the active pipeline when any `draw_*()` method is called must match the layout of this bind group.
- `fn set_pipeline(&mut self, pipeline: &RenderPipeline)` — Sets the active render pipeline.
- `fn set_blend_constant(&mut self, color: Color)` — Sets the blend color as used by some of the blending modes.
- `fn set_index_buffer(&mut self, buffer_slice: BufferSlice<'_>, index_format: IndexFormat)` — Sets the active index buffer.
- `fn set_vertex_buffer<'b, B>(&mut self, slot: u32, buffer_slice: B) where Option<BufferSlice<'b>>: From<B>` — Assign a vertex buffer to a slot.
- `fn set_scissor_rect(&mut self, x: u32, y: u32, width: u32, height: u32)` — Sets the scissor rectangle used during the rasterization stage. After transformation into [viewport coordinates](https://www.w3.org/TR/webgpu/#viewport-coordinates).
- `fn set_viewport(&mut self, x: f32, y: f32, w: f32, h: f32, min_depth: f32, max_depth: f32)` — Sets the viewport used during the rasterization stage to linearly map from [normalized device coordinates](https://www.w3.org/TR/webgpu/#ndc) to [viewport coordinates](https://www.w3.org/TR/webgpu/#viewport-coordinates).
- `fn set_stencil_reference(&mut self, reference: u32)` — Sets the stencil reference.
- `fn insert_debug_marker(&mut self, label: &str)` — Inserts debug marker.
- `fn push_debug_group(&mut self, label: &str)` — Start record commands and group it into debug marker group.
- `fn pop_debug_group(&mut self)` — Stops command recording and creates debug group.
- `fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>)` — Draws primitives from the active vertex buffer(s).
- `fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>)` — Draws indexed primitives using the active index buffer and the active vertex buffers.
- `fn draw_mesh_tasks(&mut self, group_count_x: u32, group_count_y: u32, group_count_z: u32)` — Draws using a mesh pipeline.
- `fn draw_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress)` — Draws primitives from the active vertex buffer(s) based on the contents of the `indirect_buffer`.
- `fn draw_indexed_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress)` — Draws indexed primitives using the active index buffer and the active vertex buffers, based on the contents of the `indirect_buffer`.
- `fn draw_mesh_tasks_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress)` — Draws using a mesh pipeline, based on the contents of the `indirect_buffer`
- `fn map_buffer_on_submit<S: core::ops::RangeBounds<BufferAddress>>(&self, buffer: &api::Buffer, mode: MapMode, bounds: S, callback: impl FnOnce(Result<(), BufferAsyncError>) + WasmNotSend + 'static)` — On submission, maps the buffer to host (CPU) memory, making it available for reading or writing via [`get_mapped_range()`](Buffer::get_mapped_range). The buffer becomes accessible once the `callback` is invoked with [`O…
- `fn on_submitted_work_done(&self, callback: impl FnOnce() + Send + 'static)` — Registers a callback that is invoked when this command buffer’s work finishes executing on the GPU. When this callback runs, all mapped-buffer callbacks registered for the same submission are guaranteed to have been cal…
- `fn execute_bundles<'a, I: IntoIterator<Item = &'a RenderBundle>>(&mut self, render_bundles: I)` — Execute a [render bundle][RenderBundle], which is a set of pre-recorded commands that can be run together.
- `fn multi_draw_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count: u32)` — Dispatches multiple draw calls from the active vertex buffer(s) based on the contents of the `indirect_buffer`. `count` draw calls are issued.
- `fn multi_draw_indexed_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count: u32)` — Dispatches multiple draw calls from the active index buffer and the active vertex buffers, based on the contents of the `indirect_buffer`. `count` draw calls are issued.
- `fn multi_draw_mesh_tasks_indirect(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count: u32)` — Dispatches multiple draw calls based on the contents of the `indirect_buffer`. `count` draw calls are issued.
- `fn multi_draw_indirect_count(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count_buffer: &Buffer, count_offset: BufferAddress, max_count: u32)` — Dispatches multiple draw calls from the active vertex buffer(s) based on the contents of the `indirect_buffer`. The count buffer is read to determine how many draws to issue.
- `fn multi_draw_indexed_indirect_count(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count_buffer: &Buffer, count_offset: BufferAddress, max_count: u32)` — Dispatches multiple draw calls from the active index buffer and the active vertex buffers, based on the contents of the `indirect_buffer`. The count buffer is read to determine how many draws to issue.
- `fn multi_draw_mesh_tasks_indirect_count(&mut self, indirect_buffer: &Buffer, indirect_offset: BufferAddress, count_buffer: &Buffer, count_offset: BufferAddress, max_count: u32)` — Dispatches multiple draw calls based on the contents of the `indirect_buffer`. The count buffer is read to determine how many draws to issue.
- `fn set_immediates(&mut self, offset: u32, data: &[u8])` — Set immediate data for subsequent draw calls.
- `fn write_timestamp(&mut self, query_set: &QuerySet, query_index: u32)` — Issue a timestamp command at this point in the queue. The timestamp will be written to the specified query set, at the specified index.
- `fn begin_occlusion_query(&mut self, query_index: u32)` — Start a occlusion query on this render pass. It can be ended with [`end_occlusion_query`](Self::end_occlusion_query). Occlusion queries may not be nested.
- `fn end_occlusion_query(&mut self)` — End the occlusion query on this render pass. It can be started with [`begin_occlusion_query`](Self::begin_occlusion_query). Occlusion queries may not be nested.
- `fn begin_pipeline_statistics_query(&mut self, query_set: &QuerySet, query_index: u32)` — Start a pipeline statistics query on this render pass. It can be ended with [`end_pipeline_statistics_query`](Self::end_pipeline_statistics_query). Pipeline statistics queries may not be nested.
- `fn end_pipeline_statistics_query(&mut self)` — End the pipeline statistics query on this render pass. It can be started with [`begin_pipeline_statistics_query`](Self::begin_pipeline_statistics_query). Pipeline statistics queries may not be nested.

Implements: `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `RenderEncoder<'a>`

### RenderPassColorAttachment`<'tex>` — struct

Describes a color attachment to a [`RenderPass`].

Fields:
- `view: &'tex TextureView` — The view to use as an attachment.
- `depth_slice: Option<u32>` — The depth slice index of a 3D view. It must not be provided if the view is not 3D.
- `resolve_target: Option<&'tex TextureView>` — The view that will receive the resolved output if multisampling is used.
- `ops: Operations<Color>` — What operations will be performed on this color attachment.

Implements: `Clone`, `Debug`

### RenderPassDepthStencilAttachment`<'tex>` — struct

Describes a depth/stencil attachment to a [`RenderPass`].

Fields:
- `view: &'tex TextureView` — The view to use as an attachment.
- `depth_ops: Option<Operations<f32>>` — What operations will be performed on the depth part of the attachment.
- `stencil_ops: Option<Operations<u32>>` — What operations will be performed on the stencil part of the attachment.

Implements: `Clone`, `Debug`

### RenderPassDescriptor`<'a>` — struct

Describes the attachments of a render pass.

Fields:
- `label: Label<'a>` — Debug label of the render pass. This will show up in graphics debuggers for easy identification.
- `color_attachments: &'a [Option<RenderPassColorAttachment<'a>>]` — The color attachments of the render pass.
- `depth_stencil_attachment: Option<RenderPassDepthStencilAttachment<'a>>` — The depth and stencil attachment of the render pass, if any.
- `timestamp_writes: Option<RenderPassTimestampWrites<'a>>` — Defines which timestamp values will be written for this pass, and where to write them to.
- `occlusion_query_set: Option<&'a QuerySet>` — Defines where the occlusion query results will be stored for this pass.
- `multiview_mask: Option<core::num::NonZeroU32>` — The mask of multiview image layers to use for this render pass. For example, if you wish to render to the first 2 layers, you would use 3=0b11. If you wanted ro render to only the…

Implements: `Clone`, `Debug`, `Default`

### RenderPassTimestampWrites`<'a>` — struct

Describes the timestamp writes of a render pass.

Fields:
- `query_set: &'a QuerySet` — The query set to write to.
- `beginning_of_pass_write_index: Option<u32>` — The index of the query set at which a start timestamp of this pass is written, if any.
- `end_of_pass_write_index: Option<u32>` — The index of the query set at which an end timestamp of this pass is written, if any.

Implements: `Clone`, `Debug`

### TexelCopyBufferInfo — type alias

`type TexelCopyBufferInfo = TexelCopyBufferInfoBase<&'a Buffer>`

View of a buffer which can be used to copy to/from a texture.

Fields:
- `buffer: B` — The buffer to be copied to/from.
- `layout: TexelCopyBufferLayout` — The layout of the texture data in this buffer.

Implements: `Clone`, `Copy`, `Debug`

### TexelCopyTextureInfo — type alias

`type TexelCopyTextureInfo = TexelCopyTextureInfoBase<&'a Texture>`

View of a texture which can be used to copy to/from a buffer/texture.

Fields:
- `texture: T` — The texture to be copied to/from.
- `mip_level: u32` — The target mip level of the texture.
- `origin: Origin3d` — The base texel of the texture in the selected `mip_level`. Together with the `copy_size` argument to copy functions, defines the sub-region of the texture to copy.
- `aspect: TextureAspect` — The copy aspect.

Methods and constants:
- `fn to_tagged(self, color_space: PredefinedColorSpace, premultiplied_alpha: bool) -> CopyExternalImageDestInfo<T>` — Adds color space and premultiplied alpha information to make this descriptor tagged.

Implements: `Clone`, `Copy`, `Debug`
