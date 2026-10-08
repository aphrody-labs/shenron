// SPDX-License-Identifier: Apache-2.0

//! High-performance SIMD-accelerated math and geometric primitives.
//!
//! Aligned to 16-byte boundaries for direct SIMD saturation (SSE/AVX/NEON)
//! and zero-overhead GPU buffer uploads.

pub use glam::{
    Affine3A, EulerRot, Mat3, Mat4, Quat, Vec2, Vec3, Vec3A, Vec4,
};

/// 3D Axis-Aligned Bounding Box with 16-byte aligned SIMD extrema.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct Aabb {
    /// Minimum coordinates in 3D space.
    pub min: Vec3A,
    /// Maximum coordinates in 3D space.
    pub max: Vec3A,
}

impl Default for Aabb {
    fn default() -> Self {
        Self::EMPTY
    }
}

impl Aabb {
    /// An empty, inverted bounding box suitable for expansion.
    pub const EMPTY: Self = Self {
        min: Vec3A::splat(f32::INFINITY),
        max: Vec3A::splat(f32::NEG_INFINITY),
    };

    /// Creates a new AABB from minimum and maximum extents.
    #[inline]
    #[must_use]
    pub fn new(min: Vec3A, max: Vec3A) -> Self {
        Self { min, max }
    }

    /// Creates an AABB centered at `center` with half-extents `half_size`.
    #[inline]
    #[must_use]
    pub fn from_center_half_size(center: Vec3A, half_size: Vec3A) -> Self {
        Self {
            min: center - half_size,
            max: center + half_size,
        }
    }

    /// Computes the center of the bounding box.
    #[inline]
    #[must_use]
    pub fn center(&self) -> Vec3A {
        (self.min + self.max) * 0.5
    }

    /// Computes the full extents (size) along each axis.
    #[inline]
    #[must_use]
    pub fn size(&self) -> Vec3A {
        self.max - self.min
    }

    /// Computes the half-extents along each axis.
    #[inline]
    #[must_use]
    pub fn half_size(&self) -> Vec3A {
        (self.max - self.min) * 0.5
    }

    /// Returns the radius of the bounding sphere circumscribing this AABB.
    #[inline]
    #[must_use]
    pub fn bounding_sphere_radius(&self) -> f32 {
        self.half_size().length()
    }

    /// Expands the bounding box to include a 3D point.
    #[inline]
    pub fn include_point(&mut self, point: Vec3A) {
        self.min = self.min.min(point);
        self.max = self.max.max(point);
    }

    /// Expands this bounding box to include another AABB.
    #[inline]
    pub fn union(&self, other: &Self) -> Self {
        Self {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }

    /// Checks if a 3D point is contained within the bounding box.
    #[inline]
    #[must_use]
    pub fn contains_point(&self, point: Vec3A) -> bool {
        point.cmpge(self.min).all() && point.cmple(self.max).all()
    }

    /// Checks if another AABB intersects this bounding box.
    #[inline]
    #[must_use]
    pub fn intersects_aabb(&self, other: &Self) -> bool {
        self.min.cmple(other.max).all() && self.max.cmpge(other.min).all()
    }

    /// Transforms the AABB by an affine transform using Jim Arvo's algorithm.
    ///
    /// This generates an exact bounding box without manually transforming and
    /// re-evaluating all 8 corner vertices.
    #[inline]
    #[must_use]
    pub fn transform(&self, transform: &Affine3A) -> Self {
        let center = transform.transform_point3a(self.center());
        let half_size = self.half_size();

        // Transform half-extents using absolute values of the linear matrix components
        let m = transform.matrix3;
        let x = m.x_axis.abs() * half_size.x;
        let y = m.y_axis.abs() * half_size.y;
        let z = m.z_axis.abs() * half_size.z;
        let new_half_size = x + y + z;

        Self {
            min: center - new_half_size,
            max: center + new_half_size,
        }
    }
}

/// 3D Bounding Sphere.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct Sphere {
    /// Sphere center in 3D space.
    pub center: Vec3A,
    /// Sphere radius.
    pub radius: f32,
    _pad: [f32; 3],
}

