import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

// GLTFExporter uses the browser FileReader API even for binary exports.
// Node provides Blob but not FileReader, so keep the build script self-contained.
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    result = null
    error = null
    onloadend = null

    readAsArrayBuffer(blob) {
      blob.arrayBuffer()
        .then((buffer) => { this.result = buffer })
        .catch((error) => { this.error = error })
        .finally(() => this.onloadend?.({ target: this }))
    }
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelDir = resolve(root, 'src/assets/models')
const textureDir = resolve(root, 'src/assets/textures')
const publicDir = resolve(root, 'public')
const downloadDir = resolve(publicDir, 'downloads')
for (const directory of [modelDir, textureDir, publicDir, downloadDir]) mkdirSync(directory, { recursive: true })

function profileRadius(y) {
  const points = [
    [-2.45, 0.775], [-2.41, 0.835], [-2.33, 0.885], [-2.23, 0.912],
    [-2.08, 0.922], [2.03, 0.922], [2.13, 0.913], [2.23, 0.875],
    [2.33, 0.81], [2.39, 0.79],
  ]
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    if (!current || !next || y > next[0]) continue
    const t = Math.max(0, Math.min(1, (y - current[0]) / (next[0] - current[0])))
    const eased = t * t * (3 - 2 * t)
    return current[1] + (next[1] - current[1]) * eased
  }
  return points.at(-1)?.[1] ?? 0.79
}

/**
 * Surface of revolution from a `[radius, y]` polyline.
 *
 * Normals are derived analytically from the profile tangent instead of being
 * averaged from adjacent faces. Face averaging gave the two coincident seam
 * columns of the body normals tilted half a segment in opposite directions,
 * which printed a faint specular crease down the rear of a 96%-metalness
 * surface. It also flat-shaded the shoulders, where only a handful of rows
 * cover the whole radius change.
 *
 * The profile must be ordered so that walking it forwards keeps the material on
 * the right; `flipNormal` handles caps that are authored from the centre out.
 */
function revolve(profile, { radialSegments = 160, flipNormal = false, uv = 'row', name = 'Revolved' } = {}) {
  const rows = profile.length
  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  const profileNormals = profile.map((_, index) => {
    const previous = profile[Math.max(0, index - 1)]
    const next = profile[Math.min(rows - 1, index + 1)]
    const dr = next[0] - previous[0]
    const dy = next[1] - previous[1]
    const length = Math.hypot(dr, dy) || 1
    const nr = (flipNormal ? -dy : dy) / length
    const ny = (flipNormal ? dr : -dr) / length
    return [nr, ny]
  })

  for (let row = 0; row < rows; row += 1) {
    const [radius, y] = profile[row]
    const [nr, ny] = profileNormals[row]
    const v = row / (rows - 1)
    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments
      const angle = u * Math.PI * 2 - Math.PI / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      positions.push(cos * radius, y, sin * radius)
      normals.push(cos * nr, ny, sin * nr)
      uvs.push(u, uv === 'row' ? v : radius)
    }
  }

  // The winding follows the same tangent as the normal, so flipping one without
  // flipping the other leaves the surface shaded from the front and culled from
  // the back — invisible.
  const rowLength = radialSegments + 1
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const a = row * rowLength + column
      const b = a + rowLength
      if (flipNormal) indices.push(a, a + 1, b, b, a + 1, b + 1)
      else indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  geometry.name = name
  return geometry
}

function createCanBody(radialSegments = 160, heightSegments = 64) {
  // Sampled at a uniform y so that V stays exactly linear in product height —
  // the label unwrap depends on it.
  const profile = []
  for (let row = 0; row <= heightSegments; row += 1) {
    const y = -2.45 + (row / heightSegments) * 4.84
    profile.push([profileRadius(y), y])
  }
  return revolve(profile, { radialSegments, name: 'CanBody_UV_Cylindrical' })
}

function ellipseShape(width, height) {
  const shape = new THREE.Shape()
  shape.absellipse(0, 0, width, height, 0, Math.PI * 2, false, 0)
  return shape
}

/**
 * Draws a closed contour from mirrored bezier control points. `half` lists the
 * right-hand side from the front tip to the back tip; the left side is its
 * mirror, which keeps the tab and the tear panel exactly symmetric.
 */
