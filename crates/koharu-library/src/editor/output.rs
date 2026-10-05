// SPDX-License-Identifier: MIT OR Apache-2.0
//! What leaves the editor: page exports (PNG, PSD, CBZ), thumbnails, previews, font samples
//! and the typed page results of the Shenron chain.

use std::{io::Write as _, path::PathBuf, sync::Arc};

use anyhow::{Context as _, Result, bail};
use futures::future::try_join_all;
use image::{
    ExtendedColorType, ImageEncoder as _, RgbaImage,
    codecs::png::{CompressionType, FilterType, PngEncoder},
};
use koharu_desktop::Desktop;
use koharu_psd::{PsdExportOptions, export_page};
use koharu_rasterizer::RasterOptions;
use koharu_scene::{AssetRole, EntityId, Snapshot};
use rayon::prelude::*;

use super::{Editor, ExportFormat, FontFamily};

const THUMBNAIL_EDGE: u32 = 128;

/// Format of one exported page.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PageFormat {
    Png,
    Psd,
}

impl Editor {
    /// The open project's name, for an export file name.
    pub async fn project_name(&self) -> Result<String> {
        Ok(self
            .inner
            .project
            .lock()
            .await
            .as_ref()
            .context("no project is open")?
            .name
            .clone())
    }

    /// Export every page: one file per page in the `destination` folder (PNG, PSD), or one
    /// `destination` archive (CBZ), in project order.
    pub async fn export(&self, format: ExportFormat, destination: PathBuf) -> Result<()> {
        let snapshot = self.snapshot().await?;
        let pages = snapshot.pages().map(|page| page.id()).collect::<Vec<_>>();
        if pages.is_empty() {
            bail!("there are no pages to export");
        }
        let desktop = &self.inner.desktop;
        let renderer = desktop.renderer();
        let rasterizer = desktop.rasterizer().await?;
        let frames =
            try_join_all(pages.iter().map(|&page| renderer.render(&snapshot, page))).await?;
        let (extension, images) = match format {
            ExportFormat::Png | ExportFormat::Cbz => {
                let images = tokio_rayon::spawn(move || {
                    frames
                        .par_iter()
                        .map(|frame| -> Result<_> {
                            let image = rasterizer
                                .rasterize(&frame.raster_frame()?, RasterOptions::default())?
                                .image;
                            encode_png(&image)
                        })
                        .collect::<Result<Vec<_>>>()
                })
                .await?;
                ("png", images)
            }
            ExportFormat::Psd => {
                let options = PsdExportOptions::default();
                let images = try_join_all(frames.iter().map(|frame| {
                    export_page(Arc::clone(&rasterizer), &snapshot, frame, &options)
                }))
                .await?;
                ("psd", images)
            }
        };
        tokio_rayon::spawn(move || -> Result<()> {
            let mut archive = if matches!(format, ExportFormat::Cbz) {
                let directory = destination.parent().context("archive path has no parent")?;
                Some(zip::ZipWriter::new(tempfile::NamedTempFile::new_in(
                    directory,
                )?))
            } else {
                None
            };
            let width = pages.len().to_string().len().max(4);
            for (index, (page_id, bytes)) in pages.into_iter().zip(images).enumerate() {
                let page = snapshot.page(page_id)?.page()?;
                let name = page
                    .label
                    .trim()
                    .trim_end_matches(|character: char| character == '.' || character.is_whitespace());
                let name = name
                    .rsplit_once('.')
                    .map_or(name, |(stem, _)| stem)
                    .replace(['<', '>', ':', '"', '/', '\\', '|', '?', '*'], "_");
                let name = format!(
                    "{:0width$}_{}.{extension}",
                    index + 1,
                    if name.is_empty() { "page" } else { &name }
                );
                if let Some(archive) = &mut archive {
                    // PNG data is already compressed.
                    let options = zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Stored);
                    archive.start_file(name, options)?;
                    archive.write_all(&bytes)?;
                } else {
                    std::fs::write(destination.join(name), bytes)?;
                }
            }
            if let Some(archive) = archive {
                archive.finish()?.persist(destination)?;
            }
            Ok(())
        })
        .await?;
        tracing::info!(?format, "Koharu project exported");
        Ok(())
    }

    /// One page rendered as PNG or layered PSD bytes.
    pub async fn export_page(&self, page: EntityId, format: PageFormat) -> Result<Vec<u8>> {
        let snapshot = self.snapshot().await?;
        snapshot.page(page)?;
        let desktop = &self.inner.desktop;
        let frame = desktop.renderer().render(&snapshot, page).await?;
        let rasterizer = desktop.rasterizer().await?;
        match format {
            PageFormat::Png => {
                let raster = frame.raster_frame()?;
                tokio_rayon::spawn(move || {
                    encode_png(&rasterizer.rasterize(&raster, RasterOptions::default())?.image)
                })
                .await
            }
            PageFormat::Psd => {
                export_page(rasterizer, &snapshot, &frame, &PsdExportOptions::default())
                    .await
                    .map_err(Into::into)
            }
        }
    }

    /// A 128 px WebP thumbnail of a page's source image.
    pub async fn thumbnail(&self, page: EntityId) -> Result<Vec<u8>> {
        let snapshot = self.snapshot().await?;
        snapshot.page(page)?;
        let blob = snapshot
            .asset(page, &AssetRole::new("source")?)?
            .with_context(|| format!("page {page} has no source image"))?
            .blob;
        let bytes = snapshot.read_blob(blob).await?;
        tokio_rayon::spawn(move || -> Result<Vec<u8>> {
            let image = image::load_from_memory(&bytes).context("failed to decode source image")?;
            if image.width() == 0 || image.height() == 0 {
                bail!("source image is empty");
            }
            let image = image.thumbnail(THUMBNAIL_EDGE, THUMBNAIL_EDGE).to_rgba8();
            let encoder = webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height());
            Ok(encoder.encode(80.0).to_vec())
        })
        .await
    }

    pub async fn fonts(&self) -> Result<Vec<FontFamily>> {
        Ok(self
            .inner
            .desktop
            .renderer()
            .available_fonts()
            .await?
            .into_iter()
            .map(FontFamily::from)
            .collect())
    }

    /// A rendered sample of a font family.
    pub async fn font_preview(&self, family: &str) -> Result<Vec<u8>> {
        let desktop = &self.inner.desktop;
        let rasterizer = desktop.rasterizer().await?;
        Ok(desktop.renderer().font_preview(family, rasterizer).await?)
    }

    /// The typed model output of one page (regions, texts, cleanup layer, provenance).
    pub async fn page_result(&self, page: EntityId) -> Result<crate::PageResult> {
        crate::result::extract(&self.snapshot().await?, page).await
    }

    /// SHA-256 of the encoded source image bytes persisted for a page.
    pub async fn page_source_sha256(&self, page: EntityId) -> Result<String> {
        let current = self.inner.project.lock().await;
        current
            .as_ref()
            .context("no project is open")?
            .source_sha256(page)
            .await
    }
}

/// The current rendering of a page as a WebP of at most 1024 px (agent `view_page`).
pub(super) async fn rendered_preview(
    desktop: &Desktop,
    snapshot: &Snapshot,
    page: EntityId,
) -> Result<Vec<u8>> {
    snapshot.page(page)?;
    let frame = desktop.renderer().render(snapshot, page).await?;
    let rasterizer = desktop.rasterizer().await?;
    let raster = frame.raster_frame()?;
    tokio_rayon::spawn(move || {
        let image = rasterizer.rasterize(&raster, RasterOptions::default())?.image;
        let image = image::DynamicImage::ImageRgba8(image)
            .resize(1024, 1024, image::imageops::FilterType::Lanczos3)
            .to_rgba8();
        let encoder = webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height());
        Ok::<_, anyhow::Error>(encoder.encode(85.0).to_vec())
    })
    .await
}

fn encode_png(image: &RgbaImage) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    PngEncoder::new_with_quality(&mut bytes, CompressionType::Best, FilterType::Adaptive)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )?;
    Ok(bytes)
}
