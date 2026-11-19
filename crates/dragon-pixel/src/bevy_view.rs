// SPDX-License-Identifier: Apache-2.0
//! Bevy 3D game of the Dragon Pixel combat engine for the browser (wasm32 and WebGPU).
//!
//! Bevy owns the loop: it reads the keyboard and the gamepads, steps [`DragonPixelEngineCore`] on a
//! fixed 60 Hz schedule and draws the state. JavaScript only starts the app, pauses it and reads a
//! HUD snapshot, so the page never re-implements the simulation.
use std::cell::RefCell;

use bevy::{
    input::gamepad::{Gamepad, GamepadButton},
    prelude::*,
    window::WindowPlugin,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::combat::DragonPixelEngineCore;
use crate::input::{EngineInput, GamepadType, parse_standard_gamepad};
use crate::render_packet::UiOverlayData;
use crate::scene_layout::{
    arena_palette, fighter_palette, hair_follows_form, world_height, world_x,
};
use crate::types::{ArenaId, FighterId, GameMode, HapticEvent};

const FIXED_HZ: f64 = 60.0;
const STICK_DEADZONE: f32 = 0.15;
const PROJECTILE_SLOTS: usize = 16;
const PARTICLE_SLOTS: usize = 48;
const HUD_REFRESH_FRAMES: u64 = 6;
const HAPTIC_BACKLOG: usize = 32;
const HIDDEN: Vec3 = Vec3::new(0.0, -50.0, 0.0);

/// Fighter, mode, chapter and arena of a match.
#[derive(Clone, Copy)]
struct Selection {
    fighter: FighterId,
    mode: GameMode,
    chapter: u32,
    arena: ArenaId,
}

impl Selection {
    fn parse(fighter: &str, mode: &str, chapter: u32, arena: &str) -> Self {
        Self {
            fighter: FighterId::from_str_loose(fighter),
            mode: GameMode::from_str_loose(mode),
            chapter,
            arena: ArenaId::from_str_loose(arena),
        }
    }

    fn engine(self) -> DragonPixelEngineCore {
        DragonPixelEngineCore::new(self.fighter, self.mode, self.chapter, self.arena)
    }
}

/// State shared between the Bevy schedules and the JavaScript calls (one thread on wasm32).
struct Bridge {
    started: bool,
    paused: bool,
    pending: Option<Selection>,
    frames: u64,
    hud: String,
    haptics: Vec<HapticEvent>,
}

thread_local! {
    static BRIDGE: RefCell<Bridge> = const {
        RefCell::new(Bridge {
            started: false,
            paused: false,
            pending: None,
            frames: 0,
            hud: String::new(),
            haptics: Vec::new(),
        })
    };
}

fn with_bridge<T>(action: impl FnOnce(&mut Bridge) -> T) -> T {
    BRIDGE.with(|bridge| action(&mut bridge.borrow_mut()))
}

#[derive(Serialize)]
struct Hud<'a> {
    frames: u64,
    status: &'a str,
    paused: bool,
    mode: GameMode,
    arena: &'a str,
    chapter: u32,
    fighter: &'a str,
    ui: UiOverlayData,
}

/// Starts the Bevy app on the canvas matching `canvas_selector`. It can run once per page.
#[wasm_bindgen]
pub fn dragon_pixel_start(
    canvas_selector: &str,
    fighter: &str,
    mode: &str,
    chapter: u32,
    arena: &str,
) -> Result<(), JsValue> {
    if with_bridge(|bridge| std::mem::replace(&mut bridge.started, true)) {
        return Err(JsValue::from_str("the Dragon Pixel Bevy app is already running"));
    }
    let selection = Selection::parse(fighter, mode, chapter, arena);
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            canvas: Some(canvas_selector.to_owned()),
            fit_canvas_to_parent: true,
            prevent_default_event_handling: false,
            ..default()
        }),
        ..default()
    }))
    .insert_resource(Time::<Fixed>::from_hz(FIXED_HZ))
    .insert_resource(Match { engine: selection.engine(), selection })
    .insert_resource(PadState::default())
    .add_systems(Startup, setup)
    .add_systems(FixedUpdate, (read_input, step_match).chain())
    .add_systems(Update, (apply_pending_selection, sync_scene, follow_camera).chain());
    app.run();
    Ok(())
}

