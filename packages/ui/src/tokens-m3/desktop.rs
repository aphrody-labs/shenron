//! Taffy Style & Color Definitions for Google Design System
//! Generated via Bun v1.4.4 - Seed: #ea580c

use taffy::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct M3Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl M3Color {
    pub const fn from_hex(hex: u32) -> Self {
        Self {
            r: ((hex >> 16) & 0xff) as u8,
            g: ((hex >> 8) & 0xff) as u8,
            b: (hex & 0xff) as u8,
            a: 255,
        }
    }
}

pub struct GoogleDesignTheme {
    pub primary: M3Color,
    pub on_primary: M3Color,
    pub primary_container: M3Color,
    pub on_primary_container: M3Color,
    pub surface: M3Color,
    pub on_surface: M3Color,
    pub surface_container: M3Color,
    pub outline: M3Color,
}

pub const LIGHT_THEME: GoogleDesignTheme = GoogleDesignTheme {
    primary: M3Color::from_hex(0x8e4c32),
    on_primary: M3Color::from_hex(0xffffff),
    primary_container: M3Color::from_hex(0xffdbce),
    on_primary_container: M3Color::from_hex(0x71361d),
    surface: M3Color::from_hex(0xfff8f6),
    on_surface: M3Color::from_hex(0x231a16),
    surface_container: M3Color::from_hex(0xfceae4),
    outline: M3Color::from_hex(0x85736d),
};

pub const DARK_THEME: GoogleDesignTheme = GoogleDesignTheme {
    primary: M3Color::from_hex(0xffb599),
    on_primary: M3Color::from_hex(0x552009),
    primary_container: M3Color::from_hex(0x71361d),
    on_primary_container: M3Color::from_hex(0xffdbce),
    surface: M3Color::from_hex(0x1a110e),
    on_surface: M3Color::from_hex(0xf1dfd9),
    surface_container: M3Color::from_hex(0x271e1a),
    outline: M3Color::from_hex(0xa08d86),
};

pub fn standard_button_style() -> Style {
    Style {
        size: Size {
            width: Dimension::Auto,
            height: length(40.0),
        },
        padding: Rect {
            left: length(24.0),
            right: length(24.0),
            top: length(10.0),
            bottom: length(10.0),
        },
        align_items: Some(AlignItems::Center),
        justify_content: Some(JustifyContent::Center),
        ..Default::default()
    }
}
