// SPDX-License-Identifier: Apache-2.0
/**
 * Canvas 2D view of the Dragon Pixel combat core, for browsers without WebGPU. It runs the same Rust
 * engine (`DragonPixelEngineWasm`) and the same gamepad mapper as the Bevy view and draws the render
 * packet; only the renderer differs.
 */
import type { DragonPixelBindings, DragonPixelEngine } from "@/lib/dragon-pixel-loader";
import type { ArenaHud, ArenaSelection, HudUi, MatchStatus } from "@/lib/dragon-pixel-options";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const GROUND_OFFSET = 110;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const STICK_DEADZONE = 0.15;
const START_BUTTON = 9;
const STANDARD_BUTTONS = 16;

type Color4 = [number, number, number, number];

interface PacketFighter {
  x: number;
  y: number;
  facing: number;
  state_index: number;
  aura_color: Color4;
  aura_intensity: number;
  flash_intensity: number;
}

interface Packet {
  camera: { shake_offset_x: number; shake_offset_y: number };
  arena: { arena_index: number; ground_y: number };
  player: PacketFighter;
  enemy: PacketFighter | null;
  projectiles: { x: number; y: number; width: number; height: number; color: Color4 }[];
  clash: { active: boolean; clash_x: number; clash_y: number; sphere_radius: number };
  particles: { x: number; y: number; size: number; life_ratio: number; color: Color4 }[];
  ui: HudUi;
}

type EngineInput = Record<string, boolean>;

const ARENA_COLORS: [string, string][] = [
  ["#8cc7f2", "#4d9447"],
  ["#7ab3f5", "#c2baa8"],
  ["#db9961", "#8f6644"],
  ["#80dbb8", "#348f6b"],
  ["#5275bd", "#ccccd4"],
  ["#e6cef5", "#f2e8cc"],
  ["#fadb6b", "#66b34d"],
];

const KEYS: Record<string, string[]> = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  jump: ["KeyW", "ArrowUp", "Space"],
  punch: ["KeyJ"],
  heavy: ["KeyK"],
  blast: ["KeyL"],
  special: ["KeyU"],
  ultimate: ["KeyI"],
  charge: ["KeyH"],
  transform: ["KeyT"],
  guard: ["ShiftLeft", "ShiftRight"],
  vanish: ["KeyV"],
  mash: ["KeyJ", "KeyK", "KeyL", "KeyU", "KeyI"],
};

/** Codes whose browser default (scrolling, focus change) must not fire while playing. */
export const GAME_KEY_CODES = new Set(
  [...Object.values(KEYS).flat(), "Enter"],
);

export interface CanvasView {
  configure(selection: ArenaSelection): void;
  setPaused(paused: boolean): void;
  hud(): ArenaHud | null;
  frames(): number;
  stop(): void;
}

const rgba = ([red, green, blue, alpha]: Color4, scale = 1): string =>
  `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha * scale})`;

export function startCanvasView(
  canvas: HTMLCanvasElement,
  bindings: DragonPixelBindings,
  initial: ArenaSelection,
): CanvasView {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("the canvas 2D context is unavailable");
  const held = new Set<string>();
  let selection = initial;
  let engine: DragonPixelEngine = create(bindings, selection);
  let paused = false;
  let status: MatchStatus = "playing";
  let packet: Packet | null = null;
  let frameCount = 0;
  let accumulator = 0;
  let last = performance.now();
  let raf = 0;
  let restartRequested = false;

  const onKeyDown = (event: KeyboardEvent) => {
    held.add(event.code);
    if (event.code === "Enter") restartRequested = true;
    if (GAME_KEY_CODES.has(event.code)) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const readInput = (): EngineInput => {
    const input: EngineInput = {};
    for (const [name, codes] of Object.entries(KEYS)) input[name] = codes.some((c) => held.has(c));
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
    if (pad) {
      const pressed = new Uint8Array(STANDARD_BUTTONS);
      pad.buttons.slice(0, STANDARD_BUTTONS).forEach((button, index) => {
        pressed[index] = button.pressed ? 1 : 0;
      });
      const mapped = JSON.parse(
        bindings.map_standard_gamepad(new Float32Array(pad.axes.slice(0, 2)), pressed, STICK_DEADZONE),
      ) as EngineInput;
      for (const [name, value] of Object.entries(mapped)) input[name] = Boolean(input[name]) || value;
      if (pressed[START_BUTTON]) restartRequested = true;
    }
    return input;
  };

  const rumble = () => {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
    const actuator = pad?.vibrationActuator;
    const events = JSON.parse(engine.poll_haptic_events_json()) as {
      weak_magnitude: number;
      strong_magnitude: number;
      duration_ms: number;
    }[];
    const event = events.at(-1);
    if (actuator && event)
      void actuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: event.duration_ms,
        weakMagnitude: event.weak_magnitude,
        strongMagnitude: event.strong_magnitude,
      });
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, STEP_SECONDS * MAX_STEPS_PER_FRAME);
    last = now;
    const input = readInput();
    if (!paused && status === "playing") {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
        status = engine.step(JSON.stringify(input), STEP_SECONDS) as MatchStatus;
        accumulator -= STEP_SECONDS;
        steps += 1;
      }
      rumble();
    } else if (!paused && restartRequested) {
      engine.free();
      engine = create(bindings, selection);
      status = "playing";
    }
    restartRequested = false;
    packet = JSON.parse(engine.get_render_packet_json()) as Packet;
    draw(context, canvas, packet);
    frameCount += 1;
  };
  raf = requestAnimationFrame(frame);

  return {
    configure(next) {
      selection = next;
      engine.free();
      engine = create(bindings, selection);
      status = "playing";
    },
    setPaused(next) {
      paused = next;
      last = performance.now();
    },
    hud: () => (packet ? { status, paused, ui: packet.ui } : null),
    frames: () => frameCount,
    stop() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("blur", onBlur);
      engine.free();
    },
  };
}

