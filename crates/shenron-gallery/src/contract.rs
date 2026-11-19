//! The parity contract, `scripts/parity/states.json`: viewport, stage origin, font files and the
//! component states shared with the web gallery.

use std::{
    collections::BTreeMap,
    fmt,
    path::{Path, PathBuf},
    str::FromStr,
};

use anyhow::{Context as _, Result, anyhow, bail};
use serde::Deserialize;

/// Location of the contract relative to the repository root.
pub const CONTRACT_PATH: &str = "scripts/parity/states.json";

#[derive(Clone, Debug, Deserialize)]
pub struct Contract {
    pub viewport: Viewport,
    pub origin: Origin,
    pub themes: Vec<String>,
    pub font: FontSpec,
    pub states: Vec<StateSpec>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
    pub scale: f32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Origin {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FontSpec {
    pub family: String,
    /// CSS weight to file path, relative to the repository root.
    pub files: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StateSpec {
    pub id: String,
    pub interaction: String,
}

impl Contract {
    pub fn load(root: &Path) -> Result<Self> {
        let path = root.join(CONTRACT_PATH);
        let bytes = std::fs::read(&path).with_context(|| format!("reading {}", path.display()))?;
        let contract: Self = serde_json::from_slice(&bytes)
            .with_context(|| format!("parsing {}", path.display()))?;
        if contract.viewport.scale != 1.0 {
            bail!("{}: only scale 1 is rendered", path.display());
        }
        Ok(contract)
    }

    /// Fails unless the contract lists `theme`.
    pub fn check_theme(&self, theme: &str) -> Result<()> {
        if self.themes.iter().any(|known| known == theme) {
            Ok(())
        } else {
            bail!("theme `{theme}` is not in {CONTRACT_PATH} ({})", self.themes.join(", "))
        }
    }

    /// Absolute paths of the font files, in contract order.
    pub fn font_paths(&self, root: &Path) -> Vec<PathBuf> {
        self.font.files.values().map(|file| root.join(file)).collect()
    }

    /// The states of the contract, resolved against the states this binary renders.
    pub fn resolved_states(&self) -> Result<Vec<(StateId, Interaction)>> {
        self.states
            .iter()
            .map(|state| Ok((state.id.parse()?, state.interaction.parse()?)))
            .collect()
    }
}

macro_rules! state_ids {
    ($($variant:ident => $id:literal,)*) => {
        /// A component state of the gallery, named as in the contract.
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub enum StateId {
            $($variant,)*
        }

        impl StateId {
            #[cfg(test)]
            pub const ALL: &[StateId] = &[$(StateId::$variant,)*];

            pub fn as_str(self) -> &'static str {
                match self {
                    $(StateId::$variant => $id,)*
                }
            }
        }

        impl FromStr for StateId {
            type Err = anyhow::Error;

            fn from_str(value: &str) -> Result<Self> {
                match value {
                    $($id => Ok(StateId::$variant),)*
                    _ => Err(anyhow!("unknown state id `{value}`")),
                }
            }
        }
    };
}

state_ids! {
    ButtonDefault => "button/default",
    ButtonHover => "button/hover",
    ButtonFocusVisible => "button/focus-visible",
    ButtonDisabled => "button/disabled",
    CheckboxUnchecked => "checkbox/unchecked",
    CheckboxChecked => "checkbox/checked",
    CheckboxHover => "checkbox/hover",
    CheckboxFocusVisible => "checkbox/focus-visible",
    CheckboxDisabled => "checkbox/disabled",
    SwitchOff => "switch/off",
    SwitchOn => "switch/on",
    SwitchHover => "switch/hover",
    SwitchFocusVisible => "switch/focus-visible",
    SwitchDisabled => "switch/disabled",
    TabsDefault => "tabs/default",
    TabsSecondActive => "tabs/second-active",
    TabsHover => "tabs/hover",
    TabsFocusVisible => "tabs/focus-visible",
    DialogOpen => "dialog/open",
    DialogCloseFocusVisible => "dialog/close-focus-visible",
    SelectClosed => "select/closed",
    SelectHover => "select/hover",
    SelectFocusVisible => "select/focus-visible",
    SelectDisabled => "select/disabled",
    SelectOpen => "select/open",
}

impl StateId {
    /// File stem of the capture: the id with `/` replaced by `__`.
    #[cfg_attr(
        not(any(target_os = "linux", target_os = "macos")),
        expect(dead_code, reason = "captures are written by the headless renderer only")
    )]
    pub fn file_stem(self) -> String {
        self.as_str().replace('/', "__")
    }

