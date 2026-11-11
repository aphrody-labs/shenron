// SPDX-License-Identifier: Apache-2.0
// Shenron Engine — ArcSys Toon & Inverted Hull Shader Package
// Targets: WGPU 30 & WebGPU WGSL v1.0

// ============================================================================
// UNIFORM STRUCTS & BINDINGS
// ============================================================================

struct CameraUniforms {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    proj: mat4x4<f32>,
    eye_pos: vec4<f32>,
    viewport_size: vec2<f32>, // width, height in pixels
    aspect_ratio: f32,
    _pad: f32,
};

struct LightUniforms {
    direction: vec4<f32>,    // xyz = normalized direction to light, w = intensity
    color: vec4<f32>,        // rgb = light color
    ambient_color: vec4<f32>,// rgb = ambient fill color
    shadow_color: vec4<f32>, // rgb = base shadow color tint
};

struct ArcSysMaterialUniforms {
    outline_width: f32,       // World-space outline width factor (~0.003 - 0.008)
    outline_z_push: f32,      // Outline depth bias to eliminate z-fighting (~0.001)
    shadow_threshold: f32,    // Cel division line (~0.4 - 0.55)
    shadow_bias_weight: f32,  // Multiplier for Vertex Color R bias (~0.8)
    ilm_bias_weight: f32,     // Multiplier for ILM G bias (~0.7)
    specular_threshold: f32,  // Hard specular step cut (~0.75)
    specular_power: f32,      // Base exponent multiplier for ILM Alpha (~64.0)
    rim_threshold: f32,       // Fresnel rim lighting threshold (~0.6)
    rim_power: f32,           // Fresnel curve exponent (~3.0)
    rim_color: vec4<f32>,     // Aura / rim light tint
    outline_color: vec4<f32>, // Solid fallback outline color
};

@group(0) @binding(0) var<uniform> u_camera: CameraUniforms;
@group(0) @binding(1) var<uniform> u_light: LightUniforms;
@group(0) @binding(2) var<uniform> u_material: ArcSysMaterialUniforms;

@group(1) @binding(0) var t_base_color: texture_2d<f32>;
@group(1) @binding(1) var s_base_color: sampler;
@group(1) @binding(2) var t_ilm: texture_2d<f32>;
@group(1) @binding(3) var s_ilm: sampler;

// ============================================================================
// PASS 1: INVERTED HULL OUTLINE (Draw Back-Faces with Front-Face Culling)
// ============================================================================

struct VertexInputOutline {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>, // R: shadow bias, G: outline thick, B: mat, A: outline toggle
    @location(4) model_0: vec4<f32>,
    @location(5) model_1: vec4<f32>,
    @location(6) model_2: vec4<f32>,
    @location(7) model_3: vec4<f32>,
};

struct VertexOutputOutline {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) vertex_color: vec4<f32>,
};

@vertex
fn vs_outline(in: VertexInputOutline) -> VertexOutputOutline {
    var out: VertexOutputOutline;
    out.uv = in.uv;
    out.vertex_color = in.color;

    // Early zero-thickness exit (vertex alpha toggle or green thickness zero)
    if (in.color.g <= 0.001 || in.color.a <= 0.001) {
        out.clip_pos = vec4<f32>(0.0, 0.0, 2.0, 1.0); // Degenerate clip position
        return out;
    }

    let model = mat4x4<f32>(in.model_0, in.model_1, in.model_2, in.model_3);
    let world_pos = model * vec4<f32>(in.position, 1.0);
    
    // Transform normal into view space
    let normal_matrix = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
    let world_normal = normalize(normal_matrix * in.normal);
    let view_normal = normalize((u_camera.view * vec4<f32>(world_normal, 0.0)).xyz);

    // Compute clip-space position
    var clip_position = u_camera.view_proj * world_pos;

    // ArcSys Inverted Hull Extrusion with Perspective Correction:
    let thickness = u_material.outline_width * in.color.g;
    var screen_offset = vec2<f32>(view_normal.x, view_normal.y);
    screen_offset.x /= u_camera.aspect_ratio;

    // Extrude in clip space proportional to depth (clip_position.w)
    clip_position.x += screen_offset.x * thickness * clip_position.w;
    clip_position.y += screen_offset.y * thickness * clip_position.w;

    // Z-push to suppress z-fighting against front-facing inner mesh
    clip_position.z += u_material.outline_z_push * clip_position.w;

    out.clip_pos = clip_position;
    return out;
}

