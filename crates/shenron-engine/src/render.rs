// SPDX-License-Identifier: Apache-2.0

//! Modern Unified Rendering Pipeline: GPU backend abstraction, 3D meshes & procedural geometry,
//! CPU & GPU rasterization, GLB parsing, clustered lighting, and virtual geometry.

pub mod dragon_ball;
pub mod glb;
pub mod gpu_backend;
pub mod gpu_context;
pub mod gpu_driven;
pub mod kinto_un;
pub mod lighting;
pub mod manga_scene;
pub mod mesh;
pub mod model_adapter;
pub mod model_serve;
pub mod pixel_perfect;
pub mod pixel_sprite;
pub mod postprocess;
pub mod raster3d;
pub mod shaders;
pub mod skinned;
pub mod toriyama3d;
pub mod virtual_geometry;

pub use dragon_ball::{DRAGON_BALL_WGSL, DragonBallUniforms};
pub use glb::{GlbError, parse_glb};
pub use gpu_backend::{
    AdapterReport, ComputeLimits, DeviceLimits, DeviceRequest, GpuBackendError, GpuDevice,
    GpuReport, SurfaceFormat, SurfaceRequest, WgslJob, create_instance, enumerate_adapters,
    request_adapter, request_device, run_wgsl_compute, surface_configuration,
};
pub use gpu_context::{GpuContext, GpuError};
pub use gpu_driven::{
    DrawIndexedIndirectArgs, DrawIndirectArgs, GpuInstanceData, IndirectDrawBuffer,
    InstanceStorageBuffer,
};
pub use kinto_un::{KINTO_UN_WGSL, KintoUnUniforms};
pub use lighting::{CascadedShadowMaps, ClusterGrid, GpuLight, VoxelVolumeUniforms};
pub use manga_scene::{
    MANGA_SCENE_WGSL, MangaScenePipeline, PanelRect, SceneQuad, SceneUniforms, SegmentOptions,
    scene_camera, scene_quads, segment_panels,
};
pub use mesh::{
    Camera3d, Geometry, MeshCache, MeshData, MeshError, Model, Primitive, Ray3d, Texture,
    pick_triangle,
};
pub use model_serve::{
    GpuCharacterModel, GpuPrimitive, ModelServePipeline, ModelUniforms, ModelVertex,
    TurntableCamera,
};
pub use pixel_perfect::{
    AlphaMode, ColorSpace, Framebuffer, PixelBox, PixelError, PixelTexture, blend_state,
    nearest_sampler_descriptor, pixel_perfect_box, pixel_rect_to_clip, snap_sprite_position,
    snapped_ortho, texel_center_uv,
};
pub use pixel_sprite::{SpriteGpuError, render_sprite_rgba};
pub use postprocess::{HaltonSequence, PostProcessUniforms};
pub use raster3d::{DISTANCE_CAMERA, FOCALE, TILT, couleur_fond, render_model_cpu};
pub use toriyama3d::{ToriyamaModel, ToriyamaPipeline, ToriyamaUniforms};
pub use virtual_geometry::{
    HiZCulling, Meshlet, MeshletBounds, MeshletBuilder, pack_visibility_id, unpack_visibility_id,
};
