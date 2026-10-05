// SPDX-License-Identifier: MIT OR Apache-2.0
//! The canvas of the editor: prepared frames for the browser canvas (`koharu-canvas`) and the
//! edits drawn on it (text frames, paint, erase, transforms, inpainting strokes).

use std::sync::Arc;

use anyhow::{Context as _, Result, anyhow, bail};
use image::{GrayImage, ImageEncoder as _, codecs::png::PngEncoder};
use koharu_desktop::{Frame, TransformFrame};
use koharu_rasterizer::ResourceId;
use koharu_scene::{EntityId, Revision};

use super::{CanvasPagePreparation, Editor, JobId, LayerCommit, PaintBrush};
use crate::project::{Point, Project, RasterStrokeMode};

impl Editor {
    pub fn canvas_manifest(&self, generation: u64) -> Result<Vec<u8>> {
        self.inner.desktop.frame_manifest_bytes(generation)
    }

    pub fn canvas_resource(&self, generation: u64, resource: &str) -> Result<Vec<u8>> {
        let resource = resource.parse::<ResourceId>().context("canvas resource id is invalid")?;
        self.inner.desktop.frame_resource_bytes(generation, resource)
    }

    /// Prepare a page's frame at the current revision; `None` when it is already prepared.
    pub async fn prepare_canvas_page(
        &self,
        page: EntityId,
    ) -> Result<Option<CanvasPagePreparation>> {
        let snapshot = self.snapshot().await?;
        let prepared_page = Project::page(&snapshot, page)?;
        let revision = snapshot.revision();
        Ok(self
            .inner
            .desktop
            .prepare_page(&snapshot, page)
            .await?
            .then_some(CanvasPagePreparation { revision, page: prepared_page }))
    }

    pub fn canvas_page_manifest(&self, page: EntityId, revision: Revision) -> Result<Vec<u8>> {
        self.inner.desktop.page_manifest_bytes(page, revision)
    }

    pub fn canvas_page_resource(
        &self,
        page: EntityId,
        revision: Revision,
        resource: &str,
    ) -> Result<Vec<u8>> {
        let resource = resource.parse::<ResourceId>().context("canvas resource id is invalid")?;
        self.inner.desktop.page_resource_bytes(page, revision, resource)
    }

    /// Add a point text on `page` (the active page when `None`).
    pub async fn add_point_text(
        &self,
        page: Option<EntityId>,
        point: Point,
    ) -> Result<LayerCommit> {
        let (commit, layer) = self
            .mutate(true, false, |project| {
                Box::pin(async move {
                    let page = page_or_active(project, page)?;
                    project.add_point_text(page, point).await
                })
            })
            .await?;
        Ok(LayerCommit { revision: commit.revision, layer })
    }

    /// Add a paragraph text box on `page` (the active page when `None`).
    pub async fn add_text_box(&self, page: Option<EntityId>, frame: Frame) -> Result<LayerCommit> {
        let (commit, layer) = self
            .mutate(true, false, |project| {
                Box::pin(async move {
                    let page = page_or_active(project, page)?;
                    project.add_text_box(page, frame).await
                })
            })
            .await?;
        Ok(LayerCommit { revision: commit.revision, layer })
    }

    pub async fn commit_paint(
        &self,
        expected_revision: Revision,
        layer: Option<EntityId>,
        points: Vec<Point>,
        brush: PaintBrush,
    ) -> Result<LayerCommit> {
        self.raster_stroke(
            Some(expected_revision),
            None,
            layer,
            RasterStrokeMode::Paint,
            brush.color,
            brush.diameter,
            points,
        )
        .await
    }

    pub async fn commit_erase(
        &self,
        expected_revision: Revision,
        layer: EntityId,
        points: Vec<Point>,
        diameter: f32,
    ) -> Result<LayerCommit> {
        self.raster_stroke(
            Some(expected_revision),
            None,
            Some(layer),
            RasterStrokeMode::Erase,
            [0; 4],
            diameter,
            points,
        )
        .await
    }

    /// Paint or erase a stroke on `page` (the active page when `None`), checked against the
    /// revision the stroke was drawn on when one is given.
    #[allow(clippy::too_many_arguments)]
    pub async fn raster_stroke(
        &self,
        expected_revision: Option<Revision>,
        page: Option<EntityId>,
        layer: Option<EntityId>,
        mode: RasterStrokeMode,
        color: [u8; 4],
        diameter: f32,
        points: Vec<Point>,
    ) -> Result<LayerCommit> {
        let (commit, layer) = self
            .mutate(true, false, |project| {
                Box::pin(async move {
                    if let Some(expected) = expected_revision {
                        ensure_revision(project.snapshot().revision(), expected)?;
                    }
                    let page = page_or_active(project, page)?;
                    project
                        .apply_raster_stroke(
                            page,
                            layer,
                            mode,
                            color,
                            diameter,
                            points
                                .into_iter()
                                .map(|point| koharu_scene::Point { x: point.x, y: point.y })
                                .collect(),
                        )
                        .await
                })
            })
            .await?;
        Ok(LayerCommit { revision: commit.revision, layer })
    }