@fragment
fn fs_outline(in: VertexOutputOutline) -> @location(0) vec4<f32> {
    if (in.vertex_color.a <= 0.001) {
        discard;
    }

    // Sample base diffuse for tinted outlines
    let diffuse = textureSample(t_base_color, s_base_color, in.uv);
    if (diffuse.a <= 0.1) {
        discard;
    }

    // Blend darkened base color with material outline tint
    let tinted_outline = diffuse.rgb * 0.25;
    let final_outline = mix(u_material.outline_color.rgb, tinted_outline, 0.65);

    return vec4<f32>(final_outline, diffuse.a);
}

// ============================================================================
// PASS 2: FORWARD ARCSYS CEL SHADING PASS (Draw Front-Faces)
// ============================================================================

struct VertexInputToon {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>, // R: bias, G: outline, B: mat/spec mask, A: toggle
    @location(4) model_0: vec4<f32>,
    @location(5) model_1: vec4<f32>,
    @location(6) model_2: vec4<f32>,
    @location(7) model_3: vec4<f32>,
};

struct VertexOutputToon {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) vertex_color: vec4<f32>,
    @location(4) view_dir: vec3<f32>,
};

@vertex
fn vs_toon(in: VertexInputToon) -> VertexOutputToon {
    var out: VertexOutputToon;
    let model = mat4x4<f32>(in.model_0, in.model_1, in.model_2, in.model_3);
    let world_pos = model * vec4<f32>(in.position, 1.0);

    let normal_matrix = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
    let world_normal = normalize(normal_matrix * in.normal);

    out.clip_pos = u_camera.view_proj * world_pos;
    out.world_pos = world_pos.xyz;
    out.world_normal = world_normal;
    out.uv = in.uv;
    out.vertex_color = in.color;
    out.view_dir = normalize(u_camera.eye_pos.xyz - world_pos.xyz);
    return out;
}

@fragment
fn fs_toon(in: VertexOutputToon) -> @location(0) vec4<f32> {
    // 1. Texture Fetching
    let base_color = textureSample(t_base_color, s_base_color, in.uv);
    if (base_color.a <= 0.05) {
        discard;
    }

    // ILM Map: R = Specular, G = Shadow Mask, B = Detail Lines, A = Gloss/Ramp
    let ilm = textureSample(t_ilm, s_ilm, in.uv);

    let N = normalize(in.world_normal);
    let L = normalize(u_light.direction.xyz);
    let V = normalize(in.view_dir);
    let H = normalize(L + V);

    // 2. ArcSys Shading Coordinate with Vertex Color & ILM Biases
    let raw_n_dot_l = dot(N, L);
    let half_lambert = raw_n_dot_l * 0.5 + 0.5;

    // Apply Vertex Color Red (Shadow bias) and ILM Green (Shadow threshold modifier)
    let vc_bias = (in.vertex_color.r - 0.5) * u_material.shadow_bias_weight;
    let ilm_bias = (ilm.g - 0.5) * u_material.ilm_bias_weight;
    let biased_light = clamp(half_lambert + vc_bias + ilm_bias, 0.0, 1.0);

    // 3. Screen-Space Anti-Aliased Cel Step
    let threshold = u_material.shadow_threshold;
    let delta = max(fwidth(biased_light), 0.002);
    let cel_factor = smoothstep(threshold - delta, threshold + delta, biased_light);

    // 4. Color Tonal Separation
    let shadow_tint = base_color.rgb * u_light.shadow_color.rgb * u_light.ambient_color.rgb;
    let lit_tint = base_color.rgb * u_light.color.rgb;
    var shaded_diffuse = mix(shadow_tint, lit_tint, cel_factor);

    // 5. Apply Inner Detail Lines (ILM Blue Channel)
    let ink_line = ilm.b;
    shaded_diffuse = shaded_diffuse * ink_line;

    // 6. ArcSys Anime Specular Highlight
    let n_dot_h = max(0.0, dot(N, H));
    let gloss_exp = max(4.0, ilm.a * u_material.specular_power);
    let spec_factor = pow(n_dot_h, gloss_exp);
    let is_specular = step(u_material.specular_threshold, spec_factor);
    let specular_term = u_light.color.rgb * is_specular * ilm.r * in.vertex_color.b;

    // 7. Fresnel Rim Light (Aura Glow)
    let n_dot_v = max(0.0, dot(N, V));
    let fresnel = pow(1.0 - n_dot_v, u_material.rim_power);
    let light_mask = max(0.0, dot(N, L) * 0.5 + 0.5);
    let rim_step = step(u_material.rim_threshold, fresnel * light_mask);
    let rim_term = u_material.rim_color.rgb * rim_step * 0.8;

    // 8. Final Color Composition
    let final_rgb = shaded_diffuse + specular_term + rim_term;
    return vec4<f32>(final_rgb, base_color.a);
}