function mirroredShape(target, front, half) {
  target.moveTo(front[0], front[1])
  const starts = []
  let cursor = front
  for (const segment of half) {
    starts.push(cursor)
    target.bezierCurveTo(...segment)
    cursor = [segment[4], segment[5]]
  }
  for (let index = half.length - 1; index >= 0; index -= 1) {
    const [c1x, c1y, c2x, c2y] = half[index]
    const start = starts[index]
    target.bezierCurveTo(-c2x, c2y, -c1x, c1y, -start[0], start[1])
  }
  target.closePath()
  return target
}

/** Thickness runs along local +z, then the part is laid flat onto the can end. */
function layFlat(geometry) {
  geometry.computeBoundingBox()
  geometry.translate(0, 0, -geometry.boundingBox.min.z)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/**
 * Stay-on-tab ring pull. Local -y is the nose (world +z, towards the rim), local
 * +y is the finger ring. Overall 0.62 × 0.30 units ≈ 22 × 11 mm at the scale of
 * this can, with the rivet hole set well forward of centre as on a real end.
 */
function createTabGeometry() {
  const shape = mirroredShape(
    new THREE.Shape(),
    [0, -0.3],
    [
      [0.055, -0.3, 0.082, -0.256, 0.086, -0.206],
      [0.092, -0.14, 0.1, -0.09, 0.118, -0.03],
      [0.14, 0.04, 0.152, 0.12, 0.152, 0.19],
      [0.152, 0.268, 0.098, 0.318, 0, 0.318],
    ],
  )

  const fingerRing = mirroredShape(
    new THREE.Path(),
    [0, -0.012],
    [
      [0.062, -0.012, 0.097, 0.045, 0.1, 0.118],
      [0.103, 0.204, 0.062, 0.25, 0, 0.25],
    ],
  )
  shape.holes.push(fingerRing)

  const rivetHole = new THREE.Path()
  rivetHole.absellipse(0, -0.1, 0.043, 0.043, 0, Math.PI * 2, true, 0)
  shape.holes.push(rivetHole)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    curveSegments: 20,
  })
  geometry.name = 'RingPull_Tab'
  return layFlat(geometry)
}

/**
 * The scored tear panel. Wider at the rim end, narrow at the hinge end, which
 * is where the nose of the tab presses it down into the can.
 *
 * Sized against the last frame of film 2 (`can-film-02-end.webp`): the opening
 * there reads at roughly a third of the end diameter, far larger than a token
 * slot, and the WebGL hand-off only holds if the two agree.
 */
function tearPanelShape(scale = 1) {
  const point = (x, y) => [x * scale, y * scale]
  const half = [
    [...point(0.15, -0.3), ...point(0.255, -0.2), ...point(0.26, -0.075)],
    [...point(0.265, 0.075), ...point(0.2, 0.225), ...point(0.1, 0.268)],
    [...point(0.055, 0.288), ...point(0.02, 0.29), ...point(0, 0.29)],
  ]
  return mirroredShape(new THREE.Shape(), point(0, -0.3), half)
}

const scene = new THREE.Scene()
scene.name = 'CAN_FORM_Product'

const labelMaterial = new THREE.MeshPhysicalMaterial({ name: 'Label_Base', color: 0x121212, metalness: 0.62, roughness: 0.32, clearcoat: 0.18, clearcoatRoughness: 0.48 })
const aluminumMaterial = new THREE.MeshStandardMaterial({ name: 'Brushed_Aluminum', color: 0xb9bdbe, metalness: 0.98, roughness: 0.3 })
const darkMaterial = new THREE.MeshStandardMaterial({ name: 'Inner_Shadow', color: 0x050505, metalness: 0.25, roughness: 0.58 })

const body = new THREE.Mesh(createCanBody(), labelMaterial)
body.name = 'Body'
scene.add(body)

// ---------------------------------------------------------------------------
// Can end. A real 206-style end is a stack of features, not a flat lid: a
// double-seam curl, a chuck wall dropping to a countersink groove, the flat
// panel, a central rivet, a scored tear panel and the stay-on-tab ring pull.
// Panel top plane is y = 2.400 and the whole assembly is laid out along +z so
// the finger ring faces the camera at the top calibration state.
// ---------------------------------------------------------------------------
const panelY = 2.4
const panelRadius = 0.66
// Hinge sits just in front of the rivet; the panel runs from there out towards
// the countersink, which is the layout the cinematic hands over.
const tearHingeZ = 0.02
const tearCentreZ = tearHingeZ + 0.29
const rivetZ = -0.1