impl Sphere {
    /// Creates a new sphere.
    #[inline]
    #[must_use]
    pub fn new(center: Vec3A, radius: f32) -> Self {
        Self {
            center,
            radius,
            _pad: [0.0; 3],
        }
    }

    /// Checks if a 3D point is inside the sphere.
    #[inline]
    #[must_use]
    pub fn contains_point(&self, point: Vec3A) -> bool {
        self.center.distance_squared(point) <= self.radius * self.radius
    }

    /// Checks if this sphere intersects another sphere.
    #[inline]
    #[must_use]
    pub fn intersects_sphere(&self, other: &Self) -> bool {
        let r = self.radius + other.radius;
        self.center.distance_squared(other.center) <= r * r
    }

    /// Checks if this sphere intersects an AABB.
    #[inline]
    #[must_use]
    pub fn intersects_aabb(&self, aabb: &Aabb) -> bool {
        // Find closest point on AABB to sphere center
        let closest = self.center.clamp(aabb.min, aabb.max);
        self.contains_point(closest)
    }
}

/// 3D Plane represented in Hesse normal form: `normal . p + distance = 0`.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct Plane {
    /// Unit normal vector pointing out of the half-space.
    pub normal: Vec3A,
    /// Signed distance from the origin.
    pub distance: f32,
    _pad: [f32; 3],
}

impl Plane {
    /// Creates a plane from a normal vector and distance, normalizing the plane.
    #[inline]
    #[must_use]
    pub fn new(normal: Vec3A, distance: f32) -> Self {
        let len = normal.length();
        if len > 1e-6 {
            let inv = 1.0 / len;
            Self {
                normal: normal * inv,
                distance: distance * inv,
                _pad: [0.0; 3],
            }
        } else {
            Self {
                normal: Vec3A::Y,
                distance,
                _pad: [0.0; 3],
            }
        }
    }

    /// Computes the signed distance from a point to the plane.
    #[inline]
    #[must_use]
    pub fn signed_distance(&self, point: Vec3A) -> f32 {
        self.normal.dot(point) + self.distance
    }
}

/// 6-Plane Camera Frustum for hierarchical view-frustum culling.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct Frustum {
    /// Planes: 0=Left, 1=Right, 2=Bottom, 3=Top, 4=Near, 5=Far.
    pub planes: [Plane; 6],
}

impl Frustum {
    /// Extracts the 6 frustum planes from a combined View-Projection matrix.
    ///
    /// Follows the Gribb & Hartmann method for direct hardware frustum extraction.
    #[must_use]
    pub fn from_view_projection(vp: &Mat4) -> Self {
        let row0 = vp.row(0);
        let row1 = vp.row(1);
        let row2 = vp.row(2);
        let row3 = vp.row(3);

        // Left plane: row3 + row0
        let left = row3 + row0;
        // Right plane: row3 - row0
        let right = row3 - row0;
        // Bottom plane: row3 + row1
        let bottom = row3 + row1;
        // Top plane: row3 - row1
        let top = row3 - row1;
        // Near plane: row2 (for 0..1 clip space) or row3 + row2 (for -1..1)
        let near = row2;
        // Far plane: row3 - row2
        let far = row3 - row2;

        let extract = |v: Vec4| -> Plane {
            Plane::new(Vec3A::new(v.x, v.y, v.z), v.w)
        };

        Self {
            planes: [
                extract(left),
                extract(right),
                extract(bottom),
                extract(top),
                extract(near),
                extract(far),
            ],
        }
    }

    /// Tests if a bounding sphere intersects or is inside the frustum.
    #[inline]
    #[must_use]
    pub fn intersects_sphere(&self, sphere: &Sphere) -> bool {
        for plane in &self.planes {
            if plane.signed_distance(sphere.center) < -sphere.radius {
                return false;
            }
        }
        true
    }

