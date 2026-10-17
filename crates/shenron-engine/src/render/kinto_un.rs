// SPDX-License-Identifier: Apache-2.0

//! The Kinto-Un in real time: a signed-distance cloud built from the measured icon contour.
//!
//! The model is the smooth union of one sphere per lobe of the contour (centre and radius of
//! the arc tended on each chord, as drawn by `packages/ui/src/toriyama-svg/kinto-un.ts`) and of
//! an ellipsoid core, flattened in depth. Shading is manga cel, not gradient: the measured light
//! yellow above the terminator, the measured shadow yellow below it, an ink silhouette and an
//! ink crease wherever two lobes meet, which is where Toriyama draws his inner arcs.
//!
//! Like the ball, every measured value is an input: [`KintoUnUniforms::from_params`].

use bytemuck::{Pod, Zeroable};

/// Maximum number of lobes.
pub const MAX_LOBES: usize = 16;

/// Length of the flat parameter array: `outline, count, crease, core.xy, core radii.xyz,
/// smoothing, light.rgb, shadow.rgb, ink.rgb, lobes[16].(x, y, r)`.
pub const PARAM_LEN: usize = 9 + 9 + MAX_LOBES * 3;

/// Uniform block of [`KINTO_UN_WGSL`].
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct KintoUnUniforms {
    /// `time, outline, count, crease`.
    pub params: [f32; 4],
    /// `tilt.x, tilt.y, core.x, core.y`.
    pub tilt_core: [f32; 4],
    /// `core radius x, y, z, smooth-union k`.
    pub core_radii: [f32; 4],
    /// Measured light yellow.
    pub light: [f32; 4],
    /// Measured shadow yellow.
    pub shadow: [f32; 4],
    /// Ink.
    pub ink: [f32; 4],
    /// Lobes `(x, y, r, 0)` in model space (y up, the cloud spans about −1..1).
    pub lobes: [[f32; 4]; MAX_LOBES],
}

impl KintoUnUniforms {
    /// Builds the uniforms from [`PARAM_LEN`] floats, or `None` when the array is short, the lobe
    /// count is outside `3..=16` or a radius is not positive.
    #[must_use]
    pub fn from_params(p: &[f32]) -> Option<Self> {
        if p.len() < PARAM_LEN {
            return None;
        }
        let count = p[1];
        if !(3.0..=MAX_LOBES as f32).contains(&count) || count.fract() != 0.0 {
            return None;
        }
        let mut lobes = [[0.0; 4]; MAX_LOBES];
        for (i, lobe) in p[18..18 + MAX_LOBES * 3].chunks_exact(3).enumerate() {
            if i < count as usize && lobe[2] <= 0.0 {
                return None;
            }
            lobes[i] = [lobe[0], lobe[1], lobe[2], 0.0];
        }
        let rgb = |i: usize| [p[i], p[i + 1], p[i + 2], 1.0];
        Some(Self {
            params: [0.0, p[0], count, p[2]],
            tilt_core: [0.0, 0.0, p[3], p[4]],
            core_radii: [p[5], p[6], p[7], p[8]],
            light: rgb(9),
            shadow: rgb(12),
            ink: rgb(15),
            lobes,
        })
    }

    /// Sets the animation time (seconds) and the pointer tilt.
    pub fn set_frame(&mut self, time: f32, tilt_x: f32, tilt_y: f32) {
        self.params[0] = time;
        self.tilt_core[0] = tilt_x;
        self.tilt_core[1] = tilt_y;
    }
}

/// Vertex and fragment shader of the cloud.
pub const KINTO_UN_WGSL: &str = r"
struct Cloud {
  params: vec4<f32>,
  tilt_core: vec4<f32>,
  core_radii: vec4<f32>,
  light: vec4<f32>,
  shadow: vec4<f32>,
  ink: vec4<f32>,
  lobes: array<vec4<f32>, 16>,
};
@group(0) @binding(0) var<uniform> cloud: Cloud;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var out: VsOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = p;
  return out;
}

// Depth of the cloud relative to its width: a nimbus is a cushion, not a ball.
const DEPTH: f32 = 0.55;

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn lobe(p: vec3<f32>, i: i32) -> f32 {
  let l = cloud.lobes[i];
  let q = vec3<f32>(p.xy - l.xy, p.z / DEPTH);
  return length(q) - l.z;
}

fn core(p: vec3<f32>) -> f32 {
  let r = cloud.core_radii.xyz;
  let q = (p - vec3<f32>(cloud.tilt_core.zw, 0.0)) / r;
  return (length(q) - 1.0) * min(r.x, min(r.y, r.z));
}

// Returns (distance, crease): `crease` is small where the two nearest lobes are equidistant.
fn field(p: vec3<f32>) -> vec2<f32> {
  let count = i32(cloud.params.z);
  let k = cloud.core_radii.w;
  var d = core(p);
  var d1 = 1e3;
  var d2 = 1e3;
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= count) {
      break;
    }
    let di = lobe(p, i);
    d = smin(d, di, k);
    if (di < d1) {
      d2 = d1;
      d1 = di;
    } else if (di < d2) {
      d2 = di;
    }
  }
  // A crease only exists in the valley where two lobes BOTH reach the surface; elsewhere the
  // bisector of two lobes runs through the core and must not draw.
  let valley = select(1e3, abs(d1 - d2), d2 < cloud.params.w * 2.0);
  return vec2<f32>(d, valley);
}

