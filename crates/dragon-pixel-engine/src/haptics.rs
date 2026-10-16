// SPDX-License-Identifier: Apache-2.0

use crate::types::HapticEvent;
use serde::{Deserialize, Serialize};

/// Type d'impact ou action déclenchant une secousse haptique manette.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HapticTrigger {
    LightHit,
    HeavyHit,
    BlockedHit,
    KiBlastFired,
    BeamFired,
    BeamClashTension,
    TransformationSurge,
    KnockdownKO,
}

impl HapticTrigger {
    pub fn to_event(&self) -> HapticEvent {
        match self {
            Self::LightHit => {
                HapticEvent { weak_magnitude: 0.35, strong_magnitude: 0.15, duration_ms: 60 }
            },
            Self::HeavyHit => {
                HapticEvent { weak_magnitude: 0.7, strong_magnitude: 0.55, duration_ms: 120 }
            },
            Self::BlockedHit => {
                HapticEvent { weak_magnitude: 0.2, strong_magnitude: 0.1, duration_ms: 50 }
            },
            Self::KiBlastFired => {
                HapticEvent { weak_magnitude: 0.25, strong_magnitude: 0.15, duration_ms: 80 }
            },
            Self::BeamFired => {
                HapticEvent { weak_magnitude: 0.5, strong_magnitude: 0.4, duration_ms: 220 }
            },
            Self::BeamClashTension => {
                HapticEvent { weak_magnitude: 0.6, strong_magnitude: 0.5, duration_ms: 75 }
            },
            Self::TransformationSurge => {
                HapticEvent { weak_magnitude: 0.8, strong_magnitude: 0.85, duration_ms: 400 }
            },
            Self::KnockdownKO => {
                HapticEvent { weak_magnitude: 0.95, strong_magnitude: 1.0, duration_ms: 550 }
            },
        }
    }
}
