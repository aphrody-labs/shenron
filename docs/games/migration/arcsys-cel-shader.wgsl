// SPDX-License-Identifier: Apache-2.0
// WebGPU WGSL ArcSys RED Engine Cel-Shading Shader
// Transpiled from ArcSys UE4.17 Material Graphs

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) color: vec4<f32>, // R=ShadowBias, G=OutlineThick, B=MaterialMask, A=OutlineToggle
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) color: vec4<f32>,
};

struct Uniforms {
  modelViewProjection: mat4x4<f32>,
  lightDirection: vec3<f32>,
  outlineMode: u32,
  outlineThickness: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var baseTexture: texture_2d<f32>;
@group(0) @binding(2) var baseSampler: sampler;
@group(0) @binding(3) var ilmTexture: texture_2d<f32>;
@group(0) @binding(4) var ilmSampler: sampler;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  var pos = in.position;

  if (uniforms.outlineMode == 1u) {
    // Inverted Hull Outline Pass: Extrude vertex along normal
    let weight = in.color.g * in.color.a * uniforms.outlineThickness;
    pos = pos + normalize(in.normal) * weight;
  }

  out.position = uniforms.modelViewProjection * vec4<f32>(pos, 1.0);
  out.worldPos = pos;
  out.normal = in.normal;
  out.uv = in.uv;
  out.color = in.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  if (uniforms.outlineMode == 1u) {
    // Anime Dark Brown Ink Silhouette
    return vec4<f32>(0.08, 0.04, 0.02, 1.0);
  }

  let diffuse = textureSample(baseTexture, baseSampler, in.uv);
  let ilm = textureSample(ilmTexture, ilmSampler, in.uv);

  let lightDir = normalize(uniforms.lightDirection);
  let NdotL = dot(normalize(in.normal), lightDir);

  // Steered vertex normal bias + ILM Channel G baked shadow
  let rampBias = in.color.r * 0.2 - 0.1 + (ilm.g - 0.5) * 0.3;
  let biasedNdotL = NdotL + rampBias;

  // 2-tone hard toon light ramp
  let toonFactor = select(0.35, 1.0, biasedNdotL > 0.05);

  // Specular from ILM Channel R
  let specFactor = ilm.r * select(0.0, 1.0, biasedNdotL > 0.6);

  let litColor = diffuse.rgb * toonFactor + vec3<f32>(specFactor * 0.4);

  // Inking lines from ILM Channel B
  let finalColor = litColor * ilm.b;

  return vec4<f32>(finalColor, diffuse.a);
}