// Countersink + chuck wall + seam, authored centre-out so the winding stays
// front-facing when viewed from above.
const topRing = new THREE.Mesh(
  revolve([
    // Starts under the panel slab so the two surfaces never share a plane.
    [0.638, panelY - 0.004],
    [0.672, panelY - 0.004],
    [0.692, panelY - 0.016],
    [0.708, panelY - 0.036],
    [0.722, panelY - 0.012],
    [0.732, panelY + 0.014],
    [0.752, panelY + 0.044],
    [0.77, panelY + 0.052],
    [0.788, panelY + 0.04],
  ], { flipNormal: true, uv: 'radius', name: 'Can_End_Countersink' }),
  aluminumMaterial,
)
topRing.name = 'Top'
scene.add(topRing)

const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.786, 0.046, 12, 160), aluminumMaterial)
topRim.name = 'Rim'
topRim.rotation.x = Math.PI / 2
topRim.position.y = panelY + 0.018
scene.add(topRim)

// Flat panel with the score line cut out. The cut-out is the tear panel scaled
// up slightly, so the residual gap reads as the score itself.
const panelShape = ellipseShape(panelRadius, panelRadius)
// 1.3% oversize leaves a ~0.004 unit gap: at this camera distance that reads as
// the score line itself. A wider gap turned into a black outline around the lid.
const scoreHole = new THREE.Path(
  tearPanelShape(1.013).getPoints(28).map((point) => point.clone().add(new THREE.Vector2(0, -tearCentreZ))),
)
panelShape.holes.push(scoreHole)

const topPanel = new THREE.Mesh(
  new THREE.ExtrudeGeometry(panelShape, { depth: 0.016, bevelEnabled: false, curveSegments: 84 }),
  aluminumMaterial,
)
topPanel.name = 'TopPanel'
topPanel.geometry.name = 'Can_End_Panel'
layFlat(topPanel.geometry)
topPanel.position.y = panelY - 0.016
scene.add(topPanel)

// Dark interior cup: without it the score opening looks straight through the
// single-sided body shell to the far wall.
const innerOpening = new THREE.Mesh(
  revolve([
    // Deep enough that the folded-back tear panel never pokes through the floor.
    [0, 1.62],
    [0.32, 1.61],
    [0.55, 1.7],
    [0.635, 1.98],
    [0.654, 2.386],
  ], { radialSegments: 96, flipNormal: true, uv: 'radius', name: 'Can_Interior' }),
  darkMaterial,
)
innerOpening.name = 'InnerOpening'
scene.add(innerOpening)

// Tear panel, hinged at its narrow end just in front of the rivet.
const lidPivot = new THREE.Group()
lidPivot.name = 'LidPivot'
lidPivot.position.set(0, panelY, tearHingeZ)
const tearPanel = new THREE.Mesh(
  layFlat(new THREE.ExtrudeGeometry(tearPanelShape(), { depth: 0.013, bevelEnabled: false, curveSegments: 28 })),
  aluminumMaterial,
)
tearPanel.name = 'ScorePanel'
tearPanel.geometry.name = 'Can_End_Tear_Panel'
tearPanel.position.set(0, -0.013, 0.29)
lidPivot.add(tearPanel)
scene.add(lidPivot)

const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), aluminumMaterial)
rivet.name = 'Rivet'
rivet.scale.y = 0.8
rivet.position.set(0, panelY - 0.002, rivetZ)
scene.add(rivet)

// The tab is authored at unit size and scaled in plan only, so its thickness
// stays constant. 0.85 lands its width on the same fraction of the end diameter
// as the cinematic, which is what the eye compares across the cut.
const tabScale = 0.85
const tabPivot = new THREE.Group()
tabPivot.name = 'TabPivot'
tabPivot.position.set(0, panelY + 0.004, rivetZ)
const tab = new THREE.Mesh(createTabGeometry(), aluminumMaterial)
tab.name = 'Tab'
tab.scale.set(tabScale, 1, tabScale)
tab.position.z = -0.1 * tabScale
tabPivot.add(tab)
scene.add(tabPivot)

const bottomPanel = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.77, 0.075, 160, 2, false), aluminumMaterial)
bottomPanel.name = 'Bottom'
bottomPanel.position.y = -2.455
scene.add(bottomPanel)

const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 12, 160), aluminumMaterial)
bottomRim.name = 'BottomRim'
bottomRim.rotation.x = Math.PI / 2
bottomRim.position.y = -2.49
scene.add(bottomRim)

scene.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.castShadow = true
    object.receiveShadow = true
  }
})

