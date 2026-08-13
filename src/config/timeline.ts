// Single source of truth for the scroll timeline. Every WebGL camera state,
// video scrub window and copy block is keyed off these numbers so a calibration
// change never has to be mirrored in three different files.
export const timeline = {
  hero: [0, 0.145],
  // Layer visibility window. Wider than the scrub window so the first and last
  // frames are held while the layer dissolves in and out.
  film1: [0.15, 0.425],
  // Frame-accurate scrub window: progress -> frame 0..N of film 1.
  film1Scrub: [0.18, 0.39],
  surfaceCopy: [0.185, 0.36],
  configurator: [0.425, 0.655],
  film2: [0.67, 0.928],
  film2Scrub: [0.69, 0.895],
  openCopy: [0.705, 0.85],
  final: [0.925, 1],
} as const

// Chapter boundaries drive the stage `data-chapter` attribute and the progress
// rail. Derived from the timeline above rather than repeated as literals.
export const chapterStarts = [0, 0.17, 0.425, 0.675, 0.925] as const

export const chapterCount = chapterStarts.length

export const calibrationPoints = [0, 0.17, 0.405, 0.5, 0.675, 0.92, 1] as const

/** Native frame rate of both cinematic sequences. */
export const filmFps = 24

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function inverseLerp(start: number, end: number, value: number) {
  if (end === start) return value < start ? 0 : 1
  return clamp((value - start) / (end - start))
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const x = inverseLerp(edge0, edge1, value)
  return x * x * (3 - 2 * x)
}

/**
 * Opacity envelope for a timeline range. `fadeOut` defaults to `fadeIn`, but the
 * second cinematic needs an asymmetric envelope: it dissolves in softly and then
 * cuts hard at the matched tab rim, where a long dissolve would double the tab.
 */
export function rangeOpacity(progress: number, start: number, end: number, fadeIn = 0.025, fadeOut = fadeIn) {
  const entrance = start <= 0 ? 1 : smoothstep(start, start + fadeIn, progress)
  const exit = fadeOut <= 0 ? (progress >= end ? 0 : 1) : 1 - smoothstep(end - fadeOut, end, progress)
  return entrance * exit
}

export function activeChapter(progress: number) {
  let chapter = 0
  for (let index = 1; index < chapterStarts.length; index += 1) {
    if (progress >= chapterStarts[index]!) chapter = index
  }
  return chapter
}
