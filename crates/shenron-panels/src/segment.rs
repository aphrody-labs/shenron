// SPDX-License-Identifier: Apache-2.0

//! Panel (koma) segmentation of a manga page by recursive XY-cut on its white gutters.

/// A panel in normalised page coordinates (`0..1`, origin top-left).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PanelRect {
    /// Left edge.
    pub x: f32,
    /// Top edge.
    pub y: f32,
    /// Width.
    pub w: f32,
    /// Height.
    pub h: f32,
}

/// Tuning of [`segment_panels`].
#[derive(Clone, Copy, Debug)]
pub struct SegmentOptions {
    /// Luma (0–255) from which a pixel counts as paper.
    pub paper_luma: u8,
    /// Share of paper pixels that makes a row or a column a gutter.
    pub gutter_ratio: f32,
    /// Smallest gutter, as a fraction of the page side. Scans narrow the white of a gutter:
    /// JPEG ringing around the panel borders eats a few pixels on each side.
    pub min_gutter: f32,
    /// Smallest panel side, as a fraction of the page side.
    pub min_panel: f32,
    /// Recursion depth of the XY-cut.
    pub max_depth: u32,
    /// Weaker paper share accepted when both ends of the line are paper: an onomatopoeia may
    /// cross a gutter, but a line through a panel always ends on its ink borders.
    pub sfx_ratio: f32,
    /// Length of each end checked by `sfx_ratio`, as a fraction of the line.
    pub end_margin: f32,
    /// A part smaller than this share of the page is merged into its neighbour: letters of a
    /// logo or a title line are not panels (the smallest real panels measured are 3.5 %).
    pub min_part_area: f32,
    /// Parts below this share of the page are specks, left to the size filter.
    pub negligible_area: f32,
}

impl Default for SegmentOptions {
    fn default() -> Self {
        Self {
            paper_luma: 225,
            gutter_ratio: 0.985,
            min_gutter: 0.003,
            min_panel: 0.06,
            max_depth: 5,
            sfx_ratio: 0.95,
            end_margin: 0.02,
            min_part_area: 0.02,
            negligible_area: 0.002,
        }
    }
}

struct Page<'a> {
    rgba: &'a [u8],
    width: usize,
    height: usize,
    paper: u8,
}

impl Page<'_> {
    fn paper(&self, x: usize, y: usize) -> bool {
        let i = (y * self.width + x) * 4;
        let [r, g, b, a] = [self.rgba[i], self.rgba[i + 1], self.rgba[i + 2], self.rgba[i + 3]];
        // Transparent pixels are paper; otherwise BT.601 luma.
        a < 16
            || (u32::from(r) * 299 + u32::from(g) * 587 + u32::from(b) * 114) / 1000
                >= u32::from(self.paper)
    }
}

#[derive(Clone, Copy)]
struct Area {
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
}

/// Runs of gutter lines along one axis of `area`, as `(start, end)` offsets.
fn gutters(page: &Page<'_>, area: Area, rows: bool, opts: &SegmentOptions) -> Vec<(usize, usize)> {
    let (len, span) = if rows {
        (area.y1 - area.y0, area.x1 - area.x0)
    } else {
        (area.x1 - area.x0, area.y1 - area.y0)
    };
    let side = if rows { page.height } else { page.width };
    let min_run = ((opts.min_gutter * side as f32).ceil() as usize).max(1);
    let mut runs = Vec::new();
    let mut start = None;
    for i in 0..len {
        let paper = (0..span)
            .filter(|&j| {
                if rows {
                    page.paper(area.x0 + j, area.y0 + i)
                } else {
                    page.paper(area.x0 + i, area.y0 + j)
                }
            })
            .count();
        let at = |j: usize| {
            if rows {
                page.paper(area.x0 + j, area.y0 + i)
            } else {
                page.paper(area.x0 + i, area.y0 + j)
            }
        };
        let ends = ((opts.end_margin * span as f32).ceil() as usize).clamp(2, span.max(2));
        let open_ends =
            || (0..ends.min(span)).all(&at) && (span.saturating_sub(ends)..span).all(&at);
        let gutter = paper as f32 >= opts.gutter_ratio * span as f32
            || (paper as f32 >= opts.sfx_ratio * span as f32 && open_ends());
        match (gutter, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                if i - s >= min_run {
                    runs.push((s, i));
                }
                start = None;
            },
            _ => {},
        }
    }
    if let Some(s) = start
        && len - s >= min_run
    {
        runs.push((s, len));
    }
    runs
}

