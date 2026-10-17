"use client";

/**
 * DragonBall3D — the crystal ball in real-time 3D (WebGL2), drawn from the
 * measured palette of `toriyama-svg/sphere`.
 *
 * Each pixel casts a ray at a unit sphere: the crystal takes the measured
 * radial gradient (focus top-left, `#fdffea` → `#ef9a2b`), a Fresnel rim, a
 * specular spot and Toriyama's ink outline (4.5 % of the diameter). The stars
 * float on a plane INSIDE the ball and are seen through the glass, bent by a
 * refraction offset, so they slide against the surface as the ball turns: the
 * parallax is what reads as depth.
 *
 * No WebGL2, a lost context or a server render → the SVG `DragonBallSphere`.
 * `prefers-reduced-motion` → one still frame. Off screen → no frames drawn.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  SPHERE_CERNE,
  SPHERE_DEGRADE,
  SPHERE_ETOILES,
  SPHERE_FOYER,
  SPHERE_R_EXT,
  SPHERE_R_INT,
  SPHERE_R_ETOILE,
  SPHERE_ROUGE_ETOILE,
  SPHERE_BOITE,
  type DragonBallStars,
} from "../toriyama-svg/sphere";
import { DragonBallSphere } from "./DragonBallSphere";

export interface DragonBall3DProps {
  stars?: DragonBallStars;
  /** CSS size of the square canvas. */
  size?: number | string;
  /** Accessible name; ignored when `decorative`. */
  title?: string;
  decorative?: boolean;
  /** Follow the pointer with a slight tilt. */
  interactive?: boolean;
  className?: string;
}

