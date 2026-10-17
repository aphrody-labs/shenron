// SPDX-License-Identifier: Apache-2.0

//! The crystal Dragon Ball rendered in real time on wgpu (WebGPU in the browser).
//!
//! One full-screen triangle, one fragment shader: each pixel casts a ray at a unit sphere. The
//! crystal takes the measured focal radial gradient, a Fresnel rim, a specular spot and
//! Toriyama's ink outline; the stars sit on the centre plane and are refracted through the glass,
//! so they drift against the surface as the ball turns.
//!
//! The palette and the star layout are *inputs*: their single owner is the measured table of
//! `packages/ui/src/toriyama-svg/sphere.ts`, flattened by [`DragonBallUniforms::from_params`].

use bytemuck::{Pod, Zeroable};

/// Maximum number of stars of a Dragon Ball.
pub const MAX_STARS: usize = 7;

/// Length of the flat parameter array accepted by [`DragonBallUniforms::from_params`]:
/// `outline, star_radius, count, focus.xy, core.rgb, mid.rgb, edge.rgb, star.rgb, stars[7].xy`.
pub const PARAM_LEN: usize = 3 + 2 + 4 * 3 + MAX_STARS * 2;

/// Uniform block of [`DRAGON_BALL_WGSL`]; the layout is checked by a test.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct DragonBallUniforms {
    /// `time, outline, star_radius, count`.
    pub params: [f32; 4],
    /// `tilt.x, tilt.y, focus.x, focus.y`.
    pub tilt_focus: [f32; 4],
    /// Gradient core (alpha unused).
    pub core: [f32; 4],
    /// Gradient middle stop.
    pub mid: [f32; 4],
    /// Gradient edge.
    pub edge: [f32; 4],
    /// Star red.
    pub star: [f32; 4],
    /// Star centres, two per vector, in unit-crystal space (y up).
    pub stars: [[f32; 4]; 4],
}

impl DragonBallUniforms {
    /// Builds the uniforms from the flat parameter array ([`PARAM_LEN`] floats). Returns `None`
    /// when the array is too short or the star count is outside `1..=7`.
    #[must_use]
    pub fn from_params(p: &[f32]) -> Option<Self> {
        if p.len() < PARAM_LEN {
            return None;
        }
        let count = p[2];
        if !(1.0..=MAX_STARS as f32).contains(&count) || count.fract() != 0.0 {
            return None;
        }
        let rgb = |i: usize| [p[i], p[i + 1], p[i + 2], 1.0];
        let mut stars = [[0.0; 4]; 4];
        for (i, pair) in p[17..17 + MAX_STARS * 2].chunks_exact(2).enumerate() {
            stars[i / 2][(i % 2) * 2] = pair[0];
            stars[i / 2][(i % 2) * 2 + 1] = pair[1];
        }
        Some(Self {
            params: [0.0, p[0], p[1], count],
            tilt_focus: [0.0, 0.0, p[3], p[4]],
            core: rgb(5),
            mid: rgb(8),
            edge: rgb(11),
            star: rgb(14),
            stars,
        })
    }

    /// Sets the animation time (seconds) and the pointer tilt (radians-ish, about ±0.45).
    pub fn set_frame(&mut self, time: f32, tilt_x: f32, tilt_y: f32) {
        self.params[0] = time;
        self.tilt_focus[0] = tilt_x;
        self.tilt_focus[1] = tilt_y;
    }
}

/// Vertex and fragment shader of the ball.
pub const DRAGON_BALL_WGSL: &str = r"
struct Ball {
  params: vec4<f32>,
  tilt_focus: vec4<f32>,
  core: vec4<f32>,
  mid: vec4<f32>,
  edge: vec4<f32>,
  star: vec4<f32>,
  stars: array<vec4<f32>, 4>,
};
@group(0) @binding(0) var<uniform> ball: Ball;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var out: VsOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x, p.y);
  return out;
}

