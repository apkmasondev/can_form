# CAN//FORM — Interactive Product Experience

A static, cinematic product campaign combining a configurable WebGL aluminum can with two scroll-scrubbed MP4 sequences. The experience is built with React, TypeScript, Vite and direct Three.js, without a router, backend, analytics or third-party runtime requests.

## Run locally

Requires Node.js 24+.

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run typecheck
npm run media:verify
npm run build
npm run preview
```

## Interface

The UI is built as a product spec sheet rather than a card layout:

- Two type voices — a tight grotesk for display, the platform monospace for every code, number and machine label. Neither is downloaded.
- Square corners throughout (`--radius: 0`) and diagonal corner ticks in place of full borders on the configurator.
- Control blocks are numbered in their own gutter and each states its current setting on a dotted leader row, the way a parts list does.
- One sliding plate moves between the three finishes; the label selection is marked by a rule drawn across the swatch.
- The primary button is a rolled-aluminium plate whose anisotropic highlight sweeps across on hover; the ghost variant is an anodised dark plate with an accent wipe on its leading edge.
- The native scrollbar is suppressed. Scrolling is untouched — wheel, trackpad, touch and keyboard all still drive the timeline — and the chapter rail on the right reports position, with its tick marks at the real chapter boundaries.

## Architecture

- One sticky `100svh` stage and one WebGL canvas.
- A delta-time eased native-scroll timeline; no scroll hijacking.
- Two paused video elements scrubbed at their native 24 fps.
- WebGL/MP4 calibration states for hero, macro, full-can, top and final views.
- Direct Three.js rendering is lazy-loaded after the React shell.
- Meshopt-compressed GLB with separate `Body`, `Top`, `TopPanel`, `PanelWell`, `PanelEmboss`, `Rim`, `Rivet`, `ScorePanel`, `Tab`, `InnerOpening`, `Bottom` and `BottomRim` nodes.
- Shader-level label crossfade without duplicate meshes or z-fighting.
- Procedural, anti-aliased radial brushing on the lid with no texture download or extra draw call.
- A damped desktop-only configurator key light that follows the pointer; touch, reduced-motion and mobile profiles skip it.
- Client-side PNG export of the selected label, finish and 360° rotation (1600 px desktop / 1200 px mobile).
- Device-tier DPR caps, runtime FPS downgrade, reduced-motion, Save-Data and WebGL context-loss fallbacks.

## Video pipeline

The two original files remain unchanged in the repository root and are git-ignored, so only the processed renditions under `src/assets/media/` are ever committed or published:

- `Aluminum_can_product_video_202608131716.mp4`
- `Camera_pushing_toward_opening_can_202608131722.mp4`

The matching Lime and Cherry masters follow the same rule:

- `lime1.mp4` / `lime2.mp4`
- `cherry1.mp4` / `cherry2.mp4`

Generate production media with FFmpeg 9+:

```bash
npm run media:process
```

The cross-platform Node pipeline creates 1280×720 desktop and 960×540 mobile H.264 files for Noir, Lime and Cherry, removes audio physically, sets 24 fps, GOP=1 and faststart, extracts the exact first and last frames (0 and 239) as WebP reference frames, then verifies every output. Re-run validation without transcoding with:

```bash
npm run media:verify
```

The machine-readable report is `src/assets/media/video-verification.json`.

Film variants are switched while the configurator chapter is showing and both cinematic layers are hidden. Film 2 is prioritised for forward scrolling, then Film 1 is prepared for reverse scrolling. Only the active device rendition and selected identity are requested; the remaining variants stay as URL entries in the bundle and are not downloaded. `Custom` always uses the original Noir films. `Zero` currently follows the same fallback until its dedicated masters are added.

## Model and UV

Regenerate the model, label textures, favicon and OG asset with:

```bash
npm run assets:generate
```

The procedural build creates `src/assets/models/can-form.glb` and then compresses it with Meshopt. The body is a profiled surface of revolution, not a `CylinderGeometry` placeholder. Current geometry is 40,998 triangles; the report is in `src/assets/models/model-report.json`.

Surfaces of revolution carry analytic normals derived from the profile tangent rather than face-averaged ones, so the duplicated rear seam column of the body shades continuously and the shoulders stay smooth at 64 height rows.

The can end is modelled as a real 206-style end rather than a flat lid:

- `Rim` double seam curl, `Top` chuck wall and countersink groove.
- The panel is pressed, not flat. `TopPanel` is the outer ring; `PanelEmboss` is the crease walling it in; `PanelWell` is the shallow recess inside, 0.008 units lower, holding the tab and the opening the way a real end does. The emboss contour is a teardrop enclosing the whole assembly — wide at the rim end, tapering behind the finger ring — not a circle concentric with the panel.
- `ScorePanel` is the scored tear panel, cut out of `PanelWell` with a ~0.004 unit gap that reads as the score line, hinged at its narrow end on `LidPivot`.
- `Tab` is a stay-on-tab ring pull on `TabPivot` at the `Rivet`, nose forward over the hinge, finger ring aft.
- `InnerOpening` is the dark interior cup seen through the opening.

Every pressed feature is swept by `contourRib`, which offsets a closed contour along its own normals rather than scaling it, so the band keeps an even width around a teardrop. Its rows must be ordered inner-first: the sweep direction sets the facing, and running outer-to-inner turns the whole band away from the camera. Adjoining surfaces are separated by fractions of a unit in height rather than meeting coplanar, which is what keeps the end free of z-fighting.

Both pivots are driven from `updateProduct` in `src/webgl/CanExperience.ts` and are fully travelled by progress `0.928`, where film 2 cuts away on an already-open can. The `0.92` camera state, the tab plan size and the tear panel size are all calibrated against `src/assets/media/can-film-02-end.webp`; changing one without the others breaks the hand-off.

Body UV rules:

- `U 0 → 1`: full circumference.
- `V 0 → 1`: product height.
- seam: rear of the product.
- artwork front: centered at `U .5`.
- keep critical artwork between the marked shoulder guides.

Download/edit `public/downloads/can-uv-template.svg`. The upload feature accepts PNG, JPG or WebP up to 10 MB and keeps the file entirely in the browser.

## Label variants

Built-in variants are Noir, Lime, Cherry and Zero, each generated at 2048×1024 and 1024×512. To add a permanent variant:

1. Add its visual definition in `scripts/generate-assets.mjs`.
2. Run `npm run assets:generate`.
3. Import and register both sizes in `src/config/variants.ts`.

The 2K file is selected on desktop; mobile receives only the 1K file. Secondary variants load on demand.

## Debug calibration

Run the dev server and open:

```text
http://localhost:5173/?debug=1
```

The development-only panel reports progress, active segment, video times, FPS, DPR, draw calls, pointer-light position and variant. It can overlay the four MP4 reference frames. Keys `1–7` jump to calibration points. Dev builds also expose the live engine as `window.__canForm` for inspecting pivots and camera state.

All of this is behind `import.meta.env.DEV`, so none of it — panel, shortcuts, calibration points or the global — is present in `npm run build` output.

## GitHub Pages

The included workflow builds `dist/` and deploys it with the current official Pages actions. In repository settings choose **Pages → Source → GitHub Actions**.

The default Vite `base: './'` intentionally supports all three static locations with one artifact:

- `https://USERNAME.github.io/`
- `https://USERNAME.github.io/REPOSITORY/`
- a custom domain

