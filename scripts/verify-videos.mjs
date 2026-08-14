import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mediaDir = resolve(root, 'src/assets/media')
const expected = [
  'can-film-01',
  'can-film-02',
  'can-film-01-lime',
  'can-film-02-lime',
  'can-film-01-cherry',
  'can-film-02-cherry',
  'can-film-01-zero',
  'can-film-02-zero',
]
  .flatMap((stem) => [
    [`${stem}-desktop.mp4`, 1280, 720],
    [`${stem}-mobile.mp4`, 960, 540],
  ])

function probe(file, entries) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', entries, '-of', 'json', file,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe failed for ${file}`)
  return JSON.parse(result.stdout)
}

function atomOffset(bytes, atom) {
  return bytes.indexOf(Buffer.from(atom, 'ascii'))
}

const report = []
for (const [name, width, height] of expected) {
  const file = resolve(mediaDir, name)
  if (!existsSync(file) || statSync(file).size === 0) throw new Error(`Missing or empty output: ${name}`)

  const metadata = probe(file, 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate')
  const allStreams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', file], { encoding: 'utf8' })
  if (allStreams.status !== 0) throw new Error(allStreams.stderr)
  const streams = JSON.parse(allStreams.stdout).streams ?? []
  const video = metadata.streams?.[0]
  const duration = Number(metadata.format?.duration)
  if (!video || video.width !== width || video.height !== height) throw new Error(`${name}: invalid dimensions`)
  if (video.r_frame_rate !== '24/1' || video.avg_frame_rate !== '24/1') throw new Error(`${name}: expected exact 24 fps`)
  if (streams.some((stream) => stream.codec_type === 'audio')) throw new Error(`${name}: audio stream still exists`)
  if (Math.abs(duration - 10.005) > 0.15) throw new Error(`${name}: unexpected duration ${duration}`)

  const frames = probe(file, 'frame=key_frame,pict_type').frames ?? []
  if (frames.length < 230 || frames.some((frame) => frame.key_frame !== 1 || frame.pict_type !== 'I')) {
    throw new Error(`${name}: GOP=1 verification failed`)
  }

  const bytes = readFileSync(file)
  const moov = atomOffset(bytes, 'moov')
  const mdat = atomOffset(bytes, 'mdat')
  if (moov < 0 || mdat < 0 || moov > mdat) throw new Error(`${name}: faststart/moov atom verification failed`)

  report.push({ name, bytes: statSync(file).size, width, height, fps: 24, duration, frames: frames.length, audio: false, allIntra: true, faststart: true })
}

writeFileSync(resolve(mediaDir, 'video-verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.table(report)
console.log('Video verification passed: no audio, exact dimensions/FPS, GOP=1 and faststart confirmed.')