    /// Tests if an AABB intersects or is inside the frustum using the p-vertex method.
    #[inline]
    #[must_use]
    pub fn intersects_aabb(&self, aabb: &Aabb) -> bool {
        for plane in &self.planes {
            // p-vertex is the corner furthest along the normal direction
            let px = if plane.normal.x > 0.0 { aabb.max.x } else { aabb.min.x };
            let py = if plane.normal.y > 0.0 { aabb.max.y } else { aabb.min.y };
            let pz = if plane.normal.z > 0.0 { aabb.max.z } else { aabb.min.z };
            let p = Vec3A::new(px, py, pz);

            if plane.signed_distance(p) < 0.0 {
                return false;
            }
        }
        true
    }
}

/// 3D Ray with precalculated inverse direction for fast branchless slab intersection.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct Ray {
    /// Ray origin point.
    pub origin: Vec3A,
    /// Normalized direction vector.
    pub direction: Vec3A,
    /// Inverse direction (`1.0 / direction`) with infinities properly handled.
    pub inv_direction: Vec3A,
}

impl Ray {
    /// Creates a new ray with origin and normalized direction.
    #[inline]
    #[must_use]
    pub fn new(origin: Vec3A, direction: Vec3A) -> Self {
        let dir = direction.normalize();
        let inv_direction = Vec3A::new(
            if dir.x != 0.0 { 1.0 / dir.x } else { f32::INFINITY },
            if dir.y != 0.0 { 1.0 / dir.y } else { f32::INFINITY },
            if dir.z != 0.0 { 1.0 / dir.z } else { f32::INFINITY },
        );
        Self {
            origin,
            direction: dir,
            inv_direction,
        }
    }

    /// Computes intersection distance `t` with an AABB using the branchless slab test.
    ///
    /// Returns `Some(t)` where `t >= 0.0` is the entry distance along the ray,
    /// or `None` if the ray misses the bounding box.
    #[inline]
    #[must_use]
    pub fn intersect_aabb(&self, aabb: &Aabb) -> Option<f32> {
        let t1 = (aabb.min - self.origin) * self.inv_direction;
        let t2 = (aabb.max - self.origin) * self.inv_direction;

        let tmin_v = t1.min(t2);
        let tmax_v = t1.max(t2);

        let tmin = tmin_v.x.max(tmin_v.y).max(tmin_v.z);
        let tmax = tmax_v.x.min(tmax_v.y).min(tmax_v.z);

        if tmax >= tmin && tmax >= 0.0 {
            Some(if tmin < 0.0 { 0.0 } else { tmin })
        } else {
            None
        }
    }

    /// Computes intersection with a sphere.
    #[inline]
    #[must_use]
    pub fn intersect_sphere(&self, sphere: &Sphere) -> Option<f32> {
        let oc = self.origin - sphere.center;
        let b = oc.dot(self.direction);
        let c = oc.length_squared() - sphere.radius * sphere.radius;
        let discriminant = b * b - c;

        if discriminant < 0.0 {
            return None;
        }

        let sqrt_disc = discriminant.sqrt();
        let t1 = -b - sqrt_disc;
        let t2 = -b + sqrt_disc;

        if t1 >= 0.0 {
            Some(t1)
        } else if t2 >= 0.0 {
            Some(t2)
        } else {
            None
        }
    }

    /// Möller-Trumbore ray-triangle intersection algorithm.
    ///
    /// Returns `Some((t, u, v))` where `t` is distance, and `(u, v)` are barycentrics.
    #[must_use]
    pub fn intersect_triangle(
        &self,
        v0: Vec3A,
        v1: Vec3A,
        v2: Vec3A,
    ) -> Option<(f32, f32, f32)> {
        const EPSILON: f32 = 1e-7;
        let edge1 = v1 - v0;
        let edge2 = v2 - v0;
        let h = self.direction.cross(edge2);
        let a = edge1.dot(h);

        if a.abs() < EPSILON {
            return None;
        }

        let f = 1.0 / a;
        let s = self.origin - v0;
        let u = f * s.dot(h);
        if !(0.0..=1.0).contains(&u) {
            return None;
        }

        let q = s.cross(edge1);
        let v = f * self.direction.dot(q);
        if v < 0.0 || u + v > 1.0 {
            return None;
        }

        let t = f * edge2.dot(q);
        if t > EPSILON {
            Some((t, u, v))
        } else {
            None
        }
    }
}

