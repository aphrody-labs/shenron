# wgpu 30.0.1 API map — Surface and presentation

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 23 public items.

### CompositeAlphaMode — enum

Specifies how the alpha channel of the textures should be handled during compositing.

Variants (5):
- `Auto = 0` — Chooses either `Opaque` or `Inherit` automatically, depending on the `alpha_mode` that the current surface can support.
- `Opaque = 1` — The alpha channel, if it exists, of the textures is ignored in the compositing process. Instead, the textures is treated as if it has a constant alpha of 1.0.
- `PreMultiplied = 2` — The alpha channel, if it exists, of the textures is respected in the compositing process. The non-alpha channels of the textures are expected to already be multiplied by the alpha channel by the appl…
- `PostMultiplied = 3` — The alpha channel, if it exists, of the textures is respected in the compositing process. The non-alpha channels of the textures are not expected to already be multiplied by the alpha channel by the…
- `Inherit = 4` — The alpha channel, if it exists, of the textures is unknown for processing during compositing. Instead, the application is responsible for setting the composite alpha blending mode using native WSI c…

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### CreateSurfaceError — struct _[non_exhaustive]_

[`Instance::create_surface()`] or a related function failed.

Opaque (private fields).

Implements: `Clone`, `Debug`, `Display`, `Error`, `From<CreateSurfaceError>`

### CurrentSurfaceTexture — enum

Result of a call to [`Surface::get_current_texture`].