/// Replaces the running match; also the restart after a win or a defeat.
#[wasm_bindgen]
pub fn dragon_pixel_configure(fighter: &str, mode: &str, chapter: u32, arena: &str) {
    let selection = Selection::parse(fighter, mode, chapter, arena);
    with_bridge(|bridge| bridge.pending = Some(selection));
}

#[wasm_bindgen]
pub fn dragon_pixel_set_paused(paused: bool) {
    with_bridge(|bridge| bridge.paused = paused);
}

/// Frames rendered by Bevy since the start; it keeps counting while the match is paused.
#[wasm_bindgen]
pub fn dragon_pixel_frames() -> f64 {
    with_bridge(|bridge| bridge.frames as f64)
}

/// Last HUD snapshot as JSON, empty before the first frame.
#[wasm_bindgen]
pub fn dragon_pixel_hud_json() -> String {
    with_bridge(|bridge| bridge.hud.clone())
}

/// Drains the rumble events of the engine as JSON for `GamepadHapticActuator.playEffect`.
#[wasm_bindgen]
pub fn dragon_pixel_take_haptics_json() -> String {
    let events = with_bridge(|bridge| std::mem::take(&mut bridge.haptics));
    serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_owned())
}

#[derive(Resource)]
struct Match {
    engine: DragonPixelEngineCore,
    selection: Selection,
}

#[derive(Resource, Default)]
struct PadState {
    input: EngineInput,
    restart: bool,
}

#[derive(Component)]
struct MainCamera;

#[derive(Component)]
struct Ground;

#[derive(Component)]
struct Sun;

#[derive(Clone, Copy, PartialEq)]
enum Side {
    Player,
    Enemy,
}

#[derive(Clone, Copy)]
enum Piece {
    Body,
    Head,
    Hair,
    Fist,
    Aura,
}