const hex = (value: string): [number, number, number] => {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Measured constants, in the unit-sphere space of the shader. */
const CORE = hex(SPHERE_DEGRADE[0]![1]);
const MID = hex(SPHERE_DEGRADE[5]![1]);
const EDGE = hex(SPHERE_DEGRADE.at(-1)![1]);
const STAR = hex(SPHERE_ROUGE_ETOILE);
const FOCUS: [number, number] = [
  (SPHERE_FOYER.x - SPHERE_R_EXT) / SPHERE_R_INT,
  -(SPHERE_FOYER.y - SPHERE_R_EXT) / SPHERE_R_INT,
];
const OUTLINE = SPHERE_CERNE / SPHERE_R_EXT;

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform float time;
uniform vec2 tilt;
uniform int count;
uniform vec2 starsAt[7];
uniform vec3 core, mid, edge, star;
uniform vec2 focus;
uniform float outline;
uniform float starRadius;

float starSdf(vec2 p, float r) {
  // Five-point star, Inigo Quilez's polar fold.
  const float k1x = 0.809016994, k2x = 0.309016994, k1y = 0.587785252, k2y = 0.951056516;
  const vec2 k1 = vec2(k1x, -k1y), k2 = vec2(-k1x, -k1y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.45 * vec2(k1y, k1x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

mat3 rotation(vec2 a) {
  float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y);
  return mat3(cy, 0.0, -sy, sx * sy, cx, sx * cy, cx * sy, -sx, cx * cy);
}

void main() {
  float outer = 1.0;
  float inner = 1.0 - outline;
  float r = length(uv);
  float aa = fwidth(r) * 1.5;
  if (r > outer + aa) { color = vec4(0.0); return; }

  // Ink outline: the ring between the crystal and the silhouette.
  float ink = smoothstep(inner - aa, inner + aa, r);
  vec2 q = uv / inner;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = vec3(q, z);

  // Measured radial gradient, focus top-left.
  // Focal radialGradient parametrisation: t = |p - f| / |hit - f| along the ray from f.
  vec2 fd = q - focus;
  float fl = length(fd);
  vec2 dirf = fl > 1e-4 ? fd / fl : vec2(1.0, 0.0);
  float bf = dot(focus, dirf);
  float hit = -bf + sqrt(max(0.0, bf * bf - dot(focus, focus) + 1.0));
  float g = clamp(fl / max(hit, 1e-4), 0.0, 1.0);
  vec3 glass = g < 0.5 ? mix(core, mid, g * 2.0) : mix(mid, edge, (g - 0.5) * 2.0);

  // Stars on the centre plane, seen through the glass: refraction pulls the
  // lookup towards the rim, and the drift moves them against the surface.
  vec2 drift = tilt * 0.35 + vec2(0.06 * sin(time * 0.35), 0.04 * sin(time * 0.27));
  float spin = 0.12 * sin(time * 0.22) + tilt.y * 0.2;
  vec2 plane = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * (q - n.xy * 0.22 * z) - drift;
  float d = 1e3;
  for (int i = 0; i < 7; i++) {
    if (i >= count) break;
    d = min(d, starSdf(plane - starsAt[i], starRadius));
  }
  float starMask = 1.0 - smoothstep(-aa, aa, d);
  vec3 lit = mix(glass, star * (0.82 + 0.18 * z), starMask);

  // Light: Fresnel rim, soft key light from the top-left, hard specular spot.
  vec3 l = normalize(vec3(-0.45, 0.6, 0.65));
  float diffuse = 0.9 + 0.1 * max(dot(n, l), 0.0);
  float fresnel = pow(1.0 - z, 3.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
  vec3 c = lit * diffuse + edge * fresnel * 0.35 + vec3(spec * 0.9);

  c = mix(c, vec3(0.0), ink);
  float alpha = 1.0 - smoothstep(outer - aa, outer + aa, r);
  color = vec4(c * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

export function DragonBall3D({
  stars = 4,
  size = 160,
  title = "Dragon Ball",
  decorative = false,
  interactive = true,
  className = "",
}: DragonBall3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext("webgl2", { premultipliedAlpha: true, antialias: true });
    if (!el || !gl) {
      setFallback(true);
      return;
    }
    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link failed");
    } catch {
      setFallback(true);
      return;
    }
    // oxlint-disable-next-line react/rules-of-hooks -- WebGL useProgram, not a React hook
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    // viewBox fractions → unit-crystal space (radius SPHERE_R_INT), y up.
    const scale = SPHERE_BOITE / SPHERE_R_INT;
    const positions = SPHERE_ETOILES[stars].flatMap(([x, y]) => [x * scale, -y * scale]);
    gl.uniform1i(u("count"), SPHERE_ETOILES[stars].length);
    gl.uniform2fv(
      u("starsAt"),
      new Float32Array([...positions, ...Array(14).fill(0)].slice(0, 14)),
    );
    gl.uniform3fv(u("core"), CORE);
    gl.uniform3fv(u("mid"), MID);
    gl.uniform3fv(u("edge"), EDGE);
    gl.uniform3fv(u("star"), STAR);
    gl.uniform2fv(u("focus"), FOCUS);
    gl.uniform1f(u("outline"), OUTLINE);
    gl.uniform1f(u("starRadius"), SPHERE_R_ETOILE[stars]);
    const uTime = u("time");
    const uTilt = u("tilt");

    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    let visible = true;
    let frame = 0;
    const start = performance.now();

    const draw = () => {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(el.clientWidth * dpr));
      if (el.width !== w || el.height !== w) {
        el.width = w;
        el.height = w;
        gl.viewport(0, 0, w, w);
      }
      tilt.x += (tilt.tx - tilt.x) * 0.08;
      tilt.y += (tilt.ty - tilt.y) * 0.08;
      gl.uniform1f(uTime, reduced ? 0 : (performance.now() - start) / 1000);
      gl.uniform2f(uTilt, tilt.x, tilt.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = () => {
      draw();
      frame = visible && !reduced ? requestAnimationFrame(loop) : 0;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible && !frame && !reduced) frame = requestAnimationFrame(loop);
    });
    observer.observe(el);
    const onPointer = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      tilt.ty = ((event.clientX - box.left) / box.width - 0.5) * 0.9;
      tilt.tx = ((event.clientY - box.top) / box.height - 0.5) * 0.9;
      if (reduced) {
        tilt.x = tilt.tx;
        tilt.y = tilt.ty;
        draw();
      }
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    if (interactive) globalThis.addEventListener("pointermove", onPointer, { passive: true });
    el.addEventListener("webglcontextlost", onLost);
    loop();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      globalThis.removeEventListener("pointermove", onPointer);
      el.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [stars, interactive]);

  const style: CSSProperties = { width: size, height: size };
  if (fallback) {
    return (
      <DragonBallSphere
        stars={stars}
        size={size}
        title={title}
        decorative={decorative}
        className={className}
      />
    );
  }
  return (
    <canvas
      ref={canvas}
      style={style}
      className={`block aspect-square ${className}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
    />
  );
}
