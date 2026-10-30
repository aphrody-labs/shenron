/* tslint:disable */
/* eslint-disable */

/**
 * Browser WebGPU viewport over native-prepared Koharu frames.
 */
export class WebCanvas {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    activateFrame(token: number): boolean;
    activatePage(page: string, expected_revision: bigint): boolean;
    beginStroke(kind: string, layer: string | null | undefined, point: any, diameter: number, color: Uint8Array): void;
    beginTransform(elements: any): void;
    cacheFrame(token: number): boolean;
    cancelStroke(): void;
    cancelTransform(): void;
    clear(): void;
    dispose(): void;
    extendStroke(points: any): void;
    finishStroke(): any;
    finishTransform(): any;
    installResource(id: string, bytes: Uint8Array): Promise<void>;
    previewOpacity(element: string, opacity?: number | null): void;
    /**
     * Presents immediately and resolves after the browser reaches its next frame.
     */
    render(): Promise<bigint>;
    requestRender(): void;
    resize(css_width: number, css_height: number, device_pixel_ratio: number, background: Uint8Array): void;
    sampleColor(x: number, y: number): Promise<Uint8Array>;
    setDeviceLostCallback(callback?: Function | null): void;
    setView(zoom: number, translation_x: number, translation_y: number): void;
    stageManifest(bytes: Uint8Array): any;
    updateTransform(sequence: number, elements: any): void;
    readonly deviceLostReason: string | undefined;
}

/**
 * Initializes a browser WebGPU canvas.
 */
export function createCanvas(element: HTMLCanvasElement): Promise<WebCanvas>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_webcanvas_free: (a: number, b: number) => void;
    readonly createCanvas: (a: any) => any;
    readonly webcanvas_activateFrame: (a: number, b: number) => [number, number, number];
    readonly webcanvas_activatePage: (a: number, b: number, c: number, d: bigint) => [number, number, number];
    readonly webcanvas_beginStroke: (a: number, b: number, c: number, d: number, e: number, f: any, g: number, h: any) => [number, number];
    readonly webcanvas_beginTransform: (a: number, b: any) => [number, number];
    readonly webcanvas_cacheFrame: (a: number, b: number) => [number, number, number];
    readonly webcanvas_cancelStroke: (a: number) => [number, number];
    readonly webcanvas_cancelTransform: (a: number) => [number, number];
    readonly webcanvas_clear: (a: number) => [number, number];
    readonly webcanvas_deviceLostReason: (a: number) => [number, number];
    readonly webcanvas_dispose: (a: number) => void;
    readonly webcanvas_extendStroke: (a: number, b: any) => [number, number];
    readonly webcanvas_finishStroke: (a: number) => [number, number, number];
    readonly webcanvas_finishTransform: (a: number) => [number, number, number];
    readonly webcanvas_installResource: (a: number, b: number, c: number, d: any) => any;
    readonly webcanvas_previewOpacity: (a: number, b: number, c: number, d: number) => [number, number];
    readonly webcanvas_render: (a: number) => any;
    readonly webcanvas_requestRender: (a: number) => [number, number];
    readonly webcanvas_resize: (a: number, b: number, c: number, d: number, e: any) => [number, number];
    readonly webcanvas_sampleColor: (a: number, b: number, c: number) => any;
    readonly webcanvas_setDeviceLostCallback: (a: number, b: number) => void;
    readonly webcanvas_setView: (a: number, b: number, c: number, d: number) => [number, number];
    readonly webcanvas_stageManifest: (a: number, b: any) => [number, number, number];
    readonly webcanvas_updateTransform: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___f64______true_: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___js_sys_69739cf680d85524___Function_fn_wasm_bindgen_ea7cac6b7005a86f___JsValue_____wasm_bindgen_ea7cac6b7005a86f___sys__Undefined___js_sys_69739cf680d85524___Function_fn_wasm_bindgen_ea7cac6b7005a86f___JsValue_____wasm_bindgen_ea7cac6b7005a86f___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___wasm_bindgen_ea7cac6b7005a86f___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_ea7cac6b7005a86f___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___wasm_bindgen_ea7cac6b7005a86f___sys__JsNullable_wgpu_cc8089cb1ec2d457___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_ea7cac6b7005a86f___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___wasm_bindgen_ea7cac6b7005a86f___sys__JsNullable_wgpu_cc8089cb1ec2d457___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_ea7cac6b7005a86f___JsError___true__29: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___wasm_bindgen_ea7cac6b7005a86f___sys__JsNullable_wgpu_cc8089cb1ec2d457___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_ea7cac6b7005a86f___JsError___true__30: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ea7cac6b7005a86f___convert__closures_____invoke___wgpu_cc8089cb1ec2d457___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
export default function __wbg_init (module_or_path: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
