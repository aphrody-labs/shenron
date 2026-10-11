// SPDX-License-Identifier: Apache-2.0

//! Game entity types, fighter identifiers, hitboxes, and audio/haptics events.

use serde::{Deserialize, Serialize};

/// Canonical Dragon Ball fighters.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FighterId {
    /// Son Goku (Turtle School / Super Saiyan).
    Goku,
    /// Vegeta (Saiyan Prince).
    Vegeta,
    /// Son Gohan (Teen / Super Saiyan 2).
    Gohan,
    /// Piccolo (Namekian Warrior).
    Piccolo,
    /// Frieza (Final Form / Emperor).
    Frieza,
    /// Cell (Perfect Android).
    Cell,
    /// Majin Buu (Pure / Kid Buu).
    MajinBuu,
    /// Future Trunks (Sword / Super Saiyan).
    Trunks,
    /// Yamcha (Wolf Fang Fist).
    Yamcha,
}

/// Fighting style Archetype.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FighterStyle {
    /// Aggressive close-range pressure.
    Rushdown,
    /// Long-range ki blast and beam control.
    Zoner,
    /// Heavy command grabs and super armor.
    Grappler,
    /// Versatile all-around kit.
    Balanced,
    /// Extremely high burst damage, low defensive resilience.
    GlassCannon,
}

/// Game mode selector.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameMode {
    /// 42-volume canonical manga story progression.
    Story,
    /// Standard arcade ladder.
    Arcade,
    /// Local or networked player vs player.
    Versus,
    /// Practice mode with frame data display.
    Training,
}

/// Arena background stage.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArenaId {
    /// Mount Paozu wilderness.
    Paozu,
    /// World Martial Arts Tournament (Tenkaichi Budokai).
    Tournament,
    /// Planet Namek dying surface.
    Namek,
    /// Cell Games arena.
    CellGames,
    /// Sacred World of the Kai (Kaioshin Realm).
    KaioshinRealm,
    /// Hyperbolic Time Chamber.
    TimeChamber,
}

/// 2D Axis-aligned rectangle.
#[derive(Copy, Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    /// Left X.
    pub x: f32,
    /// Top Y.
    pub y: f32,
    /// Width.
    pub width: f32,
    /// Height.
    pub height: f32,
}

impl Rect {
    /// Creates a new rectangle.
    #[must_use]
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self { x, y, width, height }
    }

    /// Checks if two rectangles intersect.
    #[must_use]
    pub fn intersects(&self, other: &Self) -> bool {
        self.x < other.x + other.width
            && self.x + self.width > other.x
            && self.y < other.y + other.height
            && self.y + self.height > other.y
    }
}

/// Hitbox dealing damage and hitstun.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hitbox {
    /// Relative offset from fighter origin.
    pub offset: Rect,
    /// Base damage dealt.
    pub damage: f32,
    /// Knockback impulse vector (x, y).
    pub knockback: [f32; 2],
    /// Hitstun duration in frames.
    pub hitstun: u32,
    /// Blockstun duration in frames.
    pub blockstun: u32,
}

/// Vulnerable hurtbox receiving attacks.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hurtbox {
    /// Relative offset from fighter origin.
    pub offset: Rect,
    /// Whether this hurtbox is invulnerable during active frames.
    pub is_invulnerable: bool,
}

/// Dynamic audio event triggered by combat actions.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AudioEvent {
    /// Sound identifier (e.g. "punch", "ki_blast", "kamehameha", "explosion").
    pub sound_type: String,
    /// Pitch adjustment factor.
    pub pitch: f32,
    /// Sound volume in [0.0, 1.0].
    pub volume: f32,
}

/// Haptic vibration feedback trigger.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HapticEvent {
    /// Light strike hit.
    LightImpact,
    /// Heavy blow / wall bounce.
    HeavyImpact,
    /// Beam clash button mash pulse.
    ClashPulse,
    /// Dramatic KO rumble.
    Knockout,
}
