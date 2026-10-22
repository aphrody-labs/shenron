/* tslint:disable */
/* eslint-disable */

/**
 * WebAssembly wrapper around the 2D vector canvas.
 */
export class CanvasEngineWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Clears the canvas with an RGBA color.
     */
    clear(r: number, g: number, b: number, a: number): void;
    /**
     * Draws a procedural manga speech bubble.
     */
    draw_speech_bubble(x: number, y: number, w: number, h: number, kind_str: string, tip_x: number, tip_y: number): void;
    /**
     * Draws text with horizontal or vertical typesetting.
     */
    draw_text(text: string, x: number, y: number, font_size: number, vertical: boolean): void;
    /**
     * Fills an axis-aligned rectangle.
     */
    fill_rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void;
    /**
     * Returns a copy of the RGBA pixel buffer.
     */
    get_pixel_data(): Uint8Array;
    /**
     * Creates a new WASM canvas surface.
     */
    static new(width: number, height: number): CanvasEngineWasm;
}

/**
 * Pont d'intégration WebAssembly pour le moteur Dragon Pixel.
 */
export class DragonPixelEngineWasm {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Récupère le paquet de rendu complet formaté pour les pipelines WebGPU (WGSL).
     */
    get_render_packet_json(): string;
    /**
     * Renvoie le statut actuel du jeu ("playing", "won", "lost").
     */
    get_status(): string;
    constructor(fighter_id: string, mode_str: string, chapter_id: number, arena_str: string);
    /**
     * Draine et renvoie les événements audio déclenchés.
     */
    poll_audio_events_json(): string;
    /**
     * Draine et renvoie les événements de secousse haptique pour la manette physique.
     */
    poll_haptic_events_json(): string;
    /**
     * Réinitialise le combat en cours.
     */
    restart(): void;
    /**
     * Modifie le chapitre du Mode Histoire en cours.
     */
    set_chapter(chapter_id: number): void;
    /**
     * Modifie le combattant sélectionné.
     */
    set_fighter(fighter_id: string): void;
    /**
     * Exécute un pas de simulation déterministe avec les entrées utilisateur.
     */
    step(input_json: string, dt: number): string;
}

/**
 * A real indexed, textured GLB mesh rendered through the shared cel-shading pipeline.
 */
export class GlbModelWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Explicit camera controls: azimuth/elevation in radians and a bounded zoom factor.
     */
    camera(azimuth: number, elevation: number, zoom: number): void;
    frame(_time: number, _tilt_x: number, _tilt_y: number): boolean;
    resize(width: number, height: number): void;
}

/**
 * Browser WebGPU renderer of a manga page staged in 3D (`render::manga_scene`).
 */
export class MangaSceneWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Draws one frame at `time` seconds with the pointer `tilt`; `false` once the device is lost.
     */
    frame(time: number, tilt_x: number, tilt_y: number): boolean;
    /**
     * Whether the WebGPU device was lost.
     */
    isLost(): boolean;
    /**
     * Detected panels, flat `x, y, w, h` in page uv, in reading order.
     */
    panels(): Float32Array;
    /**
     * Reconfigures the surface after the canvas backing size changed.
     */
    resize(width: number, height: number): void;
}

export class Session {
    free(): void;
    [Symbol.dispose](): void;
    constructor(style: string);
    /**
     * Advance the Rust simulation with a JSON input object and return the updated state as JSON.
     */
    step(input_json: string, dt: number): string;
}

/**
 * Browser WebGPU renderer of a Toriyama 3D model (`render::toriyama3d`).
 *
 * JavaScript owns the frame loop (visibility, reduced motion, pointer); each `frame` call
 * draws one image. Without WebGPU, `createToriyamaModel` rejects and the caller keeps its SVG.
 */
export class ToriyamaModelWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Draws one frame at `time` seconds with the pointer `tilt`. Returns `false` once the
     * device is lost: the caller then falls back.
     */
    frame(time: number, tilt_x: number, tilt_y: number): boolean;
    /**
     * Whether the WebGPU device was lost.
     */
    isLost(): boolean;
    /**
     * Reconfigures the surface after the canvas backing size changed.
     */
    resize(width: number, height: number): void;
}

/**
 * A posed, animated DBXV2 character on a WebGPU canvas. JavaScript owns the frame loop.
 */
export class Xv2CharacterWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Names of the animations, in slot order of [`Self::play`].
     */
    animations(): string[];
    /**
     * Azimuth/elevation in radians and a zoom factor in `[0.5, 3]`.
     */
    camera(azimuth: number, elevation: number, zoom: number): void;
    /**
     * Draws the pose at `time` seconds (looping). `false` when the surface is unusable.
     */
    frame(time: number): boolean;
    /**
     * Loads the character's `.bac` action timelines; returns the ids of the actions that
     * animate the character with its own `.ean`.
     */
    loadActions(bytes: Uint8Array): Uint32Array;
    /**
     * Plays action `id` of the loaded `.bac` once: its first character animation over the
     * action's frame range and speed, then returns to the last looping animation.
     */
    playAction(id: number): boolean;
    /**
     * Plays the animation at `index` of [`Self::animations`] from its first frame.
     */
    play(index: number): boolean;
    resize(width: number, height: number): void;
}

