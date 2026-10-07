// SPDX-License-Identifier: Apache-2.0

//! 2D Vector Path geometry and curve tessellation.

use glam::Vec2;

/// A path command in a 2D vector path.
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum PathCommand {
    /// Move pen to coordinate without drawing.
    MoveTo(Vec2),
    /// Line from current point to coordinate.
    LineTo(Vec2),
    /// Quadratic Bézier curve with control point and end point.
    QuadTo { ctrl: Vec2, to: Vec2 },
    /// Cubic Bézier curve with two control points and end point.
    CubicTo { ctrl1: Vec2, ctrl2: Vec2, to: Vec2 },
    /// Close path back to the initial move-to point.
    Close,
}

/// 2D Vector path composed of drawing commands.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Path2D {
    commands: Vec<PathCommand>,
    current_point: Vec2,
    subpath_start: Vec2,
}

impl Path2D {
    /// Creates a new empty path.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Moves the pen to `p`.
    pub fn move_to(&mut self, p: Vec2) {
        self.commands.push(PathCommand::MoveTo(p));
        self.current_point = p;
        self.subpath_start = p;
    }

    /// Appends a straight line to `p`.
    pub fn line_to(&mut self, p: Vec2) {
        self.commands.push(PathCommand::LineTo(p));
        self.current_point = p;
    }

    /// Appends a quadratic Bézier curve.
    pub fn quad_to(&mut self, ctrl: Vec2, to: Vec2) {
        self.commands.push(PathCommand::QuadTo { ctrl, to });
        self.current_point = to;
    }

    /// Appends a cubic Bézier curve.
    pub fn cubic_to(&mut self, ctrl1: Vec2, ctrl2: Vec2, to: Vec2) {
        self.commands.push(PathCommand::CubicTo { ctrl1, ctrl2, to });
        self.current_point = to;
    }

    /// Closes the current subpath.
    pub fn close(&mut self) {
        self.commands.push(PathCommand::Close);
        self.current_point = self.subpath_start;
    }

    /// Appends a rectangle.
    pub fn rect(&mut self, min: Vec2, size: Vec2) {
        let max = min + size;
        self.move_to(min);
        self.line_to(Vec2::new(max.x, min.y));
        self.line_to(max);
        self.line_to(Vec2::new(min.x, max.y));
        self.close();
    }

    /// Appends a rounded rectangle with corner radius `r`.
    pub fn rounded_rect(&mut self, min: Vec2, size: Vec2, r: f32) {
        let r = r.min(size.x * 0.5).min(size.y * 0.5);
        let max = min + size;
        self.move_to(Vec2::new(min.x + r, min.y));
        self.line_to(Vec2::new(max.x - r, min.y));
        self.quad_to(Vec2::new(max.x, min.y), Vec2::new(max.x, min.y + r));
        self.line_to(Vec2::new(max.x, max.y - r));
        self.quad_to(Vec2::new(max.x, max.y), Vec2::new(max.x - r, max.y));
        self.line_to(Vec2::new(min.x + r, max.y));
        self.quad_to(Vec2::new(min.x, max.y), Vec2::new(min.x, max.y - r));
        self.line_to(Vec2::new(min.x, min.y + r));
        self.quad_to(Vec2::new(min.x, min.y), Vec2::new(min.x + r, min.y));
        self.close();
    }

    /// Appends an ellipse.
    pub fn ellipse(&mut self, center: Vec2, radii: Vec2, segments: usize) {
        let n = segments.max(8);
        for i in 0..n {
            let theta = (i as f32 / n as f32) * std::f32::consts::TAU;
            let p = center + Vec2::new(theta.cos() * radii.x, theta.sin() * radii.y);
            if i == 0 {
                self.move_to(p);
            } else {
                self.line_to(p);
            }
        }
        self.close();
    }

    /// Tessellates the path into a series of 2D line segments.
    #[must_use]
    pub fn flatten(&self, tolerance: f32) -> Vec<Vec2> {
        let mut points = Vec::new();
        let mut curr = Vec2::ZERO;

        for cmd in &self.commands {
            match *cmd {
                PathCommand::MoveTo(p) => {
                    curr = p;
                    points.push(p);
                }
                PathCommand::LineTo(p) => {
                    curr = p;
                    points.push(p);
                }
                PathCommand::QuadTo { ctrl, to } => {
                    let steps = (curr.distance(ctrl) + ctrl.distance(to)) / tolerance.max(1.0);
                    let n = (steps as usize).clamp(4, 32);
                    for i in 1..=n {
                        let t = i as f32 / n as f32;
                        let inv = 1.0 - t;
                        let p = curr * (inv * inv) + ctrl * (2.0 * inv * t) + to * (t * t);
                        points.push(p);
                    }
                    curr = to;
                }
                PathCommand::CubicTo { ctrl1, ctrl2, to } => {
                    let steps = (curr.distance(ctrl1) + ctrl1.distance(ctrl2) + ctrl2.distance(to))
                        / tolerance.max(1.0);
                    let n = (steps as usize).clamp(4, 48);
                    for i in 1..=n {
                        let t = i as f32 / n as f32;
                        let inv = 1.0 - t;
                        let p = curr * (inv * inv * inv)
                            + ctrl1 * (3.0 * inv * inv * t)
                            + ctrl2 * (3.0 * inv * t * t)
                            + to * (t * t * t);
                        points.push(p);
                    }
                    curr = to;
                }
                PathCommand::Close => {
                    if let Some(&first) = points.first() {
                        points.push(first);
                    }
                }
            }
        }

        points
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_rect_flatten() {
        let mut path = Path2D::new();
        path.rect(Vec2::new(0.0, 0.0), Vec2::new(100.0, 50.0));
        let points = path.flatten(1.0);
        assert!(points.len() >= 5);
        assert_eq!(points[0], Vec2::new(0.0, 0.0));
    }
}