/// Splits `area` between its gutters; empty bands (all paper) are dropped.
fn bands(page: &Page<'_>, area: Area, rows: bool, opts: &SegmentOptions) -> Vec<Area> {
    let runs = gutters(page, area, rows, opts);
    let len = if rows { area.y1 - area.y0 } else { area.x1 - area.x0 };
    let mut out = Vec::new();
    let mut cursor = 0;
    for &(s, e) in runs.iter().chain(std::iter::once(&(len, len))) {
        if s > cursor {
            out.push(if rows {
                Area { y0: area.y0 + cursor, y1: area.y0 + s, ..area }
            } else {
                Area { x0: area.x0 + cursor, x1: area.x0 + s, ..area }
            });
        }
        cursor = e;
    }
    out
}

/// Shrinks `area` to its ink bounding box (drops the paper margins).
fn trim(page: &Page<'_>, area: Area) -> Option<Area> {
    let (mut x0, mut y0, mut x1, mut y1) = (usize::MAX, usize::MAX, 0, 0);
    for y in area.y0..area.y1 {
        for x in area.x0..area.x1 {
            if !page.paper(x, y) {
                x0 = x0.min(x);
                y0 = y0.min(y);
                x1 = x1.max(x + 1);
                y1 = y1.max(y + 1);
            }
        }
    }
    (x0 < x1 && y0 < y1).then_some(Area { x0, y0, x1, y1 })
}

/// Merges every part too small to be a panel into its neighbour along the cut, so that a title
/// line joins its logo and the letters of a logo stay together, instead of being dropped.
fn merge_fragments(page: &Page<'_>, mut parts: Vec<Area>, opts: &SegmentOptions) -> Vec<Area> {
    let page_area = (page.width * page.height) as f32;
    let fragment = |part: Area| {
        trim(page, part).is_some_and(|t| {
            let share = ((t.x1 - t.x0) * (t.y1 - t.y0)) as f32 / page_area;
            share > opts.negligible_area && share < opts.min_part_area
        })
    };
    let union = |a: Area, b: Area| Area {
        x0: a.x0.min(b.x0),
        y0: a.y0.min(b.y0),
        x1: a.x1.max(b.x1),
        y1: a.y1.max(b.y1),
    };
    while parts.len() > 1 {
        let Some(i) = parts.iter().position(|&p| fragment(p)) else { break };
        // Prefer the preceding part: a title line sits under its logo, over its first panel.
        let j = if i > 0 { i - 1 } else { i + 1 };
        let merged = union(parts[i], parts[j]);
        let keep = i.min(j);
        parts[keep] = merged;
        parts.remove(i.max(j));
    }
    parts
}

fn cut(
    page: &Page<'_>,
    area: Area,
    rows: bool,
    depth: u32,
    opts: &SegmentOptions,
    out: &mut Vec<Area>,
) {
    let Some(area) = trim(page, area) else { return };
    let min_w = (opts.min_panel * page.width as f32) as usize;
    let min_h = (opts.min_panel * page.height as f32) as usize;
    if area.x1 - area.x0 < min_w || area.y1 - area.y0 < min_h {
        return;
    }
    if depth < opts.max_depth {
        for axis in [rows, !rows] {
            let parts = merge_fragments(page, bands(page, area, axis, opts), opts);
            if parts.len() > 1 {
                for part in parts {
                    cut(page, part, !axis, depth + 1, opts, out);
                }
                return;
            }
        }
    }
    out.push(area);
}

/// Finds the panels of a page (`rgba`, `width × height`), in Japanese reading order: tiers top
/// to bottom, panels right to left within a tier. An empty result means no gutter was found.
#[must_use]
pub fn segment_panels(
    rgba: &[u8],
    width: usize,
    height: usize,
    opts: &SegmentOptions,
) -> Vec<PanelRect> {
    if width == 0 || height == 0 || rgba.len() < width * height * 4 {
        return Vec::new();
    }
    let page = Page { rgba, width, height, paper: opts.paper_luma };
    let mut areas = Vec::new();
    cut(&page, Area { x0: 0, y0: 0, x1: width, y1: height }, true, 0, opts, &mut areas);
    let (w, h) = (width as f32, height as f32);
    let mut panels: Vec<PanelRect> = areas
        .into_iter()
        .map(|a| PanelRect {
            x: a.x0 as f32 / w,
            y: a.y0 as f32 / h,
            w: (a.x1 - a.x0) as f32 / w,
            h: (a.y1 - a.y0) as f32 / h,
        })
        .collect();
    reading_order(&mut panels);
    panels
}