export function createGlbModel(canvas: HTMLCanvasElement, bytes: Uint8Array): Promise<GlbModelWasm>;

/**
 * Segments the page (`rgba`, `width × height`, an authorised scan, full resolution) into panels,
 * box-filters its texture to `texture_side` pixels and opens its 3D scene on `canvas`. Without
 * WebGPU it rejects and the caller keeps the flat page.
 */
export function createMangaScene(canvas: HTMLCanvasElement, rgba: Uint8Array, width: number, height: number, texture_side: number): Promise<MangaSceneWasm>;

/**
 * Opens a WebGPU device on `canvas` and prepares `model` (`dragon-ball` or `kinto-un`) from its
 * flat measured `params` (see `DragonBallUniforms::from_params`, `KintoUnUniforms::from_params`).
 */
export function createToriyamaModel(canvas: HTMLCanvasElement, model: string, params: Float32Array): Promise<ToriyamaModelWasm>;

/**
 * Parses every file, decodes textures and uploads the character. `parts` is an array of
 * `{ emd, emb?, emm?, dyt? }` byte arrays.
 */
export function createXv2Character(canvas: HTMLCanvasElement, esk: Uint8Array, ean: Uint8Array, parts: Array<any>): Promise<Xv2CharacterWasm>;

/**
 * Decompress a CRILAYLA compressed buffer into raw uncompressed bytes.
 */
export function wasm_decompress_crilayla(compressed: Uint8Array, uncompressed_size: number): Uint8Array;

/**
 * Extract a single file from a CPK archive by name (transparently decompressing CRILAYLA if needed).
 */
export function wasm_extract_cpk_file(archive_bytes: Uint8Array, filename: string): Uint8Array;

/**
 * Extract printable UTF-16LE text runs from one MSG buffer without parsing its table layout.
 */
export function wasm_extract_msg_text(file_name: string, msg_bytes: Uint8Array): any;

/**
 * Retrieve the full Dragon Ball game catalog (Steam + Android) as a JavaScript object.
 */
export function wasm_get_dragon_ball_catalog(): any;

/**
 * Retrieve the source-attributed Xenoverse 3 prototype world map as JavaScript data.
 * Announced places and original prototype geometry are distinguished in each record.
 */
export function wasm_get_xenoverse3_prototype_map(): any;

/**
 * Parse a DBXV2 BAC (Battle Action Code) moveset binary file and return all moves.
 */
