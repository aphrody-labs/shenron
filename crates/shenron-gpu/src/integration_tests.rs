// SPDX-License-Identifier: Apache-2.0
//! Tests that open a device: the noop backend (always available, validates every call) and a
//! software adapter (real rendering, skipped when the machine has none).

use std::time::Duration;

use wgpu::{BufferDescriptor, BufferUsages, DeviceType, Features, Limits};

use crate::GpuContext;
use crate::error::GpuError;
use crate::options::{LimitsPolicy, NoopOptions};
use crate::target::{RenderTarget, TargetPool};
use crate::testing::{noop_context, noop_options, software_context};

fn noop_with(limits: Limits, features: Features) -> NoopOptions {
    NoopOptions {
        limits: Some(limits),
        features: Some(features),
        device_type: Some(DeviceType::Other),
    }
}

/// Provokes a validation error: a buffer without any usage.
fn invalid_buffer(context: &GpuContext) {
    let _ = context.device().create_buffer(&BufferDescriptor {
        label: Some("invalid on purpose"),
        size: 16,
        usage: BufferUsages::empty(),
        mapped_at_creation: false,
    });
}

mod noop {
    use super::*;

    #[test]
    fn the_device_gets_the_limits_the_policy_resolves() {
        let adapter = Limits { max_texture_dimension_2d: 4096, ..Limits::default() };
        let context = noop_context(noop_with(adapter, Features::all()));
        assert_eq!(context.device().limits().max_texture_dimension_2d, 4096);
        assert_eq!(context.report().backend, "noop");
        assert!(!context.report().is_software);
    }

