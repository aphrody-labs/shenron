# wgpu 30.0.1 API map — Render state: primitive, blend, depth/stencil, multisample

> Generated 2026-10-05 by `scripts/build-references.ts` from the rustdoc JSON (format 61) of `wgpu` 30.0.1 and `wgpu-types` 30.0.1. Do not edit: regenerate (see ../../SKILL.md). 26 public items.

### BlendComponent — struct

Describes a blend component of a [`BlendState`].

Fields:
- `src_factor: BlendFactor` — Multiplier for the source, which is produced by the fragment shader.
- `dst_factor: BlendFactor` — Multiplier for the destination, which is stored in the target.
- `operation: BlendOperation` — The binary operation applied to the source and destination, multiplied by their respective factors.

Methods and constants:
- `const REPLACE: Self` — Default blending state that replaces destination with the source.
- `const OVER: Self` — Blend state of `(1 * src) + ((1 - src_alpha) * dst)`.
- `fn uses_constant(&self) -> bool` — Returns true if the state relies on the constant color, which is set independently on a render command encoder. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BlendFactor — enum

Alpha blend factor.

Variants (17):
- `Zero = 0` — 0.0
- `One = 1` — 1.0
- `Src = 2` — S.component
- `OneMinusSrc = 3` — 1.0 - S.component
- `SrcAlpha = 4` — S.alpha
- `OneMinusSrcAlpha = 5` — 1.0 - S.alpha
- `Dst = 6` — D.component
- `OneMinusDst = 7` — 1.0 - D.component
- `DstAlpha = 8` — D.alpha
- `OneMinusDstAlpha = 9` — 1.0 - D.alpha
- `SrcAlphaSaturated = 10` — min(S.alpha, 1.0 - D.alpha)
- `Constant = 11` — Constant
- `OneMinusConstant = 12` — 1.0 - Constant
- `Src1 = 13` — S1.component
- `OneMinusSrc1 = 14` — 1.0 - S1.component
- `Src1Alpha = 15` — S1.alpha
- `OneMinusSrc1Alpha = 16` — 1.0 - S1.alpha

Methods and constants:
- `fn ref_second_blend_source(&self) -> bool` — Returns `true` if the blend factor references the second blend source. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BlendOperation — enum

Alpha blend operation.

Variants (5):
- `Add = 0` — Src + Dst
- `Subtract = 1` — Src - Dst
- `ReverseSubtract = 2` — Dst - Src
- `Min = 3` — min(Src, Dst)
- `Max = 4` — max(Src, Dst)

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### BlendState — struct

Describe the blend state of a render pipeline, within [`ColorTargetState`].

Fields:
- `color: BlendComponent` — Color equation.
- `alpha: BlendComponent` — Alpha equation.

Methods and constants:
- `const REPLACE: Self` — Blend mode that does no color blending, just overwrites the output with the contents of the shader.
- `const ALPHA_BLENDING: Self` — Blend mode that does standard alpha blending with non-premultiplied alpha.
- `const PREMULTIPLIED_ALPHA_BLENDING: Self` — Blend mode that does standard alpha blending with premultiplied alpha.
- `const ADDITIVE: Self` — Blend mode that does standard additive blending.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ColorTargetState — struct

Describes the color state of a render pipeline.

Fields:
- `format: TextureFormat` — The [`TextureFormat`] of the image that this pipeline will render to. Must match the format of the corresponding color attachment in [`CommandEncoder::begin_render_pass`][CEbrp]
- `blend: Option<BlendState>` — The blending that is used for this pipeline.
- `write_mask: ColorWrites` — Mask which enables/disables writes to different color/alpha channel.

Implements: `Clone`, `Debug`, `Eq`, `From<TextureFormat>`, `Hash`, `PartialEq`, `StructuralPartialEq`

### ColorWrites — struct

Color write mask. Disabled color channels will not be written to.

Opaque (private fields).