    pub fn component(self) -> Component {
        let id = self.as_str();
        match id.split_once('/').map_or(id, |(component, _)| component) {
            "button" => Component::Button,
            "checkbox" => Component::Checkbox,
            "switch" => Component::Switch,
            "tabs" => Component::Tabs,
            "dialog" => Component::Dialog,
            _ => Component::Select,
        }
    }
}

impl fmt::Display for StateId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// What the window shows: one state of the contract, or the bench page of the frame-time run
/// (`?id=bench` of the web gallery).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene {
    State(StateId),
    Bench,
}

impl Scene {
    pub fn state(self) -> Option<StateId> {
        match self {
            Scene::State(state) => Some(state),
            Scene::Bench => None,
        }
    }

    pub fn component(self) -> Option<Component> {
        self.state().map(StateId::component)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Scene::State(state) => state.as_str(),
            Scene::Bench => "bench",
        }
    }
}

impl FromStr for Scene {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "bench" => Ok(Scene::Bench),
            _ => value.parse().map(Scene::State),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Component {
    Button,
    Checkbox,
    Switch,
    Tabs,
    Dialog,
    Select,
}

/// The input that brings a state about, applied after the first frame.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Interaction {
    None,
    /// Move the pointer onto the center of the part.
    Hover(String),
    /// Press Tab until the part holds keyboard focus.
    FocusVisible(String),
    /// Click the center of the part, then park the pointer away from every component.
    Click(String),
}

impl FromStr for Interaction {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self> {
        if value == "none" {
            return Ok(Self::None);
        }
        let (kind, part) =
            value.split_once(':').ok_or_else(|| anyhow!("malformed interaction `{value}`"))?;
        let part = part.to_owned();
        match kind {
            "hover" => Ok(Self::Hover(part)),
            "focus-visible" => Ok(Self::FocusVisible(part)),
            "click" => Ok(Self::Click(part)),
            _ => Err(anyhow!("unknown interaction `{value}`")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    #[test]
    fn contract_ids_match_the_rendered_states() {
        let contract = Contract::load(&repo_root()).expect("states.json loads");
        let contract_ids: Vec<&str> = contract.states.iter().map(|s| s.id.as_str()).collect();
        let known_ids: Vec<&str> = StateId::ALL.iter().map(|id| id.as_str()).collect();
        assert_eq!(contract_ids, known_ids);
        let resolved = contract.resolved_states().expect("every interaction parses");
        assert_eq!(resolved.len(), StateId::ALL.len());
    }

    #[test]
    fn contract_fonts_exist() {
        let root = repo_root();
        let contract = Contract::load(&root).expect("states.json loads");
        assert_eq!(contract.font.family, "Inter");
        for path in contract.font_paths(&root) {
            assert!(path.is_file(), "missing font {}", path.display());
        }
    }

    #[test]
    fn interactions_parse() {
        assert_eq!("none".parse::<Interaction>().ok(), Some(Interaction::None));
        assert_eq!(
            "hover:tab-2".parse::<Interaction>().ok(),
            Some(Interaction::Hover("tab-2".into()))
        );
        assert!("drag:button".parse::<Interaction>().is_err());
    }

    #[test]
    fn scenes_parse() {
        assert_eq!("bench".parse::<Scene>().ok(), Some(Scene::Bench));
        assert_eq!("tabs/hover".parse::<Scene>().ok(), Some(Scene::State(StateId::TabsHover)));
        assert!("tabs/unknown".parse::<Scene>().is_err());
    }
}
