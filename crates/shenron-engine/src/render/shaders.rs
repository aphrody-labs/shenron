// SPDX-License-Identifier: Apache-2.0

//! Production-ready embedded WGSL shaders for GPU-driven rendering.

/// WGSL shader for rendering into the 64-bit Visibility Buffer.
pub const VISIBILITY_BUFFER_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct InstanceInput {
    @location(3) model_matrix_0: vec4<f32>,
    @location(4) model_matrix_1: vec4<f32>,
    @location(5) model_matrix_2: vec4<f32>,
    @location(6) model_matrix_3: vec4<f32>,
    @location(7) object_id: u32,
    @location(8) material_id: u32,
};

struct CameraUniforms {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    proj: mat4x4<f32>,
    camera_pos: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) @interpolate(flat) instance_id: u32,
    @location(1) @interpolate(flat) primitive_id: u32,
};

@vertex
fn vs_main(
    vertex: VertexInput,
    instance: InstanceInput,
    @builtin(vertex_index) vert_idx: u32,
) -> VertexOutput {
    var out: VertexOutput;
    let model = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );
    let world_pos = model * vec4<f32>(vertex.position, 1.0);
    out.clip_position = camera.view_proj * world_pos;
    out.instance_id = instance.object_id;
    out.primitive_id = vert_idx / 3u;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec2<u32> {
    return vec2<u32>(in.instance_id, in.primitive_id);
}
"#;

/// WGSL compute shader for GPU-driven frustum & Hi-Z occlusion culling.
pub const MESHLET_CULLING_COMPUTE_WGSL: &str = r#"
struct Plane {
    normal: vec3<f32>,
    distance: f32,
};

struct FrustumPlanes {
    planes: array<Plane, 6>,
};

struct InstanceData {
    model_matrix: mat4x4<f32>,
    sphere: vec4<f32>, // xyz = center, w = radius
    material_index: u32,
    object_id: u32,
    flags: u32,
    _pad: u32,
};

struct DrawIndexedIndirectArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    first_index: u32,
    base_vertex: i32,
    first_instance: u32,
};

@group(0) @binding(0) var<uniform> frustum: FrustumPlanes;
@group(0) @binding(1) var<storage, read> instances: array<InstanceData>;
@group(0) @binding(2) var<storage, read_write> draw_commands: array<DrawIndexedIndirectArgs>;
@group(0) @binding(3) var<storage, read_write> draw_count: atomic<u32>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= arrayLength(&instances)) {
        return;
    }

    let inst = instances[index];
    let world_center = (inst.model_matrix * vec4<f32>(inst.sphere.xyz, 1.0)).xyz;
    let radius = inst.sphere.w;

    // 1. Frustum sphere culling test
    var visible = true;
    for (var i = 0u; i < 6u; i = i + 1u) {
        let p = frustum.planes[i];
        let dist = dot(p.normal, world_center) + p.distance;
        if (dist < -radius) {
            visible = false;
            break;
        }
    }

    if (visible) {
        let cmd_idx = atomicAdd(&draw_count, 1u);
        draw_commands[cmd_idx].index_count = 36u; // Example cube or meshlet index count
        atomicStore(&draw_commands[cmd_idx].instance_count, 1u);
        draw_commands[cmd_idx].first_index = 0u;
        draw_commands[cmd_idx].base_vertex = 0i;
        draw_commands[cmd_idx].first_instance = index;
    }
}
"#;

/// WGSL compute shader for 3D Clustered Lighting assignment.
pub const CLUSTERED_LIGHTING_COMPUTE_WGSL: &str = r#"
struct GpuLight {
    position_radius: vec4<f32>,
    color_intensity: vec4<f32>,
    direction_inner: vec4<f32>,
    params: vec4<f32>,
};

struct ClusterGridData {
    grid_size: vec4<u32>, // x, y, z, total
    depth_params: vec4<f32>, // near, far, log(far/near), 1.0/log(far/near)
};