Methods and constants:
- `const RED: Self` — Enable red channel writes
- `const GREEN: Self` — Enable green channel writes
- `const BLUE: Self` — Enable blue channel writes
- `const ALPHA: Self` — Enable alpha channel writes
- `const COLOR: Self` — Enable red, green, and blue channel writes
- `const ALL: Self` — Enable writes to all channels.
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
- `const fn iter(&self) -> $crate::iter::Iter<ColorWrites>` — Yield a set of contained flags values.
- `const fn iter_names(&self) -> $crate::iter::IterNames<ColorWrites>` — Yield a set of contained named flags values.

Implements: `Binary`, `BitAnd`, `BitAndAssign`, `BitOr`, `BitOrAssign`, `BitXor`, `BitXorAssign`, `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Extend<ColorWrites>`, `Flags`, `FromIterator<ColorWrites>`, `Hash`, `IntoIterator`, `LowerHex`, `Not`, `Octal`, `PartialEq`, `StructuralPartialEq`, `Sub`, `SubAssign`, `UpperHex`

### CompareFunction — enum

Comparison function used for depth and stencil operations.

Variants (8):
- `Never = 1` — Function never passes
- `Less = 2` — Function passes if new value less than existing value
- `Equal = 3` — Function passes if new value is equal to existing value. When using this compare function, make sure to mark your Vertex Shader's `@builtin(position)` output as `@invariant` to prevent artifacting.
- `LessEqual = 4` — Function passes if new value is less than or equal to existing value
- `Greater = 5` — Function passes if new value is greater than existing value
- `NotEqual = 6` — Function passes if new value is not equal to existing value. When using this compare function, make sure to mark your Vertex Shader's `@builtin(position)` output as `@invariant` to prevent artifactin…
- `GreaterEqual = 7` — Function passes if new value is greater than or equal to existing value
- `Always = 8` — Function always passes

Methods and constants:
- `fn needs_ref_value(self) -> bool` — Returns true if the comparison depends on the reference value. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### DepthBiasState — struct

Describes the biasing setting for the depth target.

Fields:
- `constant: i32` — Constant depth biasing factor, in basic units of the depth format.
- `slope_scale: f32` — Slope depth biasing factor.
- `clamp: f32` — Depth bias clamp value (absolute).

Methods and constants:
- `fn is_enabled(&self) -> bool` — Returns true if the depth biasing is enabled. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`

### DepthStencilState — struct

Describes the depth/stencil state in a render pipeline.

Fields:
- `format: TextureFormat` — Format of the depth/stencil buffer, must be special depth format. Must match the format of the depth/stencil attachment in [`CommandEncoder::begin_render_pass`][CEbrp].
- `depth_write_enabled: Option<bool>` — Whether to write updated depth values to the depth attachment.
- `depth_compare: Option<CompareFunction>` — Comparison function used to compare depth values in the depth test.
- `stencil: StencilState` — Stencil state.
- `bias: DepthBiasState` — Depth bias state.

Methods and constants:
- `fn stencil(format: TextureFormat, stencil: StencilState) -> DepthStencilState` — Construct `DepthStencilState` for a stencil operation with no depth operation.
- `fn is_depth_enabled(&self) -> bool` — Returns true if the depth testing is enabled. _[must_use]_
- `fn is_depth_read_only(&self) -> bool` — Returns true if the state doesn't mutate the depth buffer. _[must_use]_
- `fn is_stencil_read_only(&self, cull_mode: Option<Face>) -> bool` — Returns true if the state doesn't mutate the stencil. _[must_use]_
- `fn is_read_only(&self, cull_mode: Option<Face>) -> bool` — Returns true if the state doesn't mutate either depth or stencil of the target. _[must_use]_

Implements: `Clone`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### DispatchIndirectArgs — struct

Argument buffer layout for `dispatch_workgroups_indirect` commands.

Fields:
- `x: u32` — The number of work groups in X dimension.
- `y: u32` — The number of work groups in Y dimension.
- `z: u32` — The number of work groups in Z dimension.

Methods and constants:
- `fn as_bytes(&self) -> &[u8]` — Returns the bytes representation of the struct, ready to be written into a buffer. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Pod`, `Zeroable`

### DrawIndexedIndirectArgs — struct

Argument buffer layout for `draw_indexed_indirect` commands.

