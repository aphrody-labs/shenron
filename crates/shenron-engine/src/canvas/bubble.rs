// SPDX-License-Identifier: Apache-2.0

//! Manga and comic speech bubble procedural geometry generator.
//!
//! Generates smooth ellipses, jagged shout/burst spikes, thought clouds,
//! and seamlessly attached directional tails.

use super::path::Path2D;
use glam::Vec2;

/// Style of the speech bubble enclosure.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum BubbleKind {
    /// Smooth rounded rectangular or elliptical balloon for standard speech.
    Normal,
    /// Jagged, explosive spiky polygon for shouting, impact lines, and screams.
    Shout,
    /// Cloud-like bubbly arcs for internal monologue/thought.
    Thought,
}

/// Tail pointing to the speaking character.
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct BubbleTail {
    /// 2D target position of the tail tip (mouth/speaker).
    pub tip: Vec2,
    /// Width of the tail base where it connects to the bubble body.
    pub base_width: f32,
}

/// Procedural speech bubble descriptor.
#[derive(Clone, Debug, PartialEq)]
pub struct SpeechBubble {
    /// Top-left position.
    pub position: Vec2,
    /// Size of the bubble bounding box.
    pub size: Vec2,
    /// Kind of bubble.
    pub kind: BubbleKind,
    /// Optional tail.
    pub tail: Option<BubbleTail>,
    /// Number of spikes for shout bubbles.
    pub spike_count: usize,
}

impl SpeechBubble {
    /// Creates a standard speech bubble.
    #[must_use]
    pub fn new(position: Vec2, size: Vec2, kind: BubbleKind) -> Self {
        Self {
            position,
            size,
            kind,
            tail: None,
            spike_count: 16,
        }
    }

    /// Attaches a directional tail.
    #[must_use]
    pub fn with_tail(mut self, tip: Vec2, base_width: f32) -> Self {
        self.tail = Some(BubbleTail { tip, base_width });
        self
    }

    /// Generates a vector `Path2D` representing the bubble contour.
    #[must_use]
    pub fn to_path(&self) -> Path2D {
        let mut path = Path2D::new();
        let center = self.position + self.size * 0.5;
        let radii = self.size * 0.5;

        match self.kind {
            BubbleKind::Normal => {
                let n = 32;
                let mut points = Vec::with_capacity(n);
                for i in 0..n {
                    let theta = (i as f32 / n as f32) * std::f32::consts::TAU;
                    points.push(center + Vec2::new(theta.cos() * radii.x, theta.sin() * radii.y));
                }

                // If tail is present, insert tail vertices at the closest boundary angle
                if let Some(tail) = self.tail {
                    let tail_dir = (tail.tip - center).normalize();
                    let tail_angle = tail_dir.y.atan2(tail_dir.x);
                    let half_span = (tail.base_width / (radii.x + radii.y)).asin().max(0.1);

                    path.move_to(points[0]);
                    let mut tail_emitted = false;

                    for p in points {
                        let angle = (p.y - center.y).atan2(p.x - center.x);
                        let diff = (angle - tail_angle).abs();
                        if diff < half_span && !tail_emitted {
                            let left_base = center + Vec2::new(
                                (tail_angle - half_span).cos() * radii.x,
                                (tail_angle - half_span).sin() * radii.y,
                            );
                            let right_base = center + Vec2::new(
                                (tail_angle + half_span).cos() * radii.x,
                                (tail_angle + half_span).sin() * radii.y,
                            );
                            path.line_to(left_base);
                            path.line_to(tail.tip);
                            path.line_to(right_base);
                            tail_emitted = true;
                        } else {
                            path.line_to(p);
                        }
                    }
                    path.close();
                } else {
                    path.ellipse(center, radii, 32);
                }
            }
            BubbleKind::Shout => {
                let n = self.spike_count.max(8);
                let inner_radii = radii * 0.75;
                let outer_radii = radii * 1.15;

                for i in 0..n {
                    let t0 = (i as f32 / n as f32) * std::f32::consts::TAU;
                    let t_mid = ((i as f32 + 0.5) / n as f32) * std::f32::consts::TAU;

                    let p_inner = center + Vec2::new(t0.cos() * inner_radii.x, t0.sin() * inner_radii.y);
                    let p_outer = center + Vec2::new(t_mid.cos() * outer_radii.x, t_mid.sin() * outer_radii.y);

                    if i == 0 {
                        path.move_to(p_inner);
                    } else {
                        path.line_to(p_inner);
                    }
                    path.line_to(p_outer);
                }
                path.close();
            }
            BubbleKind::Thought => {
                let n = 12;
                for i in 0..n {
                    let t0 = (i as f32 / n as f32) * std::f32::consts::TAU;
                    let t1 = ((i + 1) as f32 / n as f32) * std::f32::consts::TAU;

                    let p0 = center + Vec2::new(t0.cos() * radii.x, t0.sin() * radii.y);
                    let p1 = center + Vec2::new(t1.cos() * radii.x, t1.sin() * radii.y);
                    let arc_center = (p0 + p1) * 0.5 + (p0 + p1 - center * 2.0) * 0.3;

                    if i == 0 {
                        path.move_to(p0);
                    }
                    path.quad_to(arc_center, p1);
                }
                path.close();
            }
        }

        path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speech_bubble_shout_generation() {
        let bubble = SpeechBubble::new(
            Vec2::new(100.0, 100.0),
            Vec2::new(200.0, 150.0),
            BubbleKind::Shout,
        );
        let path = bubble.to_path();
        let points = path.flatten(1.0);
        assert!(points.len() >= 32);
    }
}
