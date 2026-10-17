// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

/// Identifiant unique d'un combattant jouable ou boss.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FighterId {
    Goku,
    Vegeta,
    Gohan,
    Piccolo,
    Trunks,
    Frieza,
    Cell,
    Buu,
    Yamcha,
    Krilin,
    JackieChun,
}

impl FighterId {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Goku => "goku",
            Self::Vegeta => "vegeta",
            Self::Gohan => "gohan",
            Self::Piccolo => "piccolo",
            Self::Trunks => "trunks",
            Self::Frieza => "frieza",
            Self::Cell => "cell",
            Self::Buu => "buu",
            Self::Yamcha => "yamcha",
            Self::Krilin => "krilin",
            Self::JackieChun => "jackie_chun",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "vegeta" => Self::Vegeta,
            "gohan" => Self::Gohan,
            "piccolo" => Self::Piccolo,
            "trunks" => Self::Trunks,
            "frieza" | "freezer" => Self::Frieza,
            "cell" => Self::Cell,
            "buu" | "majin_buu" => Self::Buu,
            "yamcha" => Self::Yamcha,
            "krilin" | "kuririn" => Self::Krilin,
            "jackie" | "jackie_chun" | "roshi" => Self::JackieChun,
            _ => Self::Goku,
        }
    }
}

/// Style de combat archétypal rétro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FighterStyle {
    Balanced,
    Speed,
    Power,
}

/// Type d'aura d'énergie rendu par le shader WGSL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuraType {
    None,
    White,
    KaioKen,
    SuperSaiyan,
    SuperSaiyan2,
    SuperSaiyan3,
    SuperNamek,
    Mystic,
    Golden,
    Perfect,
    Majin,
}

/// Identifiant d'arène canonique Toriyama.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArenaId {
    Paozu,
    Budokai,
    Wasteland,
    Namek,
    CellGames,
    Kaiohshin,
}

impl ArenaId {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Paozu => "paozu",
            Self::Budokai => "budokai",
            Self::Wasteland => "wasteland",
            Self::Namek => "namek",
            Self::CellGames => "cell_games",
            Self::Kaiohshin => "kaiohshin",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "paozu" => Self::Paozu,
            "wasteland" => Self::Wasteland,
            "namek" => Self::Namek,
            "cell_games" | "cell" => Self::CellGames,
            "kaiohshin" | "kaioshin" => Self::Kaiohshin,
            _ => Self::Budokai,
        }
    }
}

/// Modes de jeu supportés.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameMode {
    Story,
    Arcade,
    Survival,
    Dojo,
}

impl GameMode {
    pub fn from_str_loose(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "story" => Self::Story,
            "survival" => Self::Survival,
            "dojo" => Self::Dojo,
            _ => Self::Arcade,
        }
    }
}

/// Boîte englobante AABB 2D pour hitboxes et hurtboxes.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }

    pub fn intersects(&self, other: &Self) -> bool {
        self.x < other.x + other.w
            && self.x + self.w > other.x
            && self.y < other.y + other.h
            && self.y + self.h > other.y
    }
}

/// Hitbox offensive avec propriétés de dégâts et frame data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Hitbox {
    pub offset_x: f32,
    pub offset_y: f32,
    pub width: f32,
    pub height: f32,
    pub damage: f32,
    pub chip_damage: f32,
    pub hitstun_frames: u32,
    pub blockstun_frames: u32,
    pub knockback_x: f32,
    pub knockback_y: f32,
    pub screen_shake: f32,
}

/// Hurtbox défensive vulnérable aux coups.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Hurtbox {
    pub offset_x: f32,
    pub offset_y: f32,
    pub width: f32,
    pub height: f32,
}

/// Événement haptique pour vibration manette (Dual-Rumble standard).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HapticEvent {
    pub weak_magnitude: f32,
    pub strong_magnitude: f32,
    pub duration_ms: u32,
}

/// Événement sonore pour le synthétiseur audio natif ou les fichiers SFX.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioEvent {
    pub sound_type: String,
    pub pitch: f32,
    pub volume: f32,
}