function create(bindings: DragonPixelBindings, selection: ArenaSelection): DragonPixelEngine {
  return new bindings.DragonPixelEngineWasm(
    selection.fighter,
    selection.mode,
    selection.chapter,
    selection.arena,
  );
}

function draw(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, packet: Packet): void {
  const scale = Math.min(canvas.width / VIEW_WIDTH, canvas.height / VIEW_HEIGHT);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const [sky, ground] = ARENA_COLORS[packet.arena.arena_index] ?? ARENA_COLORS[1]!;
  const shakeX = packet.camera.shake_offset_x;
  const shakeY = packet.camera.shake_offset_y;
  const floor = packet.arena.ground_y + GROUND_OFFSET;
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
  context.save();
  context.translate(shakeX, shakeY);
  context.fillStyle = ground;
  context.fillRect(-20, floor, VIEW_WIDTH + 40, VIEW_HEIGHT);
  for (const fighter of [packet.player, packet.enemy]) {
    if (fighter) drawFighter(context, fighter, floor, packet.arena.ground_y);
  }
  for (const projectile of packet.projectiles) {
    context.fillStyle = rgba(projectile.color);
    context.beginPath();
    context.ellipse(
      projectile.x,
      projectile.y + GROUND_OFFSET,
      Math.max(projectile.width, 12) / 2,
      Math.max(projectile.height, 12) / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  if (packet.clash.active) {
    context.fillStyle = "rgba(255,255,255,0.85)";
    context.beginPath();
    context.arc(
      packet.clash.clash_x,
      packet.clash.clash_y + GROUND_OFFSET,
      packet.clash.sphere_radius,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  for (const particle of packet.particles) {
    context.fillStyle = rgba(particle.color, particle.life_ratio);
    context.fillRect(particle.x, particle.y + GROUND_OFFSET, particle.size, particle.size);
  }
  context.restore();
}

function drawFighter(
  context: CanvasRenderingContext2D,
  fighter: PacketFighter,
  floor: number,
  groundY: number,
): void {
  const feet = fighter.y - groundY + floor;
  if (fighter.aura_intensity > 0) {
    context.fillStyle = rgba(fighter.aura_color, 0.3 * fighter.aura_intensity);
    context.beginPath();
    context.ellipse(fighter.x, feet - 42, 38, 62, 0, 0, Math.PI * 2);
    context.fill();
  }
  const flash = Math.round(fighter.flash_intensity * 255);
  context.fillStyle = flash > 0 ? `rgb(${flash},${flash},${flash})` : "#2b3a67";
  context.fillRect(fighter.x - 18, feet - 78, 36, 78);
  context.fillStyle = "#f0c299";
  context.beginPath();
  context.arc(fighter.x, feet - 92, 14, 0, Math.PI * 2);
  context.fill();
  if (fighter.state_index === 4) {
    context.fillStyle = "#f0c299";
    context.fillRect(fighter.x + Math.sign(fighter.facing) * 20 - 6, feet - 56, 12, 12);
  }
}
