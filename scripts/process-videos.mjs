import { mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'src/assets/media')
const fps = 24
const frames = 240
// The reference frames must be the exact frames the scrubber can reach, which
// are frame 0 and frame 239 — not arbitrary timestamps near the ends. The
// reduced-motion and Save-Data paths show these stills instead of the video,
// and the WebGL hand-off is calibrated against the last one.
const firstFrame = 0
const lastFrame = (frames - 1) / fps

const sources = [
  {
    id: '01',
    input: resolve(root, 'Aluminum_can_product_video_202608131716.mp4'),
    start: firstFrame,
    end: lastFrame,
  },
  {
    id: '02',
    input: resolve(root, 'Camera_pushing_toward_opening_can_202608131722.mp4'),
    start: firstFrame,
    end: lastFrame,
  },
]

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function assertTool(name) {
  const result = spawnSync(name, ['-version'], { stdio: 'ignore' })
  if (result.status !== 0) throw new Error(`${name} is required but was not found on PATH.`)
}

assertTool('ffmpeg')
assertTool('ffprobe')
mkdirSync(outputDir, { recursive: true })

for (const source of sources) {
  if (!existsSync(source.input)) throw new Error(`Missing source video: ${source.input}`)

  for (const rendition of [
    { name: 'desktop', width: 1280, height: 720, crf: 21 },
    { name: 'mobile', width: 960, height: 540, crf: 22 },
  ]) {
    const output = resolve(outputDir, `can-film-${source.id}-${rendition.name}.mp4`)
    run('ffmpeg', [
      '-y', '-i', source.input,
      '-map', '0:v:0', '-an', '-map_metadata', '-1',
      '-vf', `scale=${rendition.width}:${rendition.height}:flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(rendition.crf),
      '-pix_fmt', 'yuv420p', '-r', '24', '-fps_mode', 'cfr',
      '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', '-tag:v', 'avc1', output,
    ])
  }

  for (const [position, timestamp] of [['start', source.start], ['end', source.end]]) {
    run('ffmpeg', [
      '-y', '-ss', String(timestamp),
      '-i', resolve(outputDir, `can-film-${source.id}-desktop.mp4`),
      '-frames:v', '1', '-an', '-c:v', 'libwebp',
      '-lossless', '0', '-quality', '86', '-compression_level', '6',
      resolve(outputDir, `can-film-${source.id}-${position}.webp`),
    ])
  }
}

run(process.execPath, [resolve(root, 'scripts/verify-videos.mjs')])