/// Octahedral encoding of unit normal vectors into 2 signed 16-bit integers (32 bits total).
///
/// Drastically reduces vertex buffer bandwidth compared to full 12-byte float normals.
#[inline]
#[must_use]
pub fn pack_octahedral_normal(normal: Vec3A) -> [i16; 2] {
    let n = normal / (normal.x.abs() + normal.y.abs() + normal.z.abs());
    let mut ox = n.x;
    let mut oy = n.y;
    if n.z < 0.0 {
        ox = (1.0 - oy.abs()) * if ox >= 0.0 { 1.0 } else { -1.0 };
        oy = (1.0 - n.x.abs()) * if oy >= 0.0 { 1.0 } else { -1.0 };
    }
    [
        (ox.clamp(-1.0, 1.0) * 32767.0) as i16,
        (oy.clamp(-1.0, 1.0) * 32767.0) as i16,
    ]
}

/// Unpacks a 32-bit octahedrally encoded normal back into a normalized `Vec3A`.
#[inline]
#[must_use]
pub fn unpack_octahedral_normal(packed: [i16; 2]) -> Vec3A {
    let ox = packed[0] as f32 / 32767.0;
    let oy = packed[1] as f32 / 32767.0;
    let mut n = Vec3A::new(ox, oy, 1.0 - ox.abs() - oy.abs());
    if n.z < 0.0 {
        let sign_x = if n.x >= 0.0 { 1.0 } else { -1.0 };
        let sign_y = if n.y >= 0.0 { 1.0 } else { -1.0 };
        n.x = (1.0 - n.y.abs()) * sign_x;
        n.y = (1.0 - ox.abs()) * sign_y;
    }
    n.normalize()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aabb_arvo_transform() {
        let aabb = Aabb::new(Vec3A::new(-1.0, -1.0, -1.0), Vec3A::new(1.0, 1.0, 1.0));
        let transform = Affine3A::from_scale_rotation_translation(
            Vec3::splat(2.0),
            Quat::IDENTITY,
            Vec3::new(10.0, 0.0, 0.0),
        );
        let transformed = aabb.transform(&transform);
        assert_eq!(transformed.min, Vec3A::new(8.0, -2.0, -2.0));
        assert_eq!(transformed.max, Vec3A::new(12.0, 2.0, 2.0));
    }

    #[test]
    fn test_frustum_sphere_culling() {
        let proj = Mat4::perspective_rh(std::f32::consts::FRAC_PI_2, 1.0, 0.1, 100.0);
        let view = Mat4::look_at_rh(Vec3::ZERO, -Vec3::Z, Vec3::Y);
        let frustum = Frustum::from_view_projection(&(proj * view));

        let visible_sphere = Sphere::new(Vec3A::new(0.0, 0.0, -10.0), 2.0);
        assert!(frustum.intersects_sphere(&visible_sphere));

        let behind_sphere = Sphere::new(Vec3A::new(0.0, 0.0, 10.0), 2.0);
        assert!(!frustum.intersects_sphere(&behind_sphere));
    }

    #[test]
    fn test_ray_triangle_intersection() {
        let ray = Ray::new(Vec3A::new(0.0, 0.0, 5.0), Vec3A::new(0.0, 0.0, -1.0));
        let v0 = Vec3A::new(-2.0, -2.0, 0.0);
        let v1 = Vec3A::new(2.0, -2.0, 0.0);
        let v2 = Vec3A::new(0.0, 2.0, 0.0);

        let hit = ray.intersect_triangle(v0, v1, v2);
        assert!(hit.is_some());
        let (t, _, _) = hit.unwrap();
        assert!((t - 5.0).abs() < 1e-4);
    }
}