const exporter = new GLTFExporter()
const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, truncateDrawRange: true })
const rawModelPath = resolve(modelDir, 'can-form.raw.glb')
const modelPath = resolve(modelDir, 'can-form.glb')
writeFileSync(rawModelPath, Buffer.from(glb))

await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
const document = await io.read(rawModelPath)
// UVs are intentionally retained even though label textures are attached at runtime.
await document.transform(dedup(), weld({ tolerance: 0 }), prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
await io.write(modelPath, document)
unlinkSync(rawModelPath)

let triangles = 0
const meshes = []
scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return
  const count = object.geometry.index?.count ?? object.geometry.getAttribute('position').count
  const meshTriangles = Math.floor(count / 3)
  triangles += meshTriangles
  meshes.push({ name: object.name, triangles: meshTriangles })
})
writeFileSync(resolve(modelDir, 'model-report.json'), `${JSON.stringify({ triangles, meshes, uv: 'Body U=circumference, V=height, seam=rear' }, null, 2)}\n`)

const variants = [
  { id: 'noir', name: 'NOIR', code: '01', background: '#101112', ink: '#f1efe8', accent: '#aeb4b0', note: 'MINERAL / 00' },
  { id: 'lime', name: 'LIME', code: '02', background: '#a8d80d', ink: '#12150d', accent: '#e9ffc3', note: 'CITRUS / 02' },
  { id: 'cherry', name: 'CHERRY', code: '03', background: '#771427', ink: '#f6d7d0', accent: '#dc6a75', note: 'TART / 03' },
  { id: 'zero', name: 'ZERO', code: '00', background: '#ddd8ce', ink: '#171816', accent: '#a8a39a', note: 'PURE / 00' },
]

function labelSvg(variant) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024">
    <defs>
      <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.7" fill="${variant.ink}" opacity="0.07"/>
      </pattern>
      <linearGradient id="shade" x1="0" x2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.10"/>
        <stop offset="0.25" stop-color="#fff" stop-opacity="0.035"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.78" stop-color="#fff" stop-opacity="0.03"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.10"/>
      </linearGradient>
    </defs>
    <rect width="2048" height="1024" fill="${variant.background}"/>
    <rect width="2048" height="1024" fill="url(#grain)"/>
    <rect width="2048" height="1024" fill="url(#shade)"/>
    <g fill="none" stroke="${variant.ink}" stroke-width="2" opacity="0.7">
      <path d="M676 110H1372M676 914H1372"/>
      <path d="M718 110V914M1330 110V914" opacity="0.25"/>
    </g>
    <g fill="${variant.ink}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
      <text x="1024" y="190" font-size="24" font-weight="700" letter-spacing="8">CAN//FORM</text>
      <text x="1024" y="500" font-size="168" font-weight="700" letter-spacing="-7">${variant.name}</text>
      <text x="1024" y="558" font-size="18" font-weight="700" letter-spacing="7">FORM / FINISH / IDENTITY</text>
      <text x="1024" y="824" font-size="22" font-weight="700" letter-spacing="5">${variant.note}</text>
      <text x="1024" y="874" font-size="15" letter-spacing="4">330 ML — DESIGNED TO MOVE</text>
    </g>
    <g transform="translate(1580 190)" fill="${variant.ink}" font-family="Arial, Helvetica, sans-serif">
      <text x="0" y="0" font-size="15" font-weight="700" letter-spacing="4">SERIES ${variant.code}</text>
      <text x="0" y="52" font-size="13" letter-spacing="2" opacity="0.72">ALUMINUM</text>
      <text x="0" y="78" font-size="13" letter-spacing="2" opacity="0.72">COLD FILLED</text>
      <circle cx="6" cy="160" r="5" fill="${variant.accent}"/>
      <path d="M0 210h260M0 218h180M0 226h230" stroke="${variant.ink}" opacity="0.4"/>
    </g>
    <g transform="translate(370 800) rotate(-90)" fill="${variant.ink}" font-family="Arial, Helvetica, sans-serif" opacity="0.68">
      <text font-size="13" letter-spacing="4">INTERACTIVE PRODUCT SYSTEM / 2026</text>
    </g>
  </svg>`
}

for (const variant of variants) {
  const svg = Buffer.from(labelSvg(variant))
  await sharp(svg).webp({ quality: 90, effort: 6, smartSubsample: true }).toFile(resolve(textureDir, `${variant.id}-2048.webp`))
  await sharp(svg).resize(1024, 512, { kernel: sharp.kernel.lanczos3 }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(resolve(textureDir, `${variant.id}-1024.webp`))
}

const uvTemplate = `
<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024">
  <rect width="2048" height="1024" fill="#f4f1ea"/>
  <g stroke="#171817" fill="none">
    <rect x="2" y="2" width="2044" height="1020" stroke-width="4"/>
    <path d="M1024 0V1024" stroke-width="2" stroke-dasharray="12 12"/>
    <path d="M0 88H2048M0 936H2048" stroke-width="2" stroke-dasharray="12 12" opacity="0.5"/>
    <rect x="672" y="88" width="704" height="848" stroke-width="3"/>
  </g>
  <g fill="#171817" font-family="Arial, Helvetica, sans-serif">
    <text x="32" y="54" font-size="24" font-weight="700" letter-spacing="4">CAN//FORM UV TEMPLATE — 2:1</text>
    <text x="1024" y="130" font-size="18" font-weight="700" text-anchor="middle" letter-spacing="3">FRONT ARTWORK SAFE AREA</text>
    <text x="32" y="990" font-size="16">U 0 / rear seam</text>
    <text x="2016" y="990" font-size="16" text-anchor="end">U 1 / rear seam</text>
    <text x="1024" y="990" font-size="16" text-anchor="middle">U .5 / product front</text>
    <text x="32" y="116" font-size="15">TOP SHOULDER — keep critical artwork below dashed line</text>
    <text x="32" y="922" font-size="15">BOTTOM SHOULDER — keep critical artwork above dashed line</text>
  </g>