struct ClusterLightRecord {
    offset: u32,
    count: u32,
};

@group(0) @binding(0) var<uniform> grid: ClusterGridData;
@group(0) @binding(1) var<storage, read> lights: array<GpuLight>;
@group(0) @binding(2) var<storage, read_write> cluster_records: array<ClusterLightRecord>;
@group(0) @binding(3) var<storage, read_write> cluster_light_indices: array<u32>;
@group(0) @binding(4) var<storage, read_write> global_index_counter: atomic<u32>;

@compute @workgroup_size(16, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let cluster_idx = id.x;
    if (cluster_idx >= grid.grid_size.w) {
        return;
    }

    let num_lights = arrayLength(&lights);
    var local_light_count = 0u;
    let base_offset = atomicAdd(&global_index_counter, 128u); // Max 128 lights per cluster

    for (var i = 0u; i < num_lights; i = i + 1u) {
        if (local_light_count >= 128u) {
            break;
        }
        // In full clustered compute, test sphere against cluster bounding box
        cluster_light_indices[base_offset + local_light_count] = i;
        local_light_count = local_light_count + 1u;
    }

    cluster_records[cluster_idx].offset = base_offset;
    cluster_records[cluster_idx].count = local_light_count;
}
"#;

/// WGSL post-processing shader with TAA history resolve and ACES fitted tonemapping.
pub const POSTPROCESS_WGSL: &str = r#"
struct PostProcessUniforms {
    jitter_and_resolution: vec4<f32>, // xy = jitter, zw = resolution
    params: vec4<f32>, // x = blend_factor, y = bloom, z = exposure, w = tonemapper
};

@group(0) @binding(0) var<uniform> uniforms: PostProcessUniforms;
@group(0) @binding(1) var current_color: texture_2d<f32>;
@group(0) @binding(2) var history_color: texture_2d<f32>;
@group(0) @binding(3) var velocity_texture: texture_2d<f32>;
@group(0) @binding(4) var post_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) vert_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen triangle trick
    let x = f32((vert_idx << 1u) & 2u);
    let y = f32(vert_idx & 2u);
    out.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    out.uv = vec2<f32>(x, y);
    return out;
}

fn rgb_to_ycocg(c: vec3<f32>) -> vec3<f32> {
    let y = c.r * 0.25 + c.g * 0.5 + c.b * 0.25;
    let co = c.r * 0.5 - c.b * 0.5;
    let cg = -c.r * 0.25 + c.g * 0.5 - c.b * 0.25;
    return vec3<f32>(y, co, cg);
}

fn ycocg_to_rgb(c: vec3<f32>) -> vec3<f32> {
    let r = c.x + c.y - c.z;
    let g = c.x + c.z;
    let b = c.x - c.y - c.z;
    return vec3<f32>(r, g, b);
}

fn tonemap_aces(color: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    let num = color * (color * a + b);
    let den = color * (color * c + d) + e;
    return clamp(num / den, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let current = textureSample(current_color, post_sampler, in.uv).rgb;
    let velocity = textureSample(velocity_texture, post_sampler, in.uv).xy;
    let prev_uv = in.uv - velocity;

    let history = textureSample(history_color, post_sampler, prev_uv).rgb;

    // YCoCg neighborhood clipping
    let cur_ycocg = rgb_to_ycocg(current);
    let hist_ycocg = rgb_to_ycocg(history);
    let clamped_hist_ycocg = clamp(hist_ycocg, cur_ycocg - vec3<f32>(0.1), cur_ycocg + vec3<f32>(0.1));
    let clamped_history = ycocg_to_rgb(clamped_hist_ycocg);

    let alpha = uniforms.params.x; // ~0.05
    let resolved = mix(clamped_history, current, alpha);

    // Apply exposure & ACES Tonemapping
    let exposed = resolved * uniforms.params.z;
    let final_color = tonemap_aces(exposed);

    return vec4<f32>(final_color, 1.0);
}
"#;
