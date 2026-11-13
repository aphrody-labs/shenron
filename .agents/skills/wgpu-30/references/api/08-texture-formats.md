# wgpu 30.0.1 API map — Texture formats

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 6 public items.

### AstcBlock — enum

ASTC block dimensions

Variants (14):

- `B4x4` — 4x4 block compressed texture. 16 bytes per block (8 bit/px).
- `B5x4` — 5x4 block compressed texture. 16 bytes per block (6.4 bit/px).
- `B5x5` — 5x5 block compressed texture. 16 bytes per block (5.12 bit/px).
- `B6x5` — 6x5 block compressed texture. 16 bytes per block (4.27 bit/px).
- `B6x6` — 6x6 block compressed texture. 16 bytes per block (3.56 bit/px).
- `B8x5` — 8x5 block compressed texture. 16 bytes per block (3.2 bit/px).
- `B8x6` — 8x6 block compressed texture. 16 bytes per block (2.67 bit/px).
- `B8x8` — 8x8 block compressed texture. 16 bytes per block (2 bit/px).
- `B10x5` — 10x5 block compressed texture. 16 bytes per block (2.56 bit/px).
- `B10x6` — 10x6 block compressed texture. 16 bytes per block (2.13 bit/px).
- `B10x8` — 10x8 block compressed texture. 16 bytes per block (1.6 bit/px).
- `B10x10` — 10x10 block compressed texture. 16 bytes per block (1.28 bit/px).
- `B12x10` — 12x10 block compressed texture. 16 bytes per block (1.07 bit/px).
- `B12x12` — 12x12 block compressed texture. 16 bytes per block (0.89 bit/px).

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### AstcChannel — enum

ASTC RGBA channel

Variants (3):

- `Unorm` — 8 bit integer RGBA, [0, 255] converted to/from linear-color float [0, 1] in shader.
- `UnormSrgb` — 8 bit integer RGBA, Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `Hdr` — floating-point RGBA, linear-color float can be outside of the [0, 1] range.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureChannel — struct

Represents the different format channels of a texture format.

Opaque (private fields).

Methods and constants:

