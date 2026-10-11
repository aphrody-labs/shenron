// SPDX-License-Identifier: Apache-2.0

//! Canonical Dragon Ball fighter definitions and 42-volume manga story chapters.

use super::types::{ArenaId, FighterId, FighterStyle};
use serde::{Deserialize, Serialize};

/// Canonical specification of a fighter character.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FighterDefinition {
    /// Fighter ID.
    pub id: FighterId,
    /// Display name.
    pub name: String,
    /// Fighting archetype style.
    pub style: FighterStyle,
    /// Base maximum hit points.
    pub max_hp: f32,
    /// Base maximum ki power.
    pub max_ki: f32,
    /// Horizontal walking speed.
    pub walk_speed: f32,
    /// Dash speed multiplier.
    pub dash_speed: f32,
    /// Jump impulse force.
    pub jump_power: f32,
    /// Overall attack damage multiplier.
    pub damage_multiplier: f32,
    /// Aura color RGBA.
    pub aura_color: [f32; 4],
    /// Energy beam color RGBA.
    pub beam_color: [f32; 4],
    /// Signature special beam name.
    pub signature_beam: String,
}

/// Retrieves the complete definition for a fighter.
#[must_use]
pub fn get_fighter_def(id: FighterId) -> FighterDefinition {
    match id {
        FighterId::Goku => FighterDefinition {
            id,
            name: "Son Goku".into(),
            style: FighterStyle::Balanced,
            max_hp: 10000.0,
            max_ki: 100.0,
            walk_speed: 4.8,
            dash_speed: 12.0,
            jump_power: 16.5,
            damage_multiplier: 1.0,
            aura_color: [0.1, 0.6, 1.0, 0.8], // Super Saiyan Blue / Kaioken aura
            beam_color: [0.2, 0.7, 1.0, 1.0], // Kamehameha
            signature_beam: "Kamehameha".into(),
        },
        FighterId::Vegeta => FighterDefinition {
            id,
            name: "Vegeta".into(),
            style: FighterStyle::Rushdown,
            max_hp: 9500.0,
            max_ki: 100.0,
            walk_speed: 5.0,
            dash_speed: 13.0,
            jump_power: 16.0,
            damage_multiplier: 1.08,
            aura_color: [0.6, 0.2, 0.9, 0.8], // Royal Purple / Blue aura
            beam_color: [0.8, 0.3, 1.0, 1.0], // Galick Gun
            signature_beam: "Galick Gun".into(),
        },
        FighterId::Gohan => FighterDefinition {
            id,
            name: "Son Gohan (SSJ2)".into(),
            style: FighterStyle::GlassCannon,
            max_hp: 9000.0,
            max_ki: 120.0,
            walk_speed: 5.2,
            dash_speed: 14.0,
            jump_power: 17.5,
            damage_multiplier: 1.18,
            aura_color: [1.0, 0.9, 0.1, 0.9], // Golden Lightning
            beam_color: [1.0, 0.85, 0.2, 1.0], // Father-Son Kamehameha
            signature_beam: "Father-Son Kamehameha".into(),
        },
        FighterId::Piccolo => FighterDefinition {
            id,
            name: "Piccolo".into(),
            style: FighterStyle::Zoner,
            max_hp: 10500.0,
            max_ki: 100.0,
            walk_speed: 4.2,
            dash_speed: 10.5,
            jump_power: 15.0,
            damage_multiplier: 0.98,
            aura_color: [0.7, 0.9, 0.2, 0.8], // Namekian aura
            beam_color: [1.0, 0.9, 0.1, 1.0], // Special Beam Cannon
            signature_beam: "Special Beam Cannon (Makankosappo)".into(),
        },
        FighterId::Frieza => FighterDefinition {
            id,
            name: "Frieza (Final Form)".into(),
            style: FighterStyle::Zoner,
            max_hp: 9800.0,
            max_ki: 110.0,
            walk_speed: 4.5,
            dash_speed: 12.5,
            jump_power: 16.0,
            damage_multiplier: 1.05,
            aura_color: [0.8, 0.1, 0.8, 0.8], // Purple Emperor aura
            beam_color: [0.9, 0.1, 0.3, 1.0], // Death Beam
            signature_beam: "Death Beam".into(),
        },
        FighterId::Cell => FighterDefinition {
            id,
            name: "Perfect Cell".into(),
            style: FighterStyle::Balanced,
            max_hp: 10200.0,
            max_ki: 100.0,
            walk_speed: 4.6,
            dash_speed: 12.0,
            jump_power: 16.2,
            damage_multiplier: 1.04,
            aura_color: [0.2, 0.8, 0.3, 0.8], // Green Bio-Aura
            beam_color: [1.0, 0.8, 0.1, 1.0], // Solar Kamehameha
            signature_beam: "Solar Kamehameha".into(),
        },
        FighterId::MajinBuu => FighterDefinition {
            id,
            name: "Kid Buu".into(),
            style: FighterStyle::Rushdown,
            max_hp: 11000.0,
            max_ki: 100.0,
            walk_speed: 5.4,
            dash_speed: 14.5,
            jump_power: 18.0,
            damage_multiplier: 1.10,
            aura_color: [1.0, 0.4, 0.7, 0.8], // Pink Majin vapor
            beam_color: [1.0, 0.2, 0.6, 1.0], // Planet Burst
            signature_beam: "Planet Burst".into(),
        },
        FighterId::Trunks => FighterDefinition {
            id,
            name: "Future Trunks".into(),
            style: FighterStyle::Rushdown,
            max_hp: 9600.0,
            max_ki: 100.0,
            walk_speed: 4.9,
            dash_speed: 12.8,
            jump_power: 16.0,
            damage_multiplier: 1.06,
            aura_color: [0.9, 0.8, 0.1, 0.8], // Super Saiyan Gold
            beam_color: [1.0, 0.7, 0.1, 1.0], // Burning Attack
            signature_beam: "Burning Attack".into(),
        },
        FighterId::Yamcha => FighterDefinition {
            id,
            name: "Yamcha".into(),
            style: FighterStyle::Rushdown,
            max_hp: 8500.0,
            max_ki: 80.0,
            walk_speed: 4.6,
            dash_speed: 11.5,
            jump_power: 15.0,
            damage_multiplier: 0.90,
            aura_color: [0.8, 0.5, 0.2, 0.7], // Desert Wolf aura
            beam_color: [1.0, 0.5, 0.0, 1.0], // Sokidan (Spirit Ball)
            signature_beam: "Sokidan (Spirit Ball)".into(),
        },
    }
}