/// Japanese reading order, as a total order: panels are grouped in tiers (a panel joins the
/// current tier when it starts above the middle of the tier's shortest panel), tiers top to
/// bottom, panels right to left within a tier. A pairwise "same tier" comparator is not
/// transitive (L-shaped layouts) and may make `sort_by` panic.
fn reading_order(panels: &mut Vec<PanelRect>) {
    panels.sort_by(|a, b| a.y.total_cmp(&b.y));
    let mut tiers: Vec<Vec<PanelRect>> = Vec::new();
    for p in panels.drain(..) {
        let bound = tiers
            .last()
            .map(|tier| tier.iter().map(|q| q.y + q.h * 0.5).fold(f32::INFINITY, f32::min));
        match (tiers.last_mut(), bound) {
            (Some(tier), Some(bound)) if p.y < bound => tier.push(p),
            _ => tiers.push(vec![p]),
        }
    }
    for mut tier in tiers {
        tier.sort_by(|a, b| (b.x + b.w).total_cmp(&(a.x + a.w)));
        panels.extend(tier);
    }
}

/// Box-filters `rgba` (`width × height`) so that its longer side is at most `max_side`.
///
/// Segmentation needs the full resolution (a scaled gutter blurs into the art); the texture
/// does not: a 2560 px scan minified to a 600 px canvas by a bilinear sampler aliases its
/// screentones into moiré. Each output pixel averages the source pixels it covers.
#[must_use]
pub fn downsample(rgba: &[u8], width: u32, height: u32, max_side: u32) -> (Vec<u8>, u32, u32) {
    let longer = width.max(height);
    if longer <= max_side || max_side == 0 {
        return (rgba.to_vec(), width, height);
    }
    let scale = f64::from(max_side) / f64::from(longer);
    let (ow, oh) = (
        ((f64::from(width) * scale).round() as u32).max(1),
        ((f64::from(height) * scale).round() as u32).max(1),
    );
    let mut out = vec![0_u8; (ow * oh * 4) as usize];
    for oy in 0..oh {
        let y0 = (u64::from(oy) * u64::from(height) / u64::from(oh)) as u32;
        let y1 = ((u64::from(oy + 1) * u64::from(height) / u64::from(oh)) as u32).max(y0 + 1);
        for ox in 0..ow {
            let x0 = (u64::from(ox) * u64::from(width) / u64::from(ow)) as u32;
            let x1 = ((u64::from(ox + 1) * u64::from(width) / u64::from(ow)) as u32).max(x0 + 1);
            let mut sum = [0_u32; 4];
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * width + x) * 4) as usize;
                    for c in 0..4 {
                        sum[c] += u32::from(rgba[i + c]);
                    }
                }
            }
            let n = (y1 - y0) * (x1 - x0);
            let o = ((oy * ow + ox) * 4) as usize;
            for c in 0..4 {
                out[o + c] = ((sum[c] + n / 2) / n) as u8;
            }
        }
    }
    (out, ow, oh)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// White page with black rectangles at the given pixel boxes.
    fn page(width: usize, height: usize, boxes: &[(usize, usize, usize, usize)]) -> Vec<u8> {
        let mut rgba = vec![255; width * height * 4];
        for &(x0, y0, x1, y1) in boxes {
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = (y * width + x) * 4;
                    rgba[i..i + 3].copy_from_slice(&[20, 20, 20]);
                }
            }
        }
        rgba
    }

    #[test]
    fn a_wide_panel_over_three_finds_four_in_reading_order() {
        // Tier 1: one wide panel. Tier 2: three panels, read right to left.
        let rgba = page(
            200,
            300,
            &[(10, 10, 190, 140), (10, 160, 60, 290), (75, 160, 125, 290), (140, 160, 190, 290)],
        );
        let panels = segment_panels(&rgba, 200, 300, &SegmentOptions::default());
        assert_eq!(panels.len(), 4);
        assert!((panels[0].w - 0.9).abs() < 0.01, "wide panel first: {:?}", panels[0]);
        assert!(
            panels[1].x > panels[2].x && panels[2].x > panels[3].x,
            "right to left: {panels:?}"
        );
        assert!((panels[3].x - 0.05).abs() < 0.01);
    }

    #[test]
    fn downsample_averages_the_covered_pixels() {
        // 4 × 2 page: left half black, right half white → 2 × 1 at max side 2.
        let mut rgba = vec![255_u8; 4 * 2 * 4];
        for y in 0..2 {
            for x in 0..2 {
                let i = (y * 4 + x) * 4;
                rgba[i..i + 3].copy_from_slice(&[0, 0, 0]);
            }
        }
        let (out, w, h) = downsample(&rgba, 4, 2, 2);
        assert_eq!((w, h), (2, 1));
        assert_eq!(&out[0..4], &[0, 0, 0, 255]);
        assert_eq!(&out[4..8], &[255, 255, 255, 255]);
        let (same, w, h) = downsample(&rgba, 4, 2, 8);
        assert_eq!((w, h, same.len()), (4, 2, rgba.len()));
    }

    #[test]
    fn an_onomatopoeia_across_a_gutter_does_not_merge_the_tiers() {
        // Two tiers; a 3 % wide blot crosses the gutter in the middle, the ends stay paper.
        let rgba = page(400, 600, &[(10, 10, 390, 290), (10, 310, 390, 590), (190, 280, 202, 320)]);
        let panels = segment_panels(&rgba, 400, 600, &SegmentOptions::default());
        assert_eq!(panels.len(), 2, "{panels:?}");
    }

    #[test]
    fn a_line_through_a_panel_is_not_a_gutter() {
        // One panel with a near-white inner row (95 % paper) that ends on the ink borders.
        let mut rgba = page(400, 600, &[(10, 10, 390, 590)]);
        for y in 298..304 {
            for x in 20..380 {
                let i = (y * 400 + x) * 4;
                rgba[i..i + 3].copy_from_slice(&[255, 255, 255]);
            }
        }
        let panels = segment_panels(&rgba, 400, 600, &SegmentOptions::default());
        assert_eq!(panels.len(), 1, "{panels:?}");
    }

    #[test]
    fn logo_letters_stay_one_block() {
        // A title line of five letters 8 px apart over a full-width panel.
        let mut boxes: Vec<(usize, usize, usize, usize)> =
            (0..5).map(|k| (40 + k * 60, 20, 92 + k * 60, 80)).collect();
        boxes.push((10, 120, 390, 590));
        let rgba = page(400, 600, &boxes);
        let panels = segment_panels(&rgba, 400, 600, &SegmentOptions::default());
        assert_eq!(panels.len(), 2, "logo kept whole: {panels:?}");
        assert!(panels[0].w > 0.7);
    }

    #[test]
    fn an_l_shaped_layout_sorts_without_panic() {
        let mut panels = vec![
            PanelRect { x: 0.5, y: 0.0, w: 0.5, h: 1.0 },
            PanelRect { x: 0.0, y: 0.0, w: 0.5, h: 0.3 },
            PanelRect { x: 0.0, y: 0.32, w: 0.5, h: 0.3 },
            PanelRect { x: 0.0, y: 0.64, w: 0.5, h: 0.36 },
        ];
        reading_order(&mut panels);
        assert_eq!(panels.len(), 4);
        assert_eq!(panels[0].x, 0.5, "the tall right panel reads first");
    }

    #[test]
    fn a_narrow_gutter_still_splits_a_tier() {
        // 1000 px wide page, panels 5 px apart (0.5 % of the width).
        let rgba = page(1000, 600, &[(20, 20, 490, 580), (495, 20, 980, 580)]);
        let panels = segment_panels(&rgba, 1000, 600, &SegmentOptions::default());
        assert_eq!(panels.len(), 2, "{panels:?}");
        assert!(panels[0].x > panels[1].x, "right panel first");
    }

    #[test]
    fn a_page_without_gutter_is_one_panel_and_a_blank_page_none() {
        let full = page(100, 140, &[(0, 0, 100, 140)]);
        assert_eq!(segment_panels(&full, 100, 140, &SegmentOptions::default()).len(), 1);
        let blank = page(100, 140, &[]);
        assert!(segment_panels(&blank, 100, 140, &SegmentOptions::default()).is_empty());
        assert!(segment_panels(&[], 0, 0, &SegmentOptions::default()).is_empty());
    }

    #[test]
    fn specks_smaller_than_a_panel_are_dropped() {
        let rgba = page(200, 300, &[(10, 10, 190, 290), (195, 5, 197, 7)]);
        let panels = segment_panels(&rgba, 200, 300, &SegmentOptions::default());
        assert_eq!(panels.len(), 1);
    }

    /// Qualification on an authorised scan kept outside the repository:
    /// `SHENRON_MANGA_PAGE=page.jpg cargo test -p shenron-panels real_page -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs SHENRON_MANGA_PAGE, an authorised scan outside the repository"]
    fn real_page() {
        let path = std::env::var("SHENRON_MANGA_PAGE").expect("SHENRON_MANGA_PAGE");
        let image = image::open(path).expect("page decodes").to_rgba8();
        let (w, h) = image.dimensions();
        let panels =
            segment_panels(image.as_raw(), w as usize, h as usize, &SegmentOptions::default());
        for p in &panels {
            println!("panel x={:.3} y={:.3} w={:.3} h={:.3}", p.x, p.y, p.w, p.h);
        }
        let expected: usize =
            std::env::var("SHENRON_MANGA_PANELS").ok().and_then(|n| n.parse().ok()).unwrap_or(0);
        if expected > 0 {
            assert_eq!(panels.len(), expected);
        }
    }
}