- `const RED: Self` — Texture format contains a `red` channel.
- `const GREEN: Self` — Texture format contains a `green` channel.
- `const BLUE: Self` — Texture format contains a `blue` channel.
- `const ALPHA: Self` — Texture format contains an `alpha` channel.
- `const STENCIL: Self` — Texture format contains a `stencil` channel.
- `const DEPTH: Self` — Texture format contains a `depth` channel.
- `const LUMINANCE: Self` — Texture format contains a `luminance` channel.
- `const CHROMINANCE_BLUE: Self` — Texture format contains a `blue-difference` channel.
- `const CHROMINANCE_RED: Self` — Texture format contains a `red-difference` channel.
- `const RG: Self` — Texture format contains channels for `red` and `green`.
- `const RGB: Self` — Texture format contains channels for `red`, `green` and `blue`.
- `const RGBA: Self` — Texture format contains channels for `red`, `green`, `blue` and `alpha`.
- `const DEPTH_STENCIL: Self` — Texture format contains channels for `depth` and `stencil`.
- `const LUMINANCE_CHROMINANCE: Self` — Texture format contains a `luminance` (`Y`), `blue-difference` (`Cb`) and `red-difference` (`Cr`) channel.
- `const fn empty() -> Self` — Get a flags value with all bits unset.
- `const fn all() -> Self` — Get a flags value with all known bits set.
- `const fn bits(&self) -> u16` — Get the underlying bits value.
- `const fn from_bits(bits: u16) -> $crate::__private::core::option::Option<Self>` — Convert from a bits value.
- `const fn from_bits_truncate(bits: u16) -> Self` — Convert from a bits value, unsetting any unknown bits.
- `const fn from_bits_retain(bits: u16) -> Self` — Convert from a bits value exactly.
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
- `const fn iter(&self) -> $crate::iter::Iter<TextureChannel>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<TextureChannel>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<TextureChannel>`, `Flags`, `FromIterator<TextureChannel>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `Ord`, `PartialEq`, `PartialOrd`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### TextureFormat — enum

Format in which a texture’s texels are stored in GPU memory.

Variants (77):

- `R8Unorm` — Red channel only. 8 bit integer per channel. [0, 255] converted to/from float [0, 1] in shader.
- `R8Snorm` — Red channel only. 8 bit integer per channel. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `R8Uint` — Red channel only. 8 bit integer per channel. Unsigned in shader.
- `R8Sint` — Red channel only. 8 bit integer per channel. Signed in shader.
- `R16Uint` — Red channel only. 16 bit integer per channel. Unsigned in shader.
- `R16Sint` — Red channel only. 16 bit integer per channel. Signed in shader.
- `R16Unorm` — Red channel only. 16 bit integer per channel. [0, 65535] converted to/from float [0, 1] in shader.
- `R16Snorm` — Red channel only. 16 bit integer per channel. [&minus;32767, 32767] converted to/from float [&minus;1, 1] in shader.
- `R16Float` — Red channel only. 16 bit float per channel. Float in shader.
- `Rg8Unorm` — Red and green channels. 8 bit integer per channel. [0, 255] converted to/from float [0, 1] in shader.
- `Rg8Snorm` — Red and green channels. 8 bit integer per channel. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `Rg8Uint` — Red and green channels. 8 bit integer per channel. Unsigned in shader.
- `Rg8Sint` — Red and green channels. 8 bit integer per channel. Signed in shader.
- `R32Uint` — Red channel only. 32 bit integer per channel. Unsigned in shader.
- `R32Sint` — Red channel only. 32 bit integer per channel. Signed in shader.
- `R32Float` — Red channel only. 32 bit float per channel. Float in shader.
- `Rg16Uint` — Red and green channels. 16 bit integer per channel. Unsigned in shader.
- `Rg16Sint` — Red and green channels. 16 bit integer per channel. Signed in shader.
- `Rg16Unorm` — Red and green channels. 16 bit integer per channel. [0, 65535] converted to/from float [0, 1] in shader.
- `Rg16Snorm` — Red and green channels. 16 bit integer per channel. [&minus;32767, 32767] converted to/from float [&minus;1, 1] in shader.
- `Rg16Float` — Red and green channels. 16 bit float per channel. Float in shader.
- `Rgba8Unorm` — Red, green, blue, and alpha channels. 8 bit integer per channel. [0, 255] converted to/from float [0, 1] in shader.
- `Rgba8UnormSrgb` — Red, green, blue, and alpha channels. 8 bit integer per channel. Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `Rgba8Snorm` — Red, green, blue, and alpha channels. 8 bit integer per channel. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `Rgba8Uint` — Red, green, blue, and alpha channels. 8 bit integer per channel. Unsigned in shader.
- `Rgba8Sint` — Red, green, blue, and alpha channels. 8 bit integer per channel. Signed in shader.
- `Bgra8Unorm` — Blue, green, red, and alpha channels. 8 bit integer per channel. [0, 255] converted to/from float [0, 1] in shader.
- `Bgra8UnormSrgb` — Blue, green, red, and alpha channels. 8 bit integer per channel. Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `Rgb9e5Ufloat` — Packed unsigned float with 9 bits mantisa for each RGB component, then a common 5 bits exponent
- `Rgb10a2Uint` — Red, green, blue, and alpha channels. 10 bit integer for RGB channels, 2 bit integer for alpha channel. Unsigned in shader.
- `Rgb10a2Unorm` — Red, green, blue, and alpha channels. 10 bit integer for RGB channels, 2 bit integer for alpha channel. [0, 1023] ([0, 3] for alpha) converted to/from float [0, 1] in shader.
- `Rg11b10Ufloat` — Red, green, and blue channels. 11 bit float with no sign bit for RG channels. 10 bit float with no sign bit for blue channel. Float in shader.
- `R64Uint` — Red channel only. 64 bit integer per channel. Unsigned in shader.
- `Rg32Uint` — Red and green channels. 32 bit integer per channel. Unsigned in shader.
- `Rg32Sint` — Red and green channels. 32 bit integer per channel. Signed in shader.
- `Rg32Float` — Red and green channels. 32 bit float per channel. Float in shader.
- `Rgba16Uint` — Red, green, blue, and alpha channels. 16 bit integer per channel. Unsigned in shader.
- `Rgba16Sint` — Red, green, blue, and alpha channels. 16 bit integer per channel. Signed in shader.
- `Rgba16Unorm` — Red, green, blue, and alpha channels. 16 bit integer per channel. [0, 65535] converted to/from float [0, 1] in shader.
- `Rgba16Snorm` — Red, green, blue, and alpha. 16 bit integer per channel. [&minus;32767, 32767] converted to/from float [&minus;1, 1] in shader.
- `Rgba16Float` — Red, green, blue, and alpha channels. 16 bit float per channel. Float in shader.
- `Rgba32Uint` — Red, green, blue, and alpha channels. 32 bit integer per channel. Unsigned in shader.
- `Rgba32Sint` — Red, green, blue, and alpha channels. 32 bit integer per channel. Signed in shader.
- `Rgba32Float` — Red, green, blue, and alpha channels. 32 bit float per channel. Float in shader.
- `Stencil8` — Stencil format with 8 bit integer stencil.
- `Depth16Unorm` — Special depth format with 16 bit integer depth.
- `Depth24Plus` — Special depth format with at least 24 bit integer depth.
- `Depth24PlusStencil8` — Special depth/stencil format with at least 24 bit integer depth and 8 bits integer stencil.
- `Depth32Float` — Special depth format with 32 bit floating point depth.
- `Depth32FloatStencil8` — Special depth/stencil format with 32 bit floating point depth and 8 bits integer stencil.
- `NV12` — YUV 4:2:0 chroma subsampled format.
- `P010` — YUV 4:2:0 chroma subsampled format.
- `Bc1RgbaUnorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). 4 color + alpha pallet. 5 bit R + 6 bit G + 5 bit B + 1 bit alpha. [0, 63] ([0, 1] for alpha) converted to/from float [0, 1] in shader.
- `Bc1RgbaUnormSrgb` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). 4 color + alpha pallet. 5 bit R + 6 bit G + 5 bit B + 1 bit alpha. Srgb-color [0, 63] ([0, 1] for alpha) converted to/from linear-color flo…
- `Bc2RgbaUnorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 4 color pallet. 5 bit R + 6 bit G + 5 bit B + 4 bit alpha. [0, 63] ([0, 15] for alpha) converted to/from float [0, 1] in shader.
- `Bc2RgbaUnormSrgb` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 4 color pallet. 5 bit R + 6 bit G + 5 bit B + 4 bit alpha. Srgb-color [0, 63] ([0, 255] for alpha) converted to/from linear-color float [0…
- `Bc3RgbaUnorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 4 color pallet + 8 alpha pallet. 5 bit R + 6 bit G + 5 bit B + 8 bit alpha. [0, 63] ([0, 255] for alpha) converted to/from float [0, 1] in…
- `Bc3RgbaUnormSrgb` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 4 color pallet + 8 alpha pallet. 5 bit R + 6 bit G + 5 bit B + 8 bit alpha. Srgb-color [0, 63] ([0, 255] for alpha) converted to/from line…
- `Bc4RUnorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). 8 color pallet. 8 bit R. [0, 255] converted to/from float [0, 1] in shader.
- `Bc4RSnorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). 8 color pallet. 8 bit R. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `Bc5RgUnorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 8 color red pallet + 8 color green pallet. 8 bit RG. [0, 255] converted to/from float [0, 1] in shader.
- `Bc5RgSnorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). 8 color red pallet + 8 color green pallet. 8 bit RG. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `Bc6hRgbUfloat` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Variable sized pallet. 16 bit unsigned float RGB. Float in shader.
- `Bc6hRgbFloat` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Variable sized pallet. 16 bit signed float RGB. Float in shader.
- `Bc7RgbaUnorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Variable sized pallet. 8 bit integer RGBA. [0, 255] converted to/from float [0, 1] in shader.
- `Bc7RgbaUnormSrgb` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Variable sized pallet. 8 bit integer RGBA. Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `Etc2Rgb8Unorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 8 bit integer RGB. [0, 255] converted to/from float [0, 1] in shader.
- `Etc2Rgb8UnormSrgb` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 8 bit integer RGB. Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `Etc2Rgb8A1Unorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 8 bit integer RGB + 1 bit alpha. [0, 255] ([0, 1] for alpha) converted to/from float [0, 1] in shader.
- `Etc2Rgb8A1UnormSrgb` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 8 bit integer RGB + 1 bit alpha. Srgb-color [0, 255] ([0, 1] for alpha) converted to/from linear-color float [0, 1] in shad…
- `Etc2Rgba8Unorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Complex pallet. 8 bit integer RGB + 8 bit alpha. [0, 255] converted to/from float [0, 1] in shader.
- `Etc2Rgba8UnormSrgb` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Complex pallet. 8 bit integer RGB + 8 bit alpha. Srgb-color [0, 255] converted to/from linear-color float [0, 1] in shader.
- `EacR11Unorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 11 bit integer R. [0, 255] converted to/from float [0, 1] in shader.
- `EacR11Snorm` — 4x4 block compressed texture. 8 bytes per block (4 bit/px). Complex pallet. 11 bit integer R. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `EacRg11Unorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Complex pallet. 11 bit integer R + 11 bit integer G. [0, 255] converted to/from float [0, 1] in shader.
- `EacRg11Snorm` — 4x4 block compressed texture. 16 bytes per block (8 bit/px). Complex pallet. 11 bit integer R + 11 bit integer G. [&minus;127, 127] converted to/from float [&minus;1, 1] in shader.
- `Astc { block: AstcBlock, channel: AstcChannel }` — block compressed texture. 16 bytes per block.