// Five-point star, Inigo Quilez's polar fold; `rf` is the measured inner ratio 0.45.
fn star_sdf(q: vec2<f32>, r: f32) -> f32 {
  let k1 = vec2<f32>(0.809016994, -0.587785252);
  let k2 = vec2<f32>(-k1.x, k1.y);
  var p = vec2<f32>(abs(q.x), q.y);
  p = p - 2.0 * max(dot(k1, p), 0.0) * k1;
  p = p - 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y = p.y - r;
  let ba = 0.45 * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
  let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

fn star_at(i: i32) -> vec2<f32> {
  let v = ball.stars[i / 2];
  return select(v.xy, v.zw, (i % 2) == 1);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let time = ball.params.x;
  let outline = ball.params.y;
  let star_radius = ball.params.z;
  let count = i32(ball.params.w);
  let tilt = ball.tilt_focus.xy;
  let focus = ball.tilt_focus.zw;

  let r = length(in.uv);
  let aa = fwidth(r) * 1.5;
  if (r > 1.0 + aa) {
    return vec4<f32>(0.0);
  }

  // Ink outline: the ring between the crystal and the silhouette.
  let inner = 1.0 - outline;
  let ink = smoothstep(inner - aa, inner + aa, r);
  let q = in.uv / inner;
  let z = sqrt(max(0.0, 1.0 - dot(q, q)));
  let n = vec3<f32>(q, z);

  // Focal radialGradient parametrisation: t = |p - f| / |hit - f| along the ray from f.
  let fd = q - focus;
  let fl = length(fd);
  let dirf = select(vec2<f32>(1.0, 0.0), fd / fl, fl > 1e-4);
  let bf = dot(focus, dirf);
  let hit = -bf + sqrt(max(0.0, bf * bf - dot(focus, focus) + 1.0));
  let g = clamp(fl / max(hit, 1e-4), 0.0, 1.0);
  var glass = mix(ball.core.rgb, ball.mid.rgb, g * 2.0);
  if (g >= 0.5) {
    glass = mix(ball.mid.rgb, ball.edge.rgb, (g - 0.5) * 2.0);
  }

  // Stars on the centre plane, seen through the glass: refraction pulls the lookup towards the
  // rim and the drift moves them against the surface.
  let drift = tilt * 0.35 + vec2<f32>(0.06 * sin(time * 0.35), 0.04 * sin(time * 0.27));
  let spin = 0.12 * sin(time * 0.22) + tilt.y * 0.2;
  let c = cos(spin);
  let s = sin(spin);
  let base = q - n.xy * 0.22 * z;
  let plane = vec2<f32>(c * base.x - s * base.y, s * base.x + c * base.y) - drift;
  var d = 1e3;
  for (var i = 0; i < 7; i = i + 1) {
    if (i >= count) {
      break;
    }
    d = min(d, star_sdf(plane - star_at(i), star_radius));
  }
  let star_mask = 1.0 - smoothstep(-aa, aa, d);
  let lit = mix(glass, ball.star.rgb * (0.82 + 0.18 * z), star_mask);

  // Light: Fresnel rim, soft key light from the top-left, hard specular spot.
  let l = normalize(vec3<f32>(-0.45, 0.6, 0.65));
  let diffuse = 0.9 + 0.1 * max(dot(n, l), 0.0);
  let fresnel = pow(1.0 - z, 3.0);
  let spec = pow(max(dot(reflect(-l, n), vec3<f32>(0.0, 0.0, 1.0)), 0.0), 48.0);
  var color = lit * diffuse + ball.edge.rgb * fresnel * 0.35 + vec3<f32>(spec * 0.9);
  color = mix(color, vec3<f32>(0.0), ink);
  let alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  return vec4<f32>(color * alpha, alpha);
}
";

#[cfg(test)]
mod tests {
    use super::*;

    fn params(count: f32) -> Vec<f32> {
        let mut p = vec![0.09, 0.25, count, -0.3, 0.39];
        p.extend([1.0, 1.0, 0.9, 0.99, 0.8, 0.5, 0.94, 0.6, 0.17, 0.91, 0.12, 0.14]);
        p.extend((0..MAX_STARS * 2).map(|i| i as f32 * 0.1));
        p
    }

    #[test]
    fn uniform_layout_matches_the_wgsl_struct() {
        // 6 vec4 + array<vec4, 4>, no padding: 160 bytes, 16-byte aligned.
        assert_eq!(size_of::<DragonBallUniforms>(), 160);
        assert_eq!(PARAM_LEN, 31);
    }

    #[test]
    fn params_flatten_into_uniforms() {
        let u = DragonBallUniforms::from_params(&params(4.0)).expect("valid params");
        assert_eq!(u.params, [0.0, 0.09, 0.25, 4.0]);
        assert_eq!(u.tilt_focus, [0.0, 0.0, -0.3, 0.39]);
        assert_eq!(u.core, [1.0, 1.0, 0.9, 1.0]);
        assert_eq!(u.star, [0.91, 0.12, 0.14, 1.0]);
        // stars[i] = (0.2 i, 0.2 i + 0.1), two per vector.
        assert!((u.stars[0][2] - 0.2).abs() < 1e-6);
        assert!((u.stars[3][1] - 1.3).abs() < 1e-6);
    }

    #[test]
    fn invalid_params_are_refused() {
        assert!(DragonBallUniforms::from_params(&params(0.0)).is_none());
        assert!(DragonBallUniforms::from_params(&params(8.0)).is_none());
        assert!(DragonBallUniforms::from_params(&params(2.5)).is_none());
        assert!(DragonBallUniforms::from_params(&[0.0; 10]).is_none());
    }

    #[test]
    fn frame_updates_time_and_tilt_only() {
        let mut u = DragonBallUniforms::from_params(&params(1.0)).expect("valid params");
        u.set_frame(2.5, 0.1, -0.2);
        assert_eq!(u.params, [2.5, 0.09, 0.25, 1.0]);
        assert_eq!(u.tilt_focus, [0.1, -0.2, -0.3, 0.39]);
    }

    #[test]
    fn the_shader_is_valid_wgsl() {
        crate::render::toriyama3d::validate_wgsl(DRAGON_BALL_WGSL);
    }
}