Optional repository Actions variables:

- `SITE_URL`: absolute final URL, e.g. `https://username.github.io/repository`. This adds canonical metadata and an absolute OG image URL.
- `BASE_PATH`: only needed if an explicit absolute Vite base is preferred, e.g. `/repository/`.

`SITE_URL` is optional: the workflow falls back to the `base_url` reported by `actions/configure-pages`, which already resolves a custom domain if one is configured, so canonical and OG metadata are correct without any manual variable.

Run the workflow after the repository's default branch is named `main`. No `node_modules` or source videos are published; only `dist/` is uploaded.

### Weight

A first desktop visit transfers roughly 12 MB, almost all of it the two cinematics (5.4 + 5.9 MB); mobile receives the 960×540 pair instead (3.1 + 3.5 MB). Everything else is small: 264 kB gzipped Three.js, 263 kB GLB, and 8–57 kB per label texture. GitHub Pages applies a soft 100 GB/month bandwidth allowance, so this budget supports on the order of 8,000 desktop visits a month before that becomes a consideration.

The `og:image` is deliberately JPEG while every other raster on the site is WebP — link unfurlers are the one consumer that still drops WebP.

## Credits

Design and development by [APKMason.dev](https://apkmason.dev/).

## Known constraints

- The supplied 16:9 cinematics use centered `object-fit: cover` framing on portrait screens; no invented vertical crops are generated.
- The final WebGL opening is deliberately lightweight and has no volumetric steam or simulated condensation. The vapor remains in the cinematic, then hands off through a short calibrated opacity transition.
- Film 2 dissolves in over a 0.02 progress window but cuts out within 0.0001 at the matched rim. The asymmetry is deliberate: a dissolve at the rim doubles the tab, while a cut at the entrance popped straight out of the full-can pose.
- Canonical URL and sitemap cannot be finalized until the public domain/repository path is known. Set `SITE_URL` before the public deployment; add a sitemap only after that URL is final.
- iOS Safari and physical low-end Android validation still require real devices; desktop Chromium and emulated responsive breakpoints are covered by the local audit.