Methods and constants:

- `fn aspect_specific_format(&self, aspect: TextureAspect) -> Option<Self>` — Returns the aspect-specific format of the original format _[must_use]_
- `fn is_depth_stencil_component(&self, combined_format: Self) -> bool` — Returns `true` if `self` is a depth or stencil component of the given combined depth-stencil format _[must_use]_
- `fn is_depth_stencil_format(&self) -> bool` — Returns `true` if the format is a depth and/or stencil format _[must_use]_
- `fn is_combined_depth_stencil_format(&self) -> bool` — Returns `true` if the format is a combined depth-stencil format _[must_use]_
- `fn is_multi_planar_format(&self) -> bool` — Returns `true` if the format is a multi-planar format _[must_use]_
- `fn planes(&self) -> Option<u32>` — Returns the number of planes a multi-planar format has. _[must_use]_
- `fn subsampling_factors(&self, plane: Option<u32>) -> (u32, u32)` — Returns the subsampling factor for the indicated plane of a multi-planar format. _[must_use]_
- `fn channels(&self) -> TextureChannel` — Returns a [TextureChannel] with the bits set where the texture format contains the respective channels. _[must_use]_
- `fn has_color_aspect(&self) -> bool` — Returns `true` if the format has a color aspect _[must_use]_
- `fn has_depth_aspect(&self) -> bool` — Returns `true` if the format has a depth aspect _[must_use]_
- `fn has_stencil_aspect(&self) -> bool` — Returns `true` if the format has a stencil aspect _[must_use]_
- `fn size_multiple_requirement(&self) -> (u32, u32)` — Returns the size multiple requirement for a texture using this format. _[must_use]_
- `fn block_dimensions(&self) -> (u32, u32)` — Returns the dimension of a [block](https://gpuweb.github.io/gpuweb/#texel-block) of texels. _[must_use]_
- `fn is_compressed(&self) -> bool` — Returns `true` for compressed formats. _[must_use]_
- `fn is_bcn(&self) -> bool` — Returns `true` for BCn compressed formats. _[must_use]_
- `fn is_astc(&self) -> bool` — Returns `true` for ASTC compressed formats. _[must_use]_
- `fn required_features(&self) -> Features` — Returns the required features (if any) in order to use the texture. _[must_use]_
- `fn guaranteed_format_features(&self, device_features: Features) -> TextureFormatFeatures` — Returns the format features guaranteed by the WebGPU spec. _[must_use]_
- `fn sample_type(&self, aspect: Option<TextureAspect>, device_features: Option<Features>) -> Option<TextureSampleType>` — Returns the sample type compatible with this format and aspect. _[must_use]_
- `fn block_size(&self, aspect: Option<TextureAspect>) -> Option<u32>` — The number of bytes one [texel block](https://gpuweb.github.io/gpuweb/#texel-block) occupies during an image copy, if applicable. _[must_use; deprecated: Use `block_copy_size` instead.]_
- `fn block_copy_size(&self, aspect: Option<TextureAspect>) -> Option<u32>` — The number of bytes one [texel block](https://gpuweb.github.io/gpuweb/#texel-block) occupies during an image copy, if applicable. _[must_use]_
- `const MAX_TARGET_PIXEL_BYTE_COST: u32` — The largest number that can be returned by [`Self::target_pixel_byte_cost`].
- `fn target_pixel_byte_cost(&self) -> Option<u32>` — The number of bytes occupied per pixel in a color attachment <https://gpuweb.github.io/gpuweb/#render-target-pixel-byte-cost> _[must_use]_
- `fn target_component_alignment(&self) -> Option<u32>` — See <https://gpuweb.github.io/gpuweb/#render-target-component-alignment> _[must_use]_
- `fn components(&self) -> u8` — Returns the number of components this format has. _[must_use]_
- `fn components_with_aspect(&self, aspect: TextureAspect) -> u8` — Returns the number of components this format has taking into account the `aspect`. _[must_use]_
- `fn remove_srgb_suffix(&self) -> TextureFormat` — Strips the `Srgb` suffix from the given texture format. _[must_use]_
- `fn add_srgb_suffix(&self) -> TextureFormat` — Adds an `Srgb` suffix to the given texture format, if the format supports it. _[must_use]_
- `fn is_srgb(&self) -> bool` — Returns `true` for srgb formats. _[must_use]_
- `fn theoretical_memory_footprint(&self, size: Extent3d) -> u64` — Returns the theoretical memory footprint of a texture with the given format and dimensions. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `From<TextureFormat>`, `Hash`, `PartialEq`, `StructuralPartialEq`

### TextureFormatFeatureFlags — struct

Feature flags for a texture format.

Opaque (private fields).

Methods and constants:

- `const FILTERABLE: Self` — If not present, the texture can't be sampled with a filtering sampler. This may overwrite TextureSampleType::Float.filterable
- `const MULTISAMPLE_X2: Self` — Allows [`TextureDescriptor::sample_count`] to be `2`.
- `const MULTISAMPLE_X4: Self` — Allows [`TextureDescriptor::sample_count`] to be `4`.
- `const MULTISAMPLE_X8: Self` — Allows [`TextureDescriptor::sample_count`] to be `8`.
- `const MULTISAMPLE_X16: Self` — Allows [`TextureDescriptor::sample_count`] to be `16`.
- `const MULTISAMPLE_RESOLVE: Self` — Allows a texture of this format to back a view passed as `resolve_target` to a render pass for an automatic driver-implemented resolve.
- `const STORAGE_READ_ONLY: Self` — When used as a STORAGE texture, then a texture with this format can be bound with [`StorageTextureAccess::ReadOnly`].
- `const STORAGE_WRITE_ONLY: Self` — When used as a STORAGE texture, then a texture with this format can be bound with [`StorageTextureAccess::WriteOnly`].
- `const STORAGE_READ_WRITE: Self` — When used as a STORAGE texture, then a texture with this format can be bound with [`StorageTextureAccess::ReadWrite`].
- `const STORAGE_ATOMIC: Self` — When used as a STORAGE texture, then a texture with this format can be bound with [`StorageTextureAccess::Atomic`].
- `const BLENDABLE: Self` — If not present, the texture can't be blended into the render target.
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
- `const fn iter(&self) -> $crate::iter::Iter<TextureFormatFeatureFlags>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<TextureFormatFeatureFlags>` — Yield a set of contained named flags values.
- `fn sample_count_supported(&self, count: u32) -> bool` — Sample count supported by a given texture format. _[must_use]_
- `fn supported_sample_counts(&self) -> Vec<u32>` — A `Vec` of supported sample counts. _[must_use]_

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Eq`, `Extend<TextureFormatFeatureFlags>`, `Flags`, `FromIterator<TextureFormatFeatureFlags>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `PublicFlags`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### TextureFormatFeatures — struct

Features supported by a given texture format

Fields:

- `allowed_usages: TextureUsages` — Valid bits for `TextureDescriptor::Usage` provided for format creation.
- `flags: TextureFormatFeatureFlags` — Additional property flags for the format.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`