    #[test]
    fn a_missing_required_feature_is_an_error_naming_the_adapter() {
        let mut options = noop_options(noop_with(Limits::default(), Features::empty()));
        options.required_features = Features::CLEAR_TEXTURE;
        match GpuContext::new_blocking(&options) {
            Err(GpuError::MissingFeatures { missing, .. }) => {
                assert!(missing.contains("CLEAR_TEXTURE"), "{missing}")
            },
            other => panic!("expected MissingFeatures, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn optional_features_are_enabled_only_when_the_adapter_has_them() {
        let mut options = noop_options(noop_with(Limits::default(), Features::CLEAR_TEXTURE));
        options.optional_features = Features::CLEAR_TEXTURE | Features::PIPELINE_CACHE;
        let context = GpuContext::new_blocking(&options).expect("noop opens");
        assert!(context.device().features().contains(Features::CLEAR_TEXTURE));
        assert!(!context.device().features().contains(Features::PIPELINE_CACHE));
    }

    #[test]
    fn an_unknown_adapter_name_lists_what_is_available() {
        let mut options = noop_options(NoopOptions::default());
        options.adapter_name = Some("no such gpu".into());
        match GpuContext::new_blocking(&options) {
            Err(GpuError::NoAdapter(detail)) => assert!(detail.contains("no such gpu"), "{detail}"),
            other => panic!("expected NoAdapter, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn an_uncaptured_validation_error_is_recorded_instead_of_panicking() {
        let context = noop_context(NoopOptions::default());
        assert_eq!(context.error_count(), 0);
        invalid_buffer(&context);
        // Errors are reported on the calling thread for native wgpu-core; give the poll a chance.
        let _ = context.device().poll(wgpu::PollType::Poll);
        assert_eq!(context.error_count(), 1);
        let errors = context.take_errors();
        assert!(matches!(errors.as_slice(), [GpuError::Validation(_)]), "{errors:?}");
        assert!(context.take_errors().is_empty(), "taking drains the log");
    }

    #[test]
    fn validated_returns_the_validation_error_to_the_caller() {
        let context = noop_context(NoopOptions::default());
        let result = context.validated_blocking(|| invalid_buffer(&context));
        assert!(matches!(result, Err(GpuError::Validation(_))), "{result:?}");
        assert_eq!(context.error_count(), 0, "a captured error does not reach the handler");
        assert!(context.validated_blocking(|| ()).is_ok());
    }

    #[test]
    fn a_destroyed_device_is_reported_as_lost() {
        let context = noop_context(NoopOptions::default());
        assert!(context.ensure_alive().is_ok());
        context.device().destroy();
        for _ in 0..100 {
            let _ = context.device().poll(wgpu::PollType::Poll);
            if context.lost().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let loss = context.lost().expect("the device-lost callback ran");
        assert_eq!(loss.reason, "Destroyed");
        assert!(matches!(context.ensure_alive(), Err(GpuError::DeviceLost { .. })));
    }

    #[test]
    fn render_targets_refuse_what_the_device_cannot_hold() {
        let adapter = Limits { max_texture_dimension_2d: 1024, ..Limits::default() };
        let context = noop_context(noop_with(adapter, Features::all()));
        match RenderTarget::new(context.device(), "too wide", 1025, 10) {
            Err(error) => assert_eq!(
                error,
                GpuError::SurfaceTooLarge { width: 1025, height: 10, limit: 1024 }
            ),
            Ok(_) => panic!("a texture wider than the limit must be refused"),
        }
        assert!(matches!(
            RenderTarget::new(context.device(), "empty", 0, 10),
            Err(GpuError::InvalidSurface { .. })
        ));
        assert!(RenderTarget::new(context.device(), "fits", 1024, 8).is_ok());
    }

    #[test]
    fn the_readback_buffer_must_fit_the_buffer_limit() {
        let adapter = Limits { max_buffer_size: 1 << 20, ..Limits::default() };
        let mut options = noop_options(noop_with(adapter, Features::all()));
        options.limits = LimitsPolicy::Default;
        let context = GpuContext::new_blocking(&options).expect("noop opens");
        // 1024 x 1024 RGBA = 4 MiB > 1 MiB.
        assert!(matches!(
            RenderTarget::new(context.device(), "big", 1024, 1024),
            Err(GpuError::Readback(_))
        ));
    }

    #[test]
    fn the_pool_reuses_a_target_of_the_same_size_and_bounds_idle_ones() {
        let context = noop_context(NoopOptions::default());
        let mut pool = TargetPool::new(2);
        let first = pool.take(context.device(), "page", 64, 64).expect("allocates");
        pool.put(first);
        assert_eq!(pool.len(), 1);
        let again = pool.take(context.device(), "page", 64, 64).expect("reuses");
        assert_eq!(pool.len(), 0, "taking removes it from the pool");
        pool.put(again);
        for width in [32, 48, 96] {
            let target = pool.take(context.device(), "page", width, 8).expect("allocates");
            pool.put(target);
        }
        assert_eq!(pool.len(), 2, "idle targets are bounded by the capacity");
        pool.clear();
        assert!(pool.is_empty());
    }

    #[test]
    fn the_report_serialises_for_health_endpoints() {
        let context = noop_context(noop_with(Limits::default(), Features::CLEAR_TEXTURE));
        let json = serde_json::to_value(context.report()).expect("serialises");
        assert_eq!(json["backend"], "noop");
        assert!(
            json["features"].as_array().is_some_and(|f| f.iter().any(|n| n == "CLEAR_TEXTURE")),
            "{json}"
        );
    }
}

#[cfg(feature = "vello")]
mod software {
    use vello::kurbo::{Affine, Rect};
    use vello::peniko::{Color, Fill};
    use vello::{AaConfig, AaSupport, Scene};

    use super::*;
    use crate::VelloBackend;

    /// Renders a `width` x `height` page with a red square in the middle and reads it back.
    fn render_square(context: &GpuContext, width: u32, height: u32) -> (Vec<u8>, RenderTarget) {
        let mut backend =
            VelloBackend::new(context, AaSupport::area_only()).expect("Vello builds a renderer");
        let target =
            RenderTarget::new(context.device(), "software page", width, height).expect("allocates");
        let mut scene = Scene::new();
        let (w, h) = (f64::from(width), f64::from(height));
        scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            Color::from_rgba8(255, 0, 0, 255),
            None,
            &Rect::new(w / 4.0, h / 4.0, w * 3.0 / 4.0, h * 3.0 / 4.0),
        );
        backend
            .render(
                context,
                &scene,
                target.view(),
                (width, height),
                Color::from_rgba8(0, 0, 0, 0),
                AaConfig::Area,
            )
            .expect("renders");
        let mut encoder =
            context.device().create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("test readback"),
            });
        target.copy_to_readback(&mut encoder);
        let submission = context.queue().submit([encoder.finish()]);
        let pixels =
            target.read_blocking(context, submission, Duration::from_secs(60)).expect("reads back");
        (pixels, target)
    }

    fn pixel(pixels: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let at = ((y * width + x) * 4) as usize;
        [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]]
    }

    #[test]
    fn a_software_adapter_renders_and_reads_back_a_scene() {
        let Some(context) = software_context() else { return };
        let (pixels, target) = render_square(&context, 64, 64);
        assert_eq!(pixels.len(), 64 * 64 * 4);
        assert_eq!(pixel(&pixels, 64, 32, 32), [255, 0, 0, 255], "inside the square");
        assert_eq!(pixel(&pixels, 64, 2, 2), [0, 0, 0, 0], "outside the square");
        assert_eq!(target.size(), (64, 64));
        assert_eq!(context.error_count(), 0, "{:?}", context.take_errors());
    }

    #[test]
    fn rows_that_need_padding_come_back_intact() {
        let Some(context) = software_context() else { return };
        // 50 px = 200 bytes per row, padded to 256 in the readback buffer.
        let (pixels, target) = render_square(&context, 50, 37);
        assert_eq!(target.layout().padded_bytes_per_row, 256);
        assert_eq!(pixels.len(), 50 * 37 * 4);
        assert_eq!(pixel(&pixels, 50, 25, 18), [255, 0, 0, 255]);
        assert_eq!(pixel(&pixels, 50, 49, 36), [0, 0, 0, 0], "the last pixel of the last row");
    }

    #[test]
    fn a_target_can_be_reused_for_the_next_page() {
        let Some(context) = software_context() else { return };
        let mut pool = TargetPool::new(1);
        let (first, target) = render_square(&context, 32, 32);
        pool.put(target);
        let target = pool.take(context.device(), "again", 32, 32).expect("reuses");
        assert_eq!(target.size(), (32, 32));
        assert_eq!(first.len(), 32 * 32 * 4);
    }

    #[test]
    fn the_pipeline_cache_survives_a_restart() {
        let directory =
            std::env::temp_dir().join(format!("shenron-gpu-cache-{}", std::process::id()));
        let mut options = crate::testing::software_options().for_vello();
        options.pipeline_cache_dir = Some(directory.clone());
        let Ok(context) = GpuContext::new_blocking(&options) else { return };
        if !context.report().is_software || context.pipeline_cache().is_none() {
            return; // the adapter has no pipeline cache: nothing to persist
        }
        VelloBackend::new(&context, AaSupport::area_only()).expect("Vello builds a renderer");
        context.save_pipeline_cache().expect("saves");
        let saved = std::fs::read_dir(&directory).map(|entries| entries.count()).unwrap_or(0);
        assert_eq!(saved, 1, "one cache file per adapter");
        // A second context loads it without error.
        let again = GpuContext::new_blocking(&options).expect("reopens");
        assert!(again.pipeline_cache().is_some());
        std::fs::remove_dir_all(&directory).ok();
    }
}