#[derive(Component, Clone, Copy)]
enum Slot {
    Fighter(Side, Piece),
    Projectile(usize),
    Particle(usize),
    Clash,
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    game: Res<Match>,
) {
    let palette = arena_palette(game.engine.arena);
    commands.insert_resource(ClearColor(rgb(palette.sky)));
    commands.insert_resource(GlobalAmbientLight {
        color: Color::WHITE,
        brightness: 450.0,
        ..default()
    });
    commands.spawn((
        Ground,
        Mesh3d(meshes.add(Cuboid::new(24.0, 0.4, 10.0))),
        MeshMaterial3d(materials.add(rgb(palette.ground))),
        Transform::from_xyz(0.0, -0.2, 0.0),
    ));
    commands.spawn((
        Sun,
        DirectionalLight { illuminance: 11_000.0, color: rgb(palette.light), ..default() },
        Transform::from_xyz(-4.0, 9.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        MainCamera,
        Camera3d::default(),
        Transform::from_xyz(0.0, 2.4, 9.5).looking_at(Vec3::new(0.0, 1.2, 0.0), Vec3::Y),
    ));

    let capsule = meshes.add(Capsule3d::new(0.28, 0.8));
    let sphere = meshes.add(Sphere::new(1.0).mesh().uv(20, 12));
    let mut spawn_slot = |slot: Slot, mesh: &Handle<Mesh>, blended: bool| {
        let material = StandardMaterial {
            base_color: Color::WHITE,
            unlit: blended,
            alpha_mode: if blended { AlphaMode::Blend } else { AlphaMode::Opaque },
            ..default()
        };
        commands.spawn((
            slot,
            Mesh3d(mesh.clone()),
            MeshMaterial3d(materials.add(material)),
            Transform::from_translation(HIDDEN),
            Visibility::Hidden,
        ));
    };
    for side in [Side::Player, Side::Enemy] {
        spawn_slot(Slot::Fighter(side, Piece::Body), &capsule, false);
        spawn_slot(Slot::Fighter(side, Piece::Head), &sphere, false);
        spawn_slot(Slot::Fighter(side, Piece::Hair), &sphere, false);
        spawn_slot(Slot::Fighter(side, Piece::Fist), &sphere, false);
        spawn_slot(Slot::Fighter(side, Piece::Aura), &sphere, true);
    }
    for index in 0..PROJECTILE_SLOTS {
        spawn_slot(Slot::Projectile(index), &sphere, true);
    }
    for index in 0..PARTICLE_SLOTS {
        spawn_slot(Slot::Particle(index), &sphere, true);
    }
    spawn_slot(Slot::Clash, &sphere, true);
}

fn key_down(keys: &ButtonInput<KeyCode>, codes: &[KeyCode]) -> bool {
    codes.iter().any(|code| keys.pressed(*code))
}

/// Keyboard layout by physical key, so WASD is ZQSD on an AZERTY keyboard.
fn keyboard_input(keys: &ButtonInput<KeyCode>) -> EngineInput {
    let attack_keys = [KeyCode::KeyJ, KeyCode::KeyK, KeyCode::KeyL, KeyCode::KeyU, KeyCode::KeyI];
    EngineInput {
        left: key_down(keys, &[KeyCode::KeyA, KeyCode::ArrowLeft]),
        right: key_down(keys, &[KeyCode::KeyD, KeyCode::ArrowRight]),
        up: key_down(keys, &[KeyCode::KeyW, KeyCode::ArrowUp]),
        down: key_down(keys, &[KeyCode::KeyS, KeyCode::ArrowDown]),
        jump: key_down(keys, &[KeyCode::KeyW, KeyCode::ArrowUp, KeyCode::Space]),
        punch: keys.pressed(KeyCode::KeyJ),
        heavy: keys.pressed(KeyCode::KeyK),
        blast: keys.pressed(KeyCode::KeyL),
        special: keys.pressed(KeyCode::KeyU),
        ultimate: keys.pressed(KeyCode::KeyI),
        charge: keys.pressed(KeyCode::KeyH),
        transform: keys.pressed(KeyCode::KeyT),
        guard: key_down(keys, &[KeyCode::ShiftLeft, KeyCode::ShiftRight]),
        vanish: keys.pressed(KeyCode::KeyV),
        mash: key_down(keys, &attack_keys),
    }
}

/// Standard Gamepad layout of the W3C, as the engine's own mapper expects it.
fn gamepad_input(pad: &Gamepad) -> EngineInput {
    let stick = pad.left_stick();
    let axes = [stick.x, -stick.y];
    let buttons = [
        GamepadButton::South,
        GamepadButton::East,
        GamepadButton::West,
        GamepadButton::North,
        GamepadButton::LeftTrigger,
        GamepadButton::RightTrigger,
        GamepadButton::LeftTrigger2,
        GamepadButton::RightTrigger2,
        GamepadButton::Select,
        GamepadButton::Start,
        GamepadButton::LeftThumb,
        GamepadButton::RightThumb,
        GamepadButton::DPadUp,
        GamepadButton::DPadDown,
        GamepadButton::DPadLeft,
        GamepadButton::DPadRight,
    ]
    .map(|button| pad.pressed(button));
    parse_standard_gamepad(&axes, &buttons, STICK_DEADZONE, GamepadType::Generic)
}

fn read_input(
    keys: Res<ButtonInput<KeyCode>>,
    gamepads: Query<&Gamepad>,
    mut state: ResMut<PadState>,
) {
    let mut input = keyboard_input(&keys);
    let mut restart = keys.just_pressed(KeyCode::Enter);
    for pad in &gamepads {
        input = input.merged(gamepad_input(pad));
        restart |= pad.just_pressed(GamepadButton::Start);
    }
    state.input = input;
    state.restart = restart;
}

fn step_match(mut game: ResMut<Match>, pad: Res<PadState>, time: Res<Time>) {
    if with_bridge(|bridge| bridge.paused) {
        return;
    }
    if game.engine.status != "playing" {
        if pad.restart {
            game.engine = game.selection.engine();
        }
        return;
    }
    game.engine.step(pad.input, time.delta_secs());
    game.engine.audio_queue.clear();
    let rumble = std::mem::take(&mut game.engine.haptic_queue);
    if !rumble.is_empty() {
        with_bridge(|bridge| {
            bridge.haptics.extend(rumble);
            let overflow = bridge.haptics.len().saturating_sub(HAPTIC_BACKLOG);
            bridge.haptics.drain(..overflow);
        });
    }
}

fn apply_pending_selection(
    mut game: ResMut<Match>,
    mut clear: ResMut<ClearColor>,
    mut sun: Query<&mut DirectionalLight, With<Sun>>,
    ground: Query<&MeshMaterial3d<StandardMaterial>, With<Ground>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let Some(selection) = with_bridge(|bridge| bridge.pending.take()) else {
        return;
    };
    game.engine = selection.engine();
    game.selection = selection;
    let palette = arena_palette(game.engine.arena);
    clear.0 = rgb(palette.sky);
    for mut light in &mut sun {
        light.color = rgb(palette.light);
    }
    for material in &ground {
        if let Some(mut asset) = materials.get_mut(&material.0) {
            asset.base_color = rgb(palette.ground);
        }
    }
}

fn rgb(color: [f32; 3]) -> Color {
    Color::srgb(color[0], color[1], color[2])
}

fn rgba(color: [f32; 4]) -> Color {
    Color::srgba(color[0], color[1], color[2], color[3])
}

/// What one pooled mesh looks like this frame.
struct Look {
    position: Vec3,
    rotation: Quat,
    scale: Vec3,
    color: Color,
    emissive: LinearRgba,
    visible: bool,
}

impl Look {
    const fn hidden() -> Self {
        Self {
            position: HIDDEN,
            rotation: Quat::IDENTITY,
            scale: Vec3::ONE,
            color: Color::WHITE,
            emissive: LinearRgba::BLACK,
            visible: false,
        }
    }
}

fn fighter_look(game: &DragonPixelEngineCore, side: Side, piece: Piece) -> Look {
    let (fighter, definition) = match side {
        Side::Player => (&game.player, &game.player_def),
        Side::Enemy => (&game.enemy, &game.enemy_def),
    };
    let palette = fighter_palette(fighter.id);
    let base = Vec3::new(world_x(fighter.x), world_height(fighter.y, game.ground_y), 0.0);
    let facing = if fighter.facing < 0.0 { -1.0 } else { 1.0 };
    let (aura_kind, aura_color) = fighter.get_current_aura(definition);
    let flash = (fighter.flash_timer / 0.15).clamp(0.0, 1.0);
    let glow = LinearRgba::new(flash, flash, flash, 1.0);
    let defeated = fighter.hp <= 0.0;
    let tint = |color: [f32; 3]| {
        if fighter.is_guarding { rgb(color.map(|channel| channel * 0.7)) } else { rgb(color) }
    };
    // A defeated fighter lies on the ground, head away from the side it was facing.
    let lying = Quat::from_rotation_z(-facing * std::f32::consts::FRAC_PI_2);
    let head_base = if defeated {
        base + Vec3::new(-facing * 0.95, 0.24, 0.0)
    } else {
        base + Vec3::Y * 1.5
    };
    let hair_color = if fighter.form_level > 0 && hair_follows_form(fighter.id) {
        rgba(aura_color)
    } else {
        rgb(palette.hair)
    };
    match piece {
        Piece::Body => Look {
            position: base + Vec3::Y * if defeated { 0.28 } else { 0.68 },
            rotation: if defeated { lying } else { Quat::IDENTITY },
            scale: Vec3::ONE,
            color: tint(palette.outfit),
            emissive: glow,
            visible: true,
        },
        Piece::Head => Look {
            position: head_base,
            rotation: Quat::IDENTITY,
            scale: Vec3::splat(0.22),
            color: rgb(palette.skin),
            emissive: glow,
            visible: true,
        },
        Piece::Hair => Look {
            position: head_base + Vec3::Y * 0.14,
            rotation: Quat::IDENTITY,
            scale: Vec3::new(0.24, 0.16, 0.24),
            color: hair_color,
            emissive: glow,
            visible: true,
        },
        Piece::Fist => Look {
            position: base + Vec3::new(facing * 0.78, 1.0, 0.0),
            rotation: Quat::IDENTITY,
            scale: Vec3::splat(0.14),
            color: rgb(palette.skin),
            emissive: glow,
            visible: fighter.current_move.is_some() && !defeated,
        },
        Piece::Aura => {
            let strength = if fighter.is_charging {
                1.0
            } else if fighter.form_level > 0 {
                0.65
            } else {
                0.0
            };
            let mut color = rgba(aura_color);
            color.set_alpha(0.28 * strength);
            let pulse = 1.0 + (game.time_elapsed * 9.0).sin() * 0.05;
            Look {
                position: base + Vec3::Y * 0.85,
                rotation: Quat::IDENTITY,
                scale: Vec3::new(0.85, 1.25, 0.85) * pulse,
                color,
                emissive: rgba(aura_color).to_linear() * (0.8 * strength),
                visible: strength > 0.0 && aura_kind != crate::types::AuraType::None && !defeated,
            }
        },
    }
}

fn projectile_look(game: &DragonPixelEngineCore, index: usize) -> Look {
    let Some(projectile) = game.projectiles.get(index) else {
        return Look::hidden();
    };
    let color = rgba(projectile.color);
    let radius_x = (projectile.width / crate::scene_layout::PIXELS_PER_UNIT).max(0.12) * 0.5;
    let radius_y = (projectile.height / crate::scene_layout::PIXELS_PER_UNIT).max(0.12) * 0.5;
    Look {
        position: Vec3::new(world_x(projectile.x), world_height(projectile.y, game.ground_y), 0.0),
        rotation: Quat::IDENTITY,
        scale: Vec3::new(radius_x, radius_y, radius_y.min(radius_x)),
        color,
        emissive: color.to_linear() * 2.0,
        visible: true,
    }
}

fn particle_look(game: &DragonPixelEngineCore, index: usize) -> Look {
    let Some(particle) = game.particles.get(index) else {
        return Look::hidden();
    };
    let life = (particle.life / particle.max_life.max(f32::EPSILON)).clamp(0.0, 1.0);
    let mut color = rgba(particle.color);
    color.set_alpha(life);
    Look {
        position: Vec3::new(world_x(particle.x), world_height(particle.y, game.ground_y), 0.1),
        rotation: Quat::IDENTITY,
        scale: Vec3::splat((particle.size / crate::scene_layout::PIXELS_PER_UNIT).max(0.03)),
        color,
        emissive: color.to_linear() * 1.5,
        visible: life > 0.0,
    }
}

fn clash_look(game: &DragonPixelEngineCore) -> Look {
    let Some(clash) = &game.clash else {
        return Look::hidden();
    };
    let color = rgba(clash.player_beam_color);
    let radius = 0.4 + clash.tension.abs() / 100.0 * 0.3;
    Look {
        position: Vec3::new(
            world_x(clash.clash_x),
            world_height(clash.clash_y, game.ground_y),
            0.0,
        ),
        rotation: Quat::IDENTITY,
        scale: Vec3::splat(radius),
        color,
        emissive: color.to_linear() * 2.5,
        visible: true,
    }
}

fn sync_scene(
    game: Res<Match>,
    mut slots: Query<(&Slot, &mut Transform, &mut Visibility, &MeshMaterial3d<StandardMaterial>)>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let engine = &game.engine;
    for (slot, mut transform, mut visibility, material) in &mut slots {
        let look = match *slot {
            Slot::Fighter(side, piece) => fighter_look(engine, side, piece),
            Slot::Projectile(index) => projectile_look(engine, index),
            Slot::Particle(index) => particle_look(engine, index),
            Slot::Clash => clash_look(engine),
        };
        *visibility = if look.visible { Visibility::Visible } else { Visibility::Hidden };
        transform.translation = look.position;
        transform.rotation = look.rotation;
        transform.scale = look.scale;
        if look.visible
            && let Some(mut asset) = materials.get_mut(&material.0)
        {
            asset.base_color = look.color;
            asset.emissive = look.emissive;
        }
    }
    let frames = with_bridge(|bridge| {
        bridge.frames += 1;
        bridge.frames
    });
    if frames == 1 || frames.is_multiple_of(HUD_REFRESH_FRAMES) {
        let hud = hud_json(&game, frames);
        with_bridge(|bridge| bridge.hud = hud);
    }
}

fn hud_json(game: &Match, frames: u64) -> String {
    let engine = &game.engine;
    let hud = Hud {
        frames,
        status: &engine.status,
        paused: with_bridge(|bridge| bridge.paused),
        mode: engine.mode,
        arena: engine.arena.as_str(),
        chapter: engine.current_chapter_id,
        fighter: engine.player.id.as_str(),
        ui: engine.create_render_packet().ui,
    };
    serde_json::to_string(&hud).unwrap_or_default()
}

/// Frames both fighters, with the screen shake of the engine.
fn follow_camera(game: Res<Match>, mut camera: Query<&mut Transform, With<MainCamera>>) {
    let engine = &game.engine;
    let middle = (world_x(engine.player.x) + world_x(engine.enemy.x)) * 0.5;
    let spread = (world_x(engine.player.x) - world_x(engine.enemy.x)).abs();
    let distance = (7.5 + spread * 0.45).clamp(7.5, 13.0);
    let shake = engine.trauma * engine.trauma;
    let shake_x = (engine.time_elapsed * 55.0).sin() * 0.14 * shake;
    let shake_y = (engine.time_elapsed * 67.0).cos() * 0.1 * shake;
    for mut transform in &mut camera {
        let target = Vec3::new(middle, 1.3, 0.0);
        *transform = Transform::from_xyz(middle + shake_x, 2.3 + shake_y, distance)
            .looking_at(target, Vec3::Y);
    }
}