Fields:
- `index_count: u32` — The number of indices to draw.
- `instance_count: u32` — The number of instances to draw.
- `first_index: u32` — The first index within the index buffer.
- `base_vertex: i32` — The value added to the vertex index before indexing into the vertex buffer.
- `first_instance: u32` — The instance ID of the first instance to draw.

Methods and constants:
- `fn as_bytes(&self) -> &[u8]` — Returns the bytes representation of the struct, ready to be written in a buffer. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Pod`, `Zeroable`

### DrawIndirectArgs — struct

Argument buffer layout for `draw_indirect` commands.

Fields:
- `vertex_count: u32` — The number of vertices to draw.
- `instance_count: u32` — The number of instances to draw.
- `first_vertex: u32` — The Index of the first vertex to draw.
- `first_instance: u32` — The instance ID of the first instance to draw.

Methods and constants:
- `fn as_bytes(&self) -> &[u8]` — Returns the bytes representation of the struct, ready to be written in a buffer. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Pod`, `Zeroable`

### Face — enum

Face of a vertex.

Variants (2):
- `Front = 0` — Front face
- `Back = 1` — Back face

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### FrontFace — enum

Vertex winding order which classifies the "front" face of a triangle.

Variants (2):
- `Ccw = 0` — Triangles with vertices in counter clockwise order are considered the front face.
- `Cw = 1` — Triangles with vertices in clockwise order are considered the front face.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### IndexFormat — enum

Format of indices used with pipeline.

Variants (2):
- `Uint16 = 0` — Indices are 16 bit unsigned integers.
- `Uint32 = 1` — Indices are 32 bit unsigned integers.

Methods and constants:
- `fn byte_size(&self) -> u32` — Returns the size in bytes of the index format

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### LoadOp`<V>` — enum

Operation to perform to the output attachment at the start of a render pass.

Variants (3):
- `Clear(V) = 0` — Loads the specified value for this attachment into the render pass.
- `Load = 1` — Loads the existing value for this attachment into the render pass.
- `DontCare(LoadOpDontCare) = 2` — The render target has undefined contents at the start of the render pass. This may lead to undefined behavior if you read from the any of the render target pixels without first writing to them.

Methods and constants:
- `fn eq_variant<T>(&self, other: LoadOp<T>) -> bool` — Returns true if variants are same (ignoring clear value)

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### MultisampleState — struct

Describes the multi-sampling state of a render pipeline.

Fields:
- `count: u32` — The number of samples calculated per pixel (for MSAA). For non-multisampled textures, this should be `1`
- `mask: u64` — Bitmask that restricts the samples of a pixel modified by this pipeline. All samples can be enabled using the value `!0`
- `alpha_to_coverage_enabled: bool` — When enabled, produces another sample mask per pixel based on the alpha output value, that is ANDed with the sample mask and the primitive coverage to restrict the set of samples…

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### Operations`<V>` — struct

Pair of load and store operations for an attachment aspect.

Fields:
- `load: LoadOp<V>` — How data should be read through this attachment.
- `store: StoreOp` — Whether data will be written to through this attachment.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### PolygonMode — enum

Type of drawing mode for polygons

Variants (3):
- `Fill = 0` — Polygons are filled
- `Line = 1` — Polygons are drawn as line segments
- `Point = 2` — Polygons are drawn as points

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### PrimitiveState — struct

Describes the state of primitive assembly and rasterization in a render pipeline.

Fields:
- `topology: PrimitiveTopology` — The primitive topology used to interpret vertices.
- `strip_index_format: Option<IndexFormat>` — When drawing strip topologies with indices, this is the required format for the index buffer. This has no effect on non-indexed or non-strip draws.
- `front_face: FrontFace` — The face to consider the front for the purpose of culling and stencil operations.
- `cull_mode: Option<Face>` — The face culling mode.
- `unclipped_depth: bool` — If set to true, the polygon depth is not clipped to 0-1 before rasterization.
- `polygon_mode: PolygonMode` — Controls the way each polygon is rasterized. Can be either `Fill` (default), `Line` or `Point`
- `conservative: bool` — If set to true, the primitives are rendered with conservative overestimation. I.e. any rastered pixel touched by it is filled. Only valid for `[PolygonMode::Fill`]!

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### PrimitiveTopology — enum