/// A chapter in the 42-volume manga story mode.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StoryChapter {
    /// Manga volume number (1 to 42).
    pub volume: u32,
    /// Chapter title.
    pub title: String,
    /// Player's character for this chapter.
    pub player_fighter: FighterId,
    /// Opponent fighter.
    pub enemy_fighter: FighterId,
    /// Battle arena stage.
    pub arena: ArenaId,
    /// Pre-battle manga dialogue quote.
    pub pre_dialogue: String,
}

/// Generates the canonical list of story chapters across all 42 volumes.
#[must_use]
pub fn get_story_chapters() -> Vec<StoryChapter> {
    vec![
        StoryChapter {
            volume: 1,
            title: "The Legend of the Dragon Balls".into(),
            player_fighter: FighterId::Goku,
            enemy_fighter: FighterId::Yamcha,
            arena: ArenaId::Paozu,
            pre_dialogue: "Yamcha the Desert Bandit blocks the path!".into(),
        },
        StoryChapter {
            volume: 21,
            title: "The Decisive Battle on Planet Namek".into(),
            player_fighter: FighterId::Goku,
            enemy_fighter: FighterId::Frieza,
            arena: ArenaId::Namek,
            pre_dialogue: "You killed Krillin! I will never forgive you!".into(),
        },
        StoryChapter {
            volume: 28,
            title: "Super Saiyan 2 Gohan Awakens".into(),
            player_fighter: FighterId::Gohan,
            enemy_fighter: FighterId::Cell,
            arena: ArenaId::CellGames,
            pre_dialogue: "Cell, it is no longer a matter of winning or losing... I am going to destroy you!".into(),
        },
        StoryChapter {
            volume: 42,
            title: "Spirit Bomb - The Farewell".into(),
            player_fighter: FighterId::Goku,
            enemy_fighter: FighterId::MajinBuu,
            arena: ArenaId::KaioshinRealm,
            pre_dialogue: "You were incredible, Buu. Maybe you will come back as a good guy someday... See you later!".into(),
        },
    ]
}
