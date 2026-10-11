# wgpu 30.0.1 API map — index

> Generated 2026-10-05. One line per public item: `rg -n '^### Name' references/api` finds its entry.

## Instance, adapter, device, queue (01-instance-adapter-device-queue.md)

Adapter, AdapterInfo, align_to, AlignTo, AllocatorReport, Backend, BackendOptions, Backends, BufferAddress, BufferSize, Color, CommandBufferDescriptor, CooperativeMatrixProperties, CooperativeScalarType, COPY_BUFFER_ALIGNMENT, COPY_BYTES_PER_ROW_ALIGNMENT, CoreCounters, Device, DeviceDescriptor, DeviceLostReason, DeviceType, Dx12BackendOptions, Dx12Compiler, Dx12SwapchainKind, Dx12UseFrameLatencyWaitableObject, DxcShaderModel, DynamicOffset, Error, ErrorFilter, ErrorScopeGuard, ErrorSource, ExperimentalFeatures, ForceShaderModelToken, GlBackendOptions, GlDebugFns, Gles3MinorVersion, GlFenceBehavior, HalCounters, IMMEDIATE_DATA_ALIGNMENT, Instance, InstanceDescriptor, InstanceFlags, InternalCounters, Label, LoadOpDontCare, MAP_ALIGNMENT, MAXIMUM_SUBGROUP_MAX_SIZE, MemoryBudgetThresholds, MemoryHints, MINIMUM_SUBGROUP_MIN_SIZE, NoopBackendOptions, PipelineStatisticsTypes, PollError, PollStatus, PollType, PowerPreference, QUERY_RESOLVE_BUFFER_ALIGNMENT, QUERY_SET_MAX_QUERIES, QUERY_SIZE, QueryType, Queue, QueueWriteBufferView, RequestAdapterError, RequestAdapterOptions, RequestAdapterOptionsBase, RequestDeviceError, ShaderLocation, SubmissionIndex, Trace, UncapturedErrorHandler, VERTEX_ALIGNMENT, VERTEX_STRIDE_ALIGNMENT, WgslLanguageFeatures

## Buffers, textures, samplers, queries (02-buffers-textures-samplers.md)

AddressMode, Buffer, BufferAsyncError, BufferDescriptor, BufferSlice, BufferTextureCopyInfo, BufferTransition, BufferUsages, BufferUses, BufferView, BufferViewMut, CopyExternalImageDestInfo, Extent3d, ExternalTexture, ExternalTextureDescriptor, ExternalTextureFormat, ExternalTextureTransferFunction, FilterMode, ImageSubresourceRange, MapMode, MapRangeError, MipmapFilterMode, Origin2d, Origin3d, PredefinedColorSpace, QuerySet, QuerySetDescriptor, Sampler, SamplerBorderColor, SamplerDescriptor, StorageTextureAccess, TexelCopyBufferInfoBase, TexelCopyBufferLayout, TexelCopyTextureInfoBase, Texture, TextureAspect, TextureDataOrder, TextureDescriptor, TextureDimension, TextureSampleType, TextureTransition, TextureUsages, TextureUses, TextureView, TextureViewDescriptor, TextureViewDimension, WriteOnly, WriteOnlyIter

## Command encoding, render and compute passes, bundles (03-commands-and-passes.md)

CommandBuffer, CommandEncoder, CommandEncoderDescriptor, ComputePass, ComputePassDescriptor, ComputePassTimestampWrites, RenderBundle, RenderBundleDescriptor, RenderBundleEncoder, RenderBundleEncoderDescriptor, RenderEncoder, RenderPass, RenderPassColorAttachment, RenderPassDepthStencilAttachment, RenderPassDescriptor, RenderPassTimestampWrites, TexelCopyBufferInfo, TexelCopyTextureInfo

## Render state: primitive, blend, depth/stencil, multisample (04-render-state.md)

BlendComponent, BlendFactor, BlendOperation, BlendState, ColorTargetState, ColorWrites, CompareFunction, DepthBiasState, DepthStencilState, DispatchIndirectArgs, DrawIndexedIndirectArgs, DrawIndirectArgs, Face, FrontFace, IndexFormat, LoadOp, MultisampleState, Operations, PolygonMode, PrimitiveState, PrimitiveTopology, RenderBundleDepthStencil, StencilFaceState, StencilOperation, StencilState, StoreOp

## Pipelines, shaders, bind groups, vertex layouts (05-pipelines-shaders-bindings.md)

BindGroup, BindGroupDescriptor, BindGroupEntry, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingResource, BindingType, BufferBinding, BufferBindingType, CompilationInfo, CompilationMessage, CompilationMessageType, ComputePipeline, ComputePipelineDescriptor, FragmentState, MeshPipelineDescriptor, MeshState, PassthroughShaderEntryPoint, PipelineCache, PipelineCacheDescriptor, PipelineCompilationOptions, PipelineLayout, PipelineLayoutDescriptor, RenderPipeline, RenderPipelineDescriptor, SamplerBindingType, ShaderModule, ShaderModuleDescriptor, ShaderModuleDescriptorPassthrough, ShaderRuntimeChecks, ShaderSource, ShaderStages, SourceLocation, TaskState, VertexAttribute, VertexBufferLayout, VertexState, VertexStepMode

## Surface and presentation (06-surface-presentation.md)

CompositeAlphaMode, CreateSurfaceError, CurrentSurfaceTexture, DisplayAndWindowHandle, DisplayChromaticity, DisplayCoarseRange, DisplayGamut, DisplayHdrInfo, DisplayHeadroom, DisplayLuminance, PresentationTimestamp, PresentMode, Surface, SurfaceCapabilities, SurfaceColorSpace, SurfaceColorSpaces, SurfaceConfiguration, SurfaceFormatCapabilities, SurfaceStatus, SurfaceTarget, SurfaceTargetUnsafe, SurfaceTexture, WindowHandle

## Features and limits (07-features-limits.md)

DownlevelCapabilities, DownlevelFlags, DownlevelLimits, Features, FeaturesWebGPU, FeaturesWGPU, Limits, ShaderModel

## Texture formats (08-texture-formats.md)

AstcBlock, AstcChannel, TextureChannel, TextureFormat, TextureFormatFeatureFlags, TextureFormatFeatures

## Ray tracing (BLAS, TLAS) (09-ray-tracing.md)

AABB_GEOMETRY_MIN_STRIDE, AccelerationStructureFlags, AccelerationStructureGeometryFlags, AccelerationStructureUpdateMode, Blas, BlasAabbGeometry, BlasAABBGeometrySizeDescriptor, BlasAsyncError, BlasBuildEntry, BlasGeometries, BlasGeometrySizeDescriptors, BlasTriangleGeometry, BlasTriangleGeometrySizeDescriptor, ContextBlasAabbGeometry, ContextBlasBuildEntry, ContextBlasGeometries, ContextBlasTriangleGeometry, CreateBlasDescriptor, CreateTlasDescriptor, Tlas, TlasInstance

## wgpu::util helpers (10-util.md)

BufferInitDescriptor, DeviceExt, DownloadBuffer, initialize_adapter_from_env, initialize_adapter_from_env_or_default, is_browser_webgpu_supported, make_spirv_raw, new_instance_with_webgpu_detection, pipeline_cache_key, StagingBelt, TextureBlitter, TextureBlitterBuilder, TextureFormatExt

## Everything else (11-misc.md)

include_spirv_raw, include_wgsl, vertex_attr_array