Variants (7):
- `Success(SurfaceTexture)` — Successfully acquired a surface texture with no issues.
- `Suboptimal(SurfaceTexture)` — Successfully acquired a surface texture, but texture no longer matches the properties of the underlying surface. It's highly recommended to call [`Surface::configure`] again for optimal performance.
- `Timeout` — A timeout was encountered while trying to acquire the next frame.
- `Occluded` — The window is occluded (e.g. minimized or behind another window).
- `Outdated` — The underlying surface has changed, and therefore the surface configuration is outdated.
- `Lost` — The surface has been lost and needs to be recreated.
- `Validation` — A validation error inside [`Surface::get_current_texture()`] was raised and caught by an [error scope](crate::Device::push_error_scope) or [`on_uncaptured_error()`][crate::Device::on_uncaptured_error…

Implements: `Debug`

### DisplayAndWindowHandle — trait

Super trait for a pair of display and window handles as used in [`SurfaceTarget`].

### DisplayChromaticity — struct

CIE 1931 xy chromaticity of a display's primaries and white point. Each coordinate is `[x, y]`; a coordinate the platform omits is `None`.

Fields:
- `red: Option<[f32; 2]>` — xy of the red primary.
- `green: Option<[f32; 2]>` — xy of the green primary.
- `blue: Option<[f32; 2]>` — xy of the blue primary.
- `white: Option<[f32; 2]>` — xy of the white point.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### DisplayCoarseRange — struct

Coarse, boolean dynamic-range and gamut signal.

Fields:
- `high_dynamic_range: Option<bool>` — CSS `@media (dynamic-range: high)`: the display *can* present HDR-range content. Best-effort and platform-defined — "capable", not "an HDR mode is active". It feeds [`tone_map_hea…
- `gamut: Option<DisplayGamut>` — Best gamut bucket the display covers (CSS `color-gamut`).

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `PartialEq`, `StructuralPartialEq`

### DisplayGamut — enum _[non_exhaustive]_

Coarse gamut classification, mirroring CSS `color-gamut`.

Variants (3):
- `Srgb` — Approximately sRGB / Rec.709.
- `DisplayP3` — Approximately Display-P3.
- `Rec2020` — Approximately Rec.2020.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### DisplayHdrInfo — struct

HDR and luminance characteristics of the display backing a [`Surface`], as reported by the platform at query time.

Fields:
- `luminance: Option<DisplayLuminance>` — Absolute-nit luminance levels. `Some` only on platforms that report absolute nits (Windows, via DXGI). `None` on Apple EDR, the web, Vulkan on non-Windows, and GLES.
- `headroom: Option<DisplayHeadroom>` — Relative EDR-headroom multipliers. `Some` only on Apple. `None` elsewhere.
- `chromaticity: Option<DisplayChromaticity>` — Chromaticity of the display's primaries and white point (CIE 1931 xy). `Some` only on Windows (via DXGI). `None` on Apple (which exposes no primaries), the web (boolean-only), Vul…
- `coarse: Option<DisplayCoarseRange>` — Coarse, boolean dynamic-range + gamut bucket. The only luminance-adjacent data the web exposes (CSS `dynamic-range` / `color-gamut`), and a useful cross-check elsewhere. `None` on…
- `bits_per_color: Option<u8>` — Output signal bit depth, e.g. `8` / `10` / `12` (DXGI `BitsPerColor`). Advisory and often unreliable (may report `8` on a 10-bit panel). `None` if unreported.

Methods and constants:
- `fn tone_map_headroom(&self) -> Option<f32>` — Best-effort tone-map headroom: the linear multiplier of SDR white the display can drive before clipping. This is the single value most tone-mappers want, with the subjective parts left to the application. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### DisplayHeadroom — struct

Relative EDR headroom (Apple): unitless multipliers over current SDR white, where `1.0` means no headroom. Moves with brightness, ambient light, battery, and which display the window is on. Apple exposes no absolute-nit equivalent, so this is separate from [`DisplayLuminance`] and can't be converted to nits.

Fields:
- `current: Option<f32>` — Headroom available *right now* (`maximumExtendedDynamicRangeColorComponentValue` / iOS `UIScreen.currentEDRHeadroom`). `1.0` means no headroom at this instant, even on an HDR-capa…
- `potential: Option<f32>` — Headroom the display could reach under ideal conditions (`maximumPotentialExtendedDynamicRangeColorComponentValue` / `UIScreen.potentialEDRHeadroom`).
- `reference: Option<f32>` — Headroom for reference-white content (`maximumReferenceExtendedDynamicRangeColorComponentValue`). `None` if unreported.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### DisplayLuminance — struct

Absolute luminance levels in nits (cd/m²). Populated only on Windows (via DXGI); `None` on every other platform.

Fields:
- `max_nits: Option<f32>` — Peak luminance of a small patch, nits. DXGI `MaxLuminance`.
- `max_full_frame_nits: Option<f32>` — Sustained full-white-frame luminance, nits: the ceiling for a fully-lit frame, which power/thermal limits can hold below the small-patch peak [`max_nits`](Self::max_nits). May equ…
- `min_nits: Option<f32>` — Minimum (black) luminance, nits. DXGI `MinLuminance`.
- `sdr_white_nits: Option<f32>` — Luminance the OS maps SDR reference white to, nits; moves with the brightness slider. Converts between absolute nits and relative EDR headroom (`max_nits / sdr_white_nits`). Read…

Implements: `Clone`, `Copy`, `Debug`, `Default`, `PartialEq`, `StructuralPartialEq`

### PresentationTimestamp — struct

Nanosecond timestamp used by the presentation engine.

Fields (tuple):
- `0: u128` — Timestamp in nanoseconds.

Methods and constants:
- `const INVALID_TIMESTAMP: Self` — A timestamp that is invalid due to the platform not having a timestamp system.
- `fn is_invalid(self) -> bool` — Returns true if this timestamp is the invalid timestamp. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Ord`, `PartialEq`, `PartialOrd`, `StructuralPartialEq`

### PresentMode — enum

Timing and queueing with which frames are actually displayed to the user.

Variants (6):
- `AutoVsync = 0` — Chooses the first supported mode out of:
- `AutoNoVsync = 1` — Chooses the first supported mode out of:
- `Fifo = 2` — Presentation frames are kept in a First-In-First-Out queue approximately 3 frames long. Every vertical blanking period, the presentation engine will pop a frame off the queue to display. If there is…
- `FifoRelaxed = 3` — Presentation frames are kept in a First-In-First-Out queue approximately 3 frames long. Every vertical blanking period, the presentation engine will pop a frame off the queue to display. If there is…
- `Immediate = 4` — Presentation frames are not queued at all. The moment a present command is executed on the GPU, the presented image is swapped onto the front buffer immediately.
- `Mailbox = 5` — Presentation frames are kept in a single-frame queue. Every vertical blanking period, the presentation engine will pop a frame from the queue. If there is no frame to display, it will present the sam…

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Surface`<'window>` — struct

Handle to a presentable surface.

Opaque (private fields).

Methods and constants:
- `fn get_capabilities(&self, adapter: &Adapter) -> SurfaceCapabilities` — Returns the capabilities of the surface when used with the given adapter.
- `fn display_hdr_info(&self, adapter: &Adapter) -> DisplayHdrInfo` — Returns the HDR and luminance characteristics of the display backing this surface, or [`DisplayHdrInfo::default`] (all fields `None`) when nothing is known - which means unknown, not an SDR display. Never panics, includ…
- `fn get_default_config(&self, adapter: &Adapter, width: u32, height: u32) -> Option<SurfaceConfiguration>` — Return a default `SurfaceConfiguration` from width and height to use for the [`Surface`] with this adapter.
- `fn configure(&self, device: &Device, config: &SurfaceConfiguration)` — Initializes [`Surface`] for presentation.
- `fn get_configuration(&self) -> Option<SurfaceConfiguration>` — Returns the current configuration of [`Surface`], if configured.
- `fn get_current_texture(&self) -> CurrentSurfaceTexture` — Returns the next texture to be presented by the surface for drawing.
- `unsafe fn as_hal<A: hal::Api>(&self) -> Option<impl Deref<Target = <A as >::Surface> + WasmNotSendSync>` — Get the [`wgpu_hal`] surface from this `Surface`.

Implements: `Debug`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### SurfaceCapabilities — struct

Defines the capabilities of a given surface and adapter.

Fields:
- `formats: alloc::vec::Vec<TextureFormat>` — List of supported formats to use with the given adapter. The first format in the vector is preferred.
- `format_capabilities: alloc::vec::Vec<SurfaceFormatCapabilities>` — List of supported formats together with the color spaces supported for each format, in the same preference order as [`formats`](Self::formats), of which it is a superset.
- `present_modes: alloc::vec::Vec<PresentMode>` — List of supported presentation modes to use with the given adapter.
- `alpha_modes: alloc::vec::Vec<CompositeAlphaMode>` — List of supported alpha modes to use with the given adapter.
- `usages: TextureUsages` — Bitflag of supported texture usages for the surface to use with the given adapter.

Methods and constants:
- `fn color_spaces(&self, format: TextureFormat) -> SurfaceColorSpaces` — Returns the set of color spaces supported for the given format, or an empty set if the format is not supported. _[must_use]_

Implements: `Debug`, `Default`

### SurfaceColorSpace — enum

The color space in which the presentation engine interprets the values written to a surface texture.

Variants (8):
- `Auto = 0` — Let the backend choose a color space, reproducing wgpu's historical behavior:
- `Srgb = 1` — The sRGB color space: BT.709 primaries, D65 white point, sRGB transfer function, standard dynamic range.
- `ExtendedSrgbLinear = 2` — Extended linear sRGB, also known as [scRGB] (the **linear** encoding of IEC 61966-2-2): BT.709 primaries, D65 white point, **linear** transfer function, extended dynamic range. Typically used with [`…
- `DisplayP3 = 3` — The [Display P3] color space: P3 primaries, D65 white point, sRGB transfer function, standard dynamic range.
- `Bt2100Pq = 4` — BT.2100 perceptual quantization (HDR10): BT.2020/2100 primaries, D65 white point, SMPTE ST 2084 perceptual quantizer ([PQ]) transfer function, high dynamic range.
- `Bt2100Hlg = 5` — BT.2100 hybrid log-gamma: BT.2020/2100 primaries, D65 white point, [HLG] (ARIB STD-B67) transfer function, high dynamic range.
- `ExtendedSrgb = 6` — Extended-range sRGB (encoded): BT.709 primaries, D65 white point, the **nonlinear sRGB transfer function extended beyond 0.0..=1.0**, extended dynamic range.
- `ExtendedDisplayP3 = 7` — Extended-range Display-P3 (encoded): P3 primaries, D65 white point, the **nonlinear sRGB transfer function extended beyond 0.0..=1.0**, extended dynamic range.

Methods and constants:
- `const fn to_color_spaces(self) -> Option<SurfaceColorSpaces>` — Returns the [`SurfaceColorSpaces`] flag set holding just this color space, or `None` for [`Auto`](Self::Auto) (which maps to no specific flag). _[must_use]_
- `const fn is_hdr(self) -> bool` — Whether this is a high-dynamic-range color space: one that drives values above SDR white (`1.0`) as brighter-than-white output. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SurfaceColorSpaces — struct

A set of [`SurfaceColorSpace`]s supported by a surface for a particular texture format.

Opaque (private fields).

Methods and constants:
- `const SRGB: Self` — [`SurfaceColorSpace::Srgb`] is supported.
- `const EXTENDED_SRGB_LINEAR: Self` — [`SurfaceColorSpace::ExtendedSrgbLinear`] is supported.
- `const DISPLAY_P3: Self` — [`SurfaceColorSpace::DisplayP3`] is supported.
- `const BT2100_PQ: Self` — [`SurfaceColorSpace::Bt2100Pq`] is supported.
- `const BT2100_HLG: Self` — [`SurfaceColorSpace::Bt2100Hlg`] is supported.
- `const EXTENDED_SRGB: Self` — [`SurfaceColorSpace::ExtendedSrgb`] is supported.
- `const EXTENDED_DISPLAY_P3: Self` — [`SurfaceColorSpace::ExtendedDisplayP3`] is supported.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u32` — Get the underlying bits value.
- `const fn from_bits(bits: u32) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u32) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u32) -> Self` — Convert from a bits value exactly.
- `fn from_name(name: &str) -> $crate::__private::core::option::Option<Self>` — Get a flags value with the bits of a flag with the given name set.
- `const fn is_empty(&self) -> bool` — Whether all bits in `self` are unset.
- `const fn is_all(&self) -> bool` — Whether all known bits in this flags value are set.
- `const fn intersects(&self, other: Self) -> bool` — Whether any set bits in `other` are also set in `self`.
- `const fn contains(&self, other: Self) -> bool` — Whether all set bits in `other` are also set in `self`.
- `fn insert(&mut self, other: Self)` — The bitwise or (`\|`) of the bits in `self` and `other`.
- `fn remove(&mut self, other: Self)` — The intersection of `self` with the complement of `other` (`&!`).
- `fn toggle(&mut self, other: Self)` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`.
- `fn set(&mut self, other: Self, value: bool)` — Call `insert` when `value` is `true` or `remove` when `value` is `false`.
- `const fn intersection(self, other: Self) -> Self` — The bitwise and (`&`) of the bits in `self` and `other`. _[must_use]_
- `const fn union(self, other: Self) -> Self` — The bitwise or (`\|`) of the bits in `self` and `other`. _[must_use]_
- `const fn difference(self, other: Self) -> Self` — The intersection of `self` with the complement of `other` (`&!`). _[must_use]_
- `const fn symmetric_difference(self, other: Self) -> Self` — The bitwise exclusive-or (`^`) of the bits in `self` and `other`. _[must_use]_
- `const fn complement(self) -> Self` — The bitwise negation (`!`) of the bits in `self`, truncating the result. _[must_use]_
- `const fn iter(&self) -> $crate::iter::Iter<SurfaceColorSpaces>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<SurfaceColorSpaces>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<SurfaceColorSpaces>`, `Flags`, `FromIterator<SurfaceColorSpaces>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### SurfaceConfiguration — type alias

`type SurfaceConfiguration = SurfaceConfiguration<alloc::vec::Vec<TextureFormat>>`

Configures a [`Surface`] for presentation.

Fields:
- `usage: TextureUsages` — The usage of the swap chain. The only usage guaranteed to be supported is [`TextureUsages::RENDER_ATTACHMENT`].
- `format: TextureFormat` — The texture format of the swap chain. The only formats that are guaranteed are [`TextureFormat::Bgra8Unorm`] and [`TextureFormat::Bgra8UnormSrgb`].
- `color_space: SurfaceColorSpace` — The color space in which the presentation engine interprets the values written to the swap chain.
- `width: u32` — Width of the swap chain. Must be the same size as the surface, and nonzero.
- `height: u32` — Height of the swap chain. Must be the same size as the surface, and nonzero.
- `present_mode: PresentMode` — Presentation mode of the swap chain. Fifo is the only mode guaranteed to be supported. `FifoRelaxed`, `Immediate`, and `Mailbox` will crash if unsupported, while `AutoVsync` and `…
- `desired_maximum_frame_latency: u32` — Desired maximum number of monitor refreshes between a [`Surface::get_current_texture`] call and the texture being presented to the screen. This is sometimes called "Frames in Flig…
- `alpha_mode: CompositeAlphaMode` — Specifies how the alpha channel of the textures should be handled during compositing.
- `view_formats: V` — Specifies what view formats will be allowed when calling `Texture::create_view` on the texture returned by `Surface::get_current_texture`.

Methods and constants:
- `fn map_view_formats<'a, M>(self: &'a Self, fun: impl FnOnce(&'a V) -> M) -> SurfaceConfiguration<M>` — Map `view_formats` of the texture descriptor into another.

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SurfaceFormatCapabilities — struct

A texture format supported by a surface, together with the color spaces in which the surface can present it.

Fields:
- `format: TextureFormat` — The texture format.
- `color_spaces: SurfaceColorSpaces` — The set of color spaces the surface supports for this format.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### SurfaceStatus — enum

Status of the received surface image.

Variants (7):
- `Good` — No issues.
- `Suboptimal` — The swap chain is operational, but it does no longer perfectly match the surface. A re-configuration is needed.
- `Timeout` — Unable to get the next frame, timed out.
- `Occluded` — The window is occluded (e.g. minimized or behind another window).
- `Outdated` — The surface under the swap chain has changed.
- `Lost` — The surface under the swap chain is lost.
- `Validation` — `Surface::get_current_texture` has hit a validation error which was caught by a error scope.

Implements: `Debug`

### SurfaceTarget`<'window>` — enum _[non_exhaustive]_

The window/canvas/surface/swap-chain/etc. a surface is attached to, for use with safe surface creation.

Variants (2):
- `DisplayAndWindow(alloc::boxed::Box<dyn DisplayAndWindowHandle + 'window>)` — Window and display handle producer.
- `Window(alloc::boxed::Box<dyn WindowHandle + 'window>)` — Window handle producer.

Methods and constants:
- `fn from_window_without_display(window: impl WindowHandle + 'a) -> Self` — Constructor for [`Self::Window`] without consuming a display handle

Implements: `Debug`, `From<T>`

### SurfaceTargetUnsafe — enum _[non_exhaustive]_

The window/canvas/surface/swap-chain/etc. a surface is attached to, for use with unsafe surface creation.

Variants (1):
- `RawHandle { raw_display_handle: Option<raw_window_handle::RawDisplayHandle>, raw_window_handle: raw_window_handle::RawWindowHandle }` — Raw window & display handle.

Methods and constants:
- `unsafe fn from_display_and_window(display: &impl HasDisplayHandle, window: &impl HasWindowHandle) -> Result<Self, raw_window_handle::HandleError>` — Creates a [`SurfaceTargetUnsafe::RawHandle`] from a display and window.
- `unsafe fn from_window(window: &impl HasWindowHandle) -> Result<Self, raw_window_handle::HandleError>` — Creates a [`SurfaceTargetUnsafe::RawHandle`] from a window.

Implements: `Debug`

### SurfaceTexture — struct

Surface texture that can be rendered to. Result of a successful call to [`Surface::get_current_texture`].

Fields:
- `texture: Texture` — Accessible view of the frame.
- (private fields omitted)

Implements: `Clone`, `Debug`, `Drop`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`

### WindowHandle — trait

[`Send`]/[`Sync`] blanket trait for [`HasWindowHandle`] used in [`SurfaceTarget`].