Primitive type the input mesh is composed of.

Variants (5):
- `PointList = 0` — Vertex data is a list of points. Each vertex is a new point.
- `LineList = 1` — Vertex data is a list of lines. Each pair of vertices composes a new line.
- `LineStrip = 2` — Vertex data is a strip of lines. Each set of two adjacent vertices form a line.
- `TriangleList = 3` — Vertex data is a list of triangles. Each set of 3 vertices composes a new triangle.
- `TriangleStrip = 4` — Vertex data is a triangle strip. Each set of three adjacent vertices form a triangle.

Methods and constants:
- `fn is_strip(&self) -> bool` — Returns true for strip topologies. _[must_use]_
- `fn is_triangles(&self) -> bool` — Returns true for triangle topologies. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### RenderBundleDepthStencil — struct

Describes the depth/stencil attachment for render bundles.

Fields:
- `format: TextureFormat` — Format of the attachment.
- `depth_read_only: bool` — If the depth aspect of the depth stencil attachment is going to be written to.
- `stencil_read_only: bool` — If the stencil aspect of the depth stencil attachment is going to be written to.

Implements: `Clone`, `Copy`, `Debug`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### StencilFaceState — struct

Describes stencil state in a render pipeline.

Fields:
- `compare: CompareFunction` — Comparison function that determines if the fail_op or pass_op is used on the stencil buffer.
- `fail_op: StencilOperation` — Operation that is performed when stencil test fails.
- `depth_fail_op: StencilOperation` — Operation that is performed when depth test fails but stencil test succeeds.
- `pass_op: StencilOperation` — Operation that is performed when stencil test success.

Methods and constants:
- `const IGNORE: Self` — Ignore the stencil state for the face.
- `fn needs_ref_value(&self) -> bool` — Returns true if the face state uses the reference value for testing or operation. _[must_use]_
- `fn is_read_only(&self) -> bool` — Returns true if the face state doesn't mutate the target values. _[must_use]_

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### StencilOperation — enum

Operation to perform on the stencil value.

Variants (8):
- `Keep = 0` — Keep stencil value unchanged.
- `Zero = 1` — Set stencil value to zero.
- `Replace = 2` — Replace stencil value with value provided in most recent call to [`RenderPass::set_stencil_reference`][RPssr].
- `Invert = 3` — Bitwise inverts stencil value.
- `IncrementClamp = 4` — Increments stencil value by one, clamping on overflow.
- `DecrementClamp = 5` — Decrements stencil value by one, clamping on underflow.
- `IncrementWrap = 6` — Increments stencil value by one, wrapping on overflow.
- `DecrementWrap = 7` — Decrements stencil value by one, wrapping on underflow.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### StencilState — struct

State of the stencil operation (fixed-pipeline stage).

Fields:
- `front: StencilFaceState` — Front face mode.
- `back: StencilFaceState` — Back face mode.
- `read_mask: u32` — Stencil values are AND'd with this mask when reading and writing from the stencil buffer. Only low 8 bits are used.
- `write_mask: u32` — Stencil values are AND'd with this mask when writing to the stencil buffer. Only low 8 bits are used.

Methods and constants:
- `fn is_enabled(&self) -> bool` — Returns true if the stencil test is enabled. _[must_use]_
- `fn is_read_only(&self, cull_mode: Option<Face>) -> bool` — Returns true if the state doesn't mutate the target values. _[must_use]_
- `fn needs_ref_value(&self) -> bool` — Returns true if the stencil state uses the reference value for testing. _[must_use]_

Implements: `Clone`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`

### StoreOp — enum

Operation to perform to the output attachment at the end of a render pass.

Variants (2):
- `Store = 0` — Stores the resulting value of the render pass for this attachment.
- `Discard = 1` — Discards the resulting value of the render pass for this attachment.

Implements: `Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`, `PartialEq`, `StructuralPartialEq`