</svg>`
writeFileSync(resolve(downloadDir, 'can-uv-template.svg'), uvTemplate.trim())

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#0b0b0b"/><path d="M43 18a18 18 0 1 0 0 28" fill="none" stroke="#f1efe8" stroke-width="7" stroke-linecap="round"/><path d="M38 20v24M47 20v24" stroke="#f1efe8" stroke-width="4"/></svg>`
writeFileSync(resolve(publicDir, 'favicon.svg'), favicon)
await sharp(Buffer.from(favicon)).resize(32, 32).png().toFile(resolve(publicDir, 'favicon-32.png'))
await sharp(Buffer.from(favicon)).resize(180, 180).png().toFile(resolve(publicDir, 'apple-touch-icon.png'))

const ogCard = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#151515"/><stop offset="1" stop-color="#050505"/></linearGradient><linearGradient id="metal"><stop stop-color="#444"/><stop offset="0.2" stop-color="#e9e9e2"/><stop offset="0.45" stop-color="#343434"/><stop offset="0.72" stop-color="#babbb7"/><stop offset="1" stop-color="#222"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/><circle cx="830" cy="300" r="270" fill="#252525" opacity="0.35"/>
  <g transform="translate(770 70)"><rect x="0" y="25" width="190" height="445" rx="76" fill="url(#metal)"/><ellipse cx="95" cy="35" rx="92" ry="24" fill="#bbbdb9"/><ellipse cx="95" cy="34" rx="58" ry="13" fill="#797b78"/><rect x="22" y="122" width="146" height="230" fill="#111"/><text x="95" y="223" fill="#f1efe8" font-family="Arial" font-size="28" font-weight="700" text-anchor="middle">CAN//FORM</text><text x="95" y="260" fill="#f1efe8" font-family="Arial" font-size="14" letter-spacing="5" text-anchor="middle">NOIR</text></g>
  <g fill="#f2efe7" font-family="Arial, Helvetica, sans-serif"><text x="72" y="92" font-size="20" font-weight="700" letter-spacing="6">CAN//FORM</text><text x="72" y="300" font-size="78" font-weight="700" letter-spacing="-3">FORM, FINISH</text><text x="72" y="380" font-size="78" font-weight="700" letter-spacing="-3">AND IDENTITY.</text><text x="75" y="465" font-size="18" letter-spacing="3" opacity="0.7">INTERACTIVE PRODUCT EXPERIENCE</text></g>
</svg>`
// JPEG, not WebP. Every label texture and reference frame on the site is WebP,
// but link unfurlers are the one consumer that still has not caught up —
// several (LinkedIn among them) silently drop a WebP og:image. 4:4:4 keeps the
// wordmark edges clean at this size.
await sharp(Buffer.from(ogCard))
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toFile(resolve(publicDir, 'og-card.jpg'))
writeFileSync(resolve(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /\n')

console.log(`Generated ${variants.length * 2} label textures, ${triangles.toLocaleString()}-triangle GLB, UV template and site icons.`)