    /// Move or resize elements drawn on `expected_revision`; `None` when nothing changed.
    pub async fn commit_transform(
        &self,
        expected_revision: Revision,
        elements: Vec<TransformFrame>,
    ) -> Result<Option<Revision>> {
        let geometries = self.inner.desktop.transform_geometries(expected_revision, &elements)?;
        if geometries.is_empty() {
            return Ok(None);
        }
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move {
                    ensure_revision(project.snapshot().revision(), expected_revision)?;
                    Ok((project.set_geometries(geometries).await?, ()))
                })
            })
            .await?;
        Ok(Some(commit.revision))
    }

    /// Inpaint under a brush stroke of the active page: a processing job limited to the
    /// stroke's bounds, reported like any other job.
    pub async fn commit_inpaint(
        &self,
        expected_revision: Revision,
        points: Vec<Point>,
        diameter: f32,
    ) -> Result<Option<JobId>> {
        if !diameter.is_finite() || diameter <= 0.0 || points.is_empty() {
            bail!("an inpaint stroke requires a positive diameter and at least one point");
        }
        if points.iter().any(|point| !point.x.is_finite() || !point.y.is_finite()) {
            bail!("inpaint stroke points must be finite");
        }
        let (page, width, height) = {
            let current = self.inner.project.lock().await;
            let project = current.as_ref().context("no project is open")?;
            let snapshot = project.snapshot();
            ensure_revision(snapshot.revision(), expected_revision)?;
            let page = project.active_page().context("the project has no active page")?;
            let page_value = snapshot.page(page)?.page()?;
            (page, page_value.width.round() as u32, page_value.height.round() as u32)
        };
        let (png, bounds) =
            tokio_rayon::spawn(move || encode_mask(width, height, &points, diameter)).await?;
        *self.inner.inpainting_mask.lock() =
            Some(koharu_pipeline::InpaintingMask { page, png: Arc::from(png) });
        Ok(Some(
            self.process(
                koharu_pipeline::Scope::Region { page, bounds },
                koharu_pipeline::Operation::Only { stage: koharu_pipeline::Stage::Inpainting },
            )
            .await?,
        ))
    }
}

fn page_or_active(project: &Project, page: Option<EntityId>) -> Result<EntityId> {
    page.or_else(|| project.active_page()).context("the project has no active page")
}

fn ensure_revision(actual: Revision, expected: Revision) -> Result<()> {
    if actual != expected {
        bail!("canvas edit expected revision {expected}, but the project is at {actual}");
    }
    Ok(())
}

fn encode_mask(
    width: u32,
    height: u32,
    points: &[Point],
    diameter: f32,
) -> Result<(Vec<u8>, koharu_pipeline::Bounds)> {
    if width == 0 || height == 0 {
        bail!("page dimensions must be positive");
    }
    let mut image = GrayImage::new(width, height);
    let radius = f64::from(diameter) * 0.5;
    let mut dirty = None::<[u32; 4]>;
    for (start, end) in
        points.iter().zip(points.iter().skip(1)).chain(points.last().map(|point| (point, point)))
    {
        let left = (start.x.min(end.x) - radius - 0.5).floor().max(0.0) as u32;
        let top = (start.y.min(end.y) - radius - 0.5).floor().max(0.0) as u32;
        let right = (start.x.max(end.x) + radius + 0.5).ceil().min(f64::from(width)) as u32;
        let bottom = (start.y.max(end.y) + radius + 0.5).ceil().min(f64::from(height)) as u32;
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let length_squared = dx.mul_add(dx, dy * dy);
        for y in top..bottom {
            for x in left..right {
                let px = f64::from(x) + 0.5;
                let py = f64::from(y) + 0.5;
                let progress = if length_squared <= f64::EPSILON {
                    0.0
                } else {
                    (((px - start.x) * dx + (py - start.y) * dy) / length_squared).clamp(0.0, 1.0)
                };
                let nearest_x = start.x + progress * dx;
                let nearest_y = start.y + progress * dy;
                let distance = (px - nearest_x).hypot(py - nearest_y);
                let coverage = ((radius + 0.5 - distance).clamp(0.0, 1.0) * 255.0).round() as u8;
                if coverage == 0 {
                    continue;
                }
                let pixel = image.get_pixel_mut(x, y);
                pixel.0[0] = pixel.0[0].max(coverage);
                dirty = Some(match dirty {
                    Some([min_x, min_y, max_x, max_y]) => {
                        [min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y)]
                    },
                    None => [x, y, x, y],
                });
            }
        }
    }
    let [left, top, right, bottom] =
        dirty.ok_or_else(|| anyhow!("inpaint stroke does not intersect the page"))?;
    let mut png = Vec::new();
    PngEncoder::new(&mut png).write_image(
        image.as_raw(),
        width,
        height,
        image::ExtendedColorType::L8,
    )?;
    Ok((
        png,
        koharu_pipeline::Bounds {
            x: f64::from(left),
            y: f64::from(top),
            width: f64::from(right - left + 1),
            height: f64::from(bottom - top + 1),
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stroke_mask_covers_the_stroke_and_reports_its_bounds() {
        let (png, bounds) =
            encode_mask(32, 16, &[Point { x: 4.0, y: 8.0 }, Point { x: 20.0, y: 8.0 }], 4.0)
                .unwrap();
        assert!(png.starts_with(b"\x89PNG"));
        assert!(bounds.x <= 2.0 && bounds.x + bounds.width >= 22.0);
        assert!(bounds.y <= 6.0 && bounds.y + bounds.height >= 10.0);
    }

    #[test]
    fn a_stroke_off_the_page_is_refused() {
        assert!(encode_mask(8, 8, &[Point { x: 100.0, y: 100.0 }], 2.0).is_err());
        assert!(encode_mask(0, 8, &[Point { x: 1.0, y: 1.0 }], 2.0).is_err());
    }
}
