# Manga and databooks reader (overrides MASTER where they conflict)

Engine: GPUI/NSH canvas over wgpu (`crates/shenron-manga`, Koharu crates for OCR, translation, typesetting), HTML fallback page per volume and page.

- Page turn and zoom at the display refresh rate; GPU upscale is an explicit, labelled setting and the original scan stays one tap away.
- OCR and translation layers are toggles over the scan, never baked in; each block keeps its provenance (`shenron-ocr-core`).
- Pinch, double-tap and keyboard zoom; text reflow is not applicable to scans, so the reader offers the translated text as accessible HTML beside the page.
- Databook plates link to the wiki entries they prove.