fn rotate(p: vec3<f32>, a: vec2<f32>) -> vec3<f32> {
  let cx = cos(a.x);
  let sx = sin(a.x);
  let cy = cos(a.y);
  let sy = sin(a.y);
  let y = vec3<f32>(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  return vec3<f32>(y.x, cx * y.y - sx * y.z, sx * y.y + cx * y.z);
}

fn normal(p: vec3<f32>) -> vec3<f32> {
  let e = vec2<f32>(0.002, 0.0);
  return normalize(vec3<f32>(
    field(p + e.xyy).x - field(p - e.xyy).x,
    field(p + e.yxy).x - field(p - e.yxy).x,
    field(p + e.yyx).x - field(p - e.yyx).x,
  ));
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let time = cloud.params.x;
  let outline = cloud.params.y;
  let crease_width = cloud.params.w;
  // The nimbus floats: a slow bob, a sway around the vertical axis and the pointer tilt.
  let angles = vec2<f32>(cloud.tilt_core.x * 0.6 + 0.06 * sin(time * 0.8),
                         cloud.tilt_core.y * 0.8 + 0.18 * sin(time * 0.45));
  let bob = 0.035 * sin(time * 1.3);

  // Orthographic ray towards -z, in model space.
  var origin = rotate(vec3<f32>(in.uv.x, in.uv.y - bob, 2.0), angles);
  let dir = rotate(vec3<f32>(0.0, 0.0, -1.0), angles);
  var t = 0.0;
  var closest = 1e3;
  var hit = false;
  for (var s = 0; s < 64; s = s + 1) {
    let d = field(origin + dir * t).x;
    closest = min(closest, d);
    if (d < 0.001) {
      hit = true;
      break;
    }
    t = t + d * 0.9;
    if (t > 4.0) {
      break;
    }
  }

  let aa = fwidth(in.uv.x) * 1.5;
  if (!hit) {
    // Outside: the ink silhouette is the band of rays that passed close to the surface.
    let ink = 1.0 - smoothstep(outline - aa, outline + aa, closest);
    return vec4<f32>(cloud.ink.rgb * ink, ink);
  }

  let p = origin + dir * t;
  let f = field(p);
  let n = normal(p);
  // Manga cel shading: one terminator, light from the top, the measured two yellows.
  let l = normalize(rotate(vec3<f32>(-0.25, 1.0, 0.55), angles));
  // Terminator above the equator: the manga shadow band covers the lower third of the cloud.
  let lit = smoothstep(0.18 - aa * 4.0, 0.18 + aa * 4.0, dot(n, l));
  var color = mix(cloud.shadow.rgb, cloud.light.rgb, lit);
  // Ink: the silhouette rim, and the creases where two lobes meet near the surface.
  let rim = 1.0 - smoothstep(0.18, 0.26, abs(dot(n, -dir)));
  let crease = 1.0 - smoothstep(crease_width * 0.5, crease_width, f.y);
  color = mix(color, cloud.ink.rgb, max(rim, crease * step(0.0, dot(n, -dir))));
  return vec4<f32>(color, 1.0);
}
";

#[cfg(test)]
mod tests {
    use super::*;

    fn params(count: f32) -> Vec<f32> {
        let mut p = vec![0.02, count, 0.03, 0.0, 0.0, 0.7, 0.45, 0.4, 0.12];
        p.extend([0.99, 0.94, 0.23, 0.89, 0.75, 0.02, 0.1, 0.1, 0.1]);
        p.extend((0..MAX_LOBES).flat_map(|i| [i as f32 * 0.1 - 0.8, 0.1, 0.25]));
        p
    }

    #[test]
    fn uniform_layout_matches_the_wgsl_struct() {
        // 6 vec4 + array<vec4, 16>: 352 bytes, 16-byte aligned.
        assert_eq!(size_of::<KintoUnUniforms>(), 352);
        assert_eq!(PARAM_LEN, 66);
    }

    #[test]
    fn params_flatten_into_uniforms() {
        let u = KintoUnUniforms::from_params(&params(9.0)).expect("valid params");
        assert_eq!(u.params, [0.0, 0.02, 9.0, 0.03]);
        assert_eq!(u.core_radii, [0.7, 0.45, 0.4, 0.12]);
        assert_eq!(u.light, [0.99, 0.94, 0.23, 1.0]);
        assert_eq!(u.ink, [0.1, 0.1, 0.1, 1.0]);
        assert!((u.lobes[2][0] - -0.6).abs() < 1e-6);
        assert_eq!(u.lobes[2][2], 0.25);
    }

    #[test]
    fn invalid_params_are_refused() {
        assert!(KintoUnUniforms::from_params(&params(2.0)).is_none());
        assert!(KintoUnUniforms::from_params(&params(17.0)).is_none());
        assert!(KintoUnUniforms::from_params(&[0.0; 20]).is_none());
        let mut flat = params(9.0);
        flat[18 + 2] = 0.0; // first lobe radius
        assert!(KintoUnUniforms::from_params(&flat).is_none());
    }

    #[test]
    fn the_shader_is_valid_wgsl() {
        crate::render::toriyama3d::validate_wgsl(KINTO_UN_WGSL);
    }
}