export function wasm_parse_bac(bac_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 BDM (Battle Damage Matrix) binary file and return all damage definitions.
 */
export function wasm_parse_bdm(bdm_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 CUS (Character Ultimate Skill) binary file and return all skills.
 */
export function wasm_parse_cus(cus_bytes: Uint8Array): any;

/**
 * Validate a DBXV2 EMB texture archive and return its entry names and byte ranges.
 */
export function wasm_parse_emb(emb_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 MSG (Message) binary file and return localized text strings.
 */
export function wasm_parse_msg(msg_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 PUP (Power-Up Parameters) binary file and return transformation multipliers.
 */
export function wasm_parse_pup(pup_bytes: Uint8Array): any;

/**
 * Scan a buffer for an Array-of-Bytes (AOB) pattern with wildcards (e.g. "48 89 5C 24 ??").
 */
export function wasm_scan_aob(data: Uint8Array, pattern: string): Uint32Array;

/**
 * Analyze a CRIWARE CPK archive in-memory and return its file table and metadata.
 */
export function wasm_triage_cpk(bytes: Uint8Array): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_canvasenginewasm_free: (a: number, b: number) => void;
    readonly __wbg_dragonpixelenginewasm_free: (a: number, b: number) => void;
    readonly __wbg_glbmodelwasm_free: (a: number, b: number) => void;
    readonly __wbg_mangascenewasm_free: (a: number, b: number) => void;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly __wbg_toriyamamodelwasm_free: (a: number, b: number) => void;
    readonly __wbg_xv2characterwasm_free: (a: number, b: number) => void;
    readonly canvasenginewasm_clear: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly canvasenginewasm_draw_speech_bubble: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly canvasenginewasm_draw_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly canvasenginewasm_fill_rect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly canvasenginewasm_get_pixel_data: (a: number) => [number, number];
    readonly canvasenginewasm_new: (a: number, b: number) => number;
    readonly createGlbModel: (a: any, b: number, c: number) => any;
    readonly createMangaScene: (a: any, b: number, c: number, d: number, e: number, f: number) => any;
    readonly createToriyamaModel: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly createXv2Character: (a: any, b: number, c: number, d: number, e: number, f: any) => any;
    readonly dragonpixelenginewasm_get_render_packet_json: (a: number) => [number, number];
    readonly dragonpixelenginewasm_get_status: (a: number) => [number, number];
    readonly dragonpixelenginewasm_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly dragonpixelenginewasm_poll_audio_events_json: (a: number) => [number, number];
    readonly dragonpixelenginewasm_poll_haptic_events_json: (a: number) => [number, number];
    readonly dragonpixelenginewasm_restart: (a: number) => void;
    readonly dragonpixelenginewasm_set_chapter: (a: number, b: number) => void;
    readonly dragonpixelenginewasm_set_fighter: (a: number, b: number, c: number) => void;
    readonly dragonpixelenginewasm_step: (a: number, b: number, c: number, d: number) => [number, number];
    readonly glbmodelwasm_camera: (a: number, b: number, c: number, d: number) => void;
    readonly glbmodelwasm_frame: (a: number, b: number, c: number, d: number) => number;
    readonly glbmodelwasm_resize: (a: number, b: number, c: number) => void;
    readonly mangascenewasm_frame: (a: number, b: number, c: number, d: number) => number;
    readonly mangascenewasm_isLost: (a: number) => number;
    readonly mangascenewasm_panels: (a: number) => [number, number];
    readonly mangascenewasm_resize: (a: number, b: number, c: number) => void;
    readonly session_new: (a: number, b: number) => number;
    readonly session_step: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly toriyamamodelwasm_frame: (a: number, b: number, c: number, d: number) => number;
    readonly toriyamamodelwasm_isLost: (a: number) => number;
    readonly toriyamamodelwasm_resize: (a: number, b: number, c: number) => void;
    readonly wasm_decompress_crilayla: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasm_extract_cpk_file: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasm_extract_msg_text: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasm_get_dragon_ball_catalog: () => [number, number, number];
    readonly wasm_get_xenoverse3_prototype_map: () => [number, number, number];
    readonly wasm_parse_bac: (a: number, b: number) => [number, number, number];
    readonly wasm_parse_bdm: (a: number, b: number) => [number, number, number];
    readonly shenron_re_abi_version: () => number;
    readonly shenron_re_bac_parse_json: (a: number, b: number) => number;
    readonly shenron_re_bdm_parse_json: (a: number, b: number) => number;
    readonly shenron_re_catalog_json: () => number;
    readonly shenron_re_cpk_extract: (a: number, b: number, c: number, d: number) => number;
    readonly shenron_re_cpk_list_json: (a: number, b: number) => number;
    readonly shenron_re_cus_parse_json: (a: number, b: number) => number;
    readonly shenron_re_free_bytes: (a: number, b: number) => void;
    readonly shenron_re_free_string: (a: number) => void;
    readonly shenron_re_live_battle_read: (a: number, b: bigint) => number;
    readonly shenron_re_live_process_find: (a: number) => number;
    readonly shenron_re_msg_parse_json: (a: number, b: number) => number;
    readonly shenron_re_pup_parse_json: (a: number, b: number) => number;
    readonly shenron_re_sav_parse_json: (a: number, b: number) => number;
    readonly shenron_re_triage_json: (a: number, b: number) => number;
    readonly shenron_re_unified_state_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly shenron_re_version: () => number;
    readonly wasm_parse_cus: (a: number, b: number) => [number, number, number];
    readonly wasm_parse_emb: (a: number, b: number) => [number, number, number];
    readonly wasm_parse_msg: (a: number, b: number) => [number, number, number];
    readonly wasm_parse_pup: (a: number, b: number) => [number, number, number];
    readonly wasm_scan_aob: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasm_triage_cpk: (a: number, b: number) => [number, number, number];
    readonly xv2characterwasm_animations: (a: number) => [number, number];
    readonly xv2characterwasm_camera: (a: number, b: number, c: number, d: number) => void;
    readonly xv2characterwasm_frame: (a: number, b: number) => number;
    readonly xv2characterwasm_loadActions: (a: number, b: number, c: number) => [number, number, number, number];
    readonly xv2characterwasm_play: (a: number, b: number) => number;
    readonly xv2characterwasm_playAction: (a: number, b: number) => number;
    readonly xv2characterwasm_resize: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___js_sys_eb92dcb4f6145e43___Function_fn_wasm_bindgen_3017951c9ae318c7___JsValue_____wasm_bindgen_3017951c9ae318c7___sys__Undefined___js_sys_eb92dcb4f6145e43___Function_fn_wasm_bindgen_3017951c9ae318c7___JsValue_____wasm_bindgen_3017951c9ae318c7___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___wasm_bindgen_3017951c9ae318c7___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_3017951c9ae318c7___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___wasm_bindgen_3017951c9ae318c7___sys__JsNullable_wgpu_a6a6189b5bcebd86___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_3017951c9ae318c7___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___wasm_bindgen_3017951c9ae318c7___sys__JsNullable_wgpu_a6a6189b5bcebd86___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_3017951c9ae318c7___JsError___true__55: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___wasm_bindgen_3017951c9ae318c7___sys__JsNullable_wgpu_a6a6189b5bcebd86___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_3017951c9ae318c7___JsError___true__56: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_3017951c9ae318c7___convert__closures_____invoke___wgpu_a6a6189b5bcebd86___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
