import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { filmVariantFor, filmVariants, type FilmSequenceAssets, type FilmVariantId } from '../config/films'
import { activeChapter, calibrationPoints, chapterCount, clamp, filmFps, inverseLerp, rangeOpacity, smoothstep, timeline } from '../config/timeline'
import type { FinishId, VariantId } from '../config/variants'
import type { ExperiencePreferences, QualityTier } from '../hooks/usePreferences'
import type { CanExperience } from '../webgl/CanExperience'
import type { ExportMetadata } from '../webgl/CanExperience'
import { DebugPanel, type DebugSnapshot } from './DebugPanel'
import { VideoLayer } from './VideoLayer'

export type StageHandle = {
  setTexture: (url: string, id: VariantId) => Promise<void>
  setFinish: (id: FinishId) => void
  exportImage: (metadata: ExportMetadata) => Promise<Blob>
  replay: () => void
}

type ExperienceStageProps = {
  preferences: ExperiencePreferences
  runtimeQuality: QualityTier
  initialTexture: string
  selectedVariant: VariantId
  cinematicEnabled: boolean
  onReady: () => void
  onError: (message: string) => void
  onContextLost: () => void
  onContextRestored: () => void
  onQualityChange: (quality: QualityTier) => void
  children: ReactNode
}

const emptySnapshot: DebugSnapshot = {
  progress: 0,
  target: 0,
  chapter: 0,
  film1Time: 0,
  film2Time: 0,
  variant: 'noir',
  fps: 60,
  dpr: 1,
  quality: 'HIGH',
  triangles: 0,
  calls: 0,
  camera: '0, 0, 0',
  light: '0, 0',
}

const chapterTitles = ['Product, reformed', 'Surface', 'Identity', 'Open', 'Ready to pour']

function setVisibility(element: HTMLElement | null, opacity: number) {
  if (!element) return
  element.style.opacity = opacity.toFixed(4)
  element.style.visibility = opacity > 0.001 ? 'visible' : 'hidden'
}

function updateCopy(element: HTMLElement | null, opacity: number) {
  if (!element) return
  element.style.opacity = opacity.toFixed(4)
  element.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`
  element.style.visibility = opacity > 0.002 ? 'visible' : 'hidden'
}

/**
 * Maps eased scroll progress onto an exact 24 fps frame index and seeks the
 * paused element there. Frame indices are compared instead of raw times so a
 * fast or reversed scroll issues at most one seek per source frame.
 */
function syncVideo(video: HTMLVideoElement | null, progress: number, start: number, end: number, lastFrame: { current: number }) {
  if (!video || !video.src) return 0
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return 0
  if (!Number.isFinite(video.duration) || video.duration <= 0) return 0
  const lastIndex = Math.max(1, Math.round(video.duration * filmFps) - 1)
  const frame = Math.round(inverseLerp(start, end, progress) * lastIndex)
  const time = Math.min(video.duration - 0.5 / filmFps, frame / filmFps)
  if (frame !== lastFrame.current) {
    lastFrame.current = frame
    if (Math.abs(video.currentTime - time) > 0.5 / filmFps) video.currentTime = time
  }
  return time
}

export const ExperienceStage = forwardRef<StageHandle, ExperienceStageProps>(function ExperienceStage({
  preferences,
  runtimeQuality,
  initialTexture,
  selectedVariant,
  cinematicEnabled,
  onReady,
  onError,
  onContextLost,
  onContextRestored,
  onQualityChange,
  children,
}, forwardedRef) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const experienceRef = useRef<CanExperience | null>(null)
  const pendingTexture = useRef<{ url: string; id: VariantId } | null>(null)
  const targetProgress = useRef(0)
  const easedProgress = useRef(0)
  const progressSeeded = useRef(false)
  const rafRef = useRef(0)
  const previousTime = useRef(performance.now())
  const currentChapter = useRef(-1)
  const pageVisible = useRef(!document.hidden)
  const film1Assigned = useRef<string | null>(null)
  const film2Assigned = useRef<string | null>(null)
  const film1LastFrame = useRef(-1)
  const film2LastFrame = useRef(-1)
  const film1VideoRef = useRef<HTMLVideoElement>(null)
  const film2VideoRef = useRef<HTMLVideoElement>(null)
  const film1LayerRef = useRef<HTMLDivElement>(null)
  const film2LayerRef = useRef<HTMLDivElement>(null)
  const film1StartPosterRef = useRef<HTMLImageElement>(null)
  const film1EndPosterRef = useRef<HTMLImageElement>(null)
  const film2StartPosterRef = useRef<HTMLImageElement>(null)
  const film2EndPosterRef = useRef<HTMLImageElement>(null)
  const heroCopyRef = useRef<HTMLDivElement>(null)
  const surfaceCopyRef = useRef<HTMLDivElement>(null)
  const openCopyRef = useRef<HTMLDivElement>(null)
  const finalCopyRef = useRef<HTMLDivElement>(null)
  const progressFillRef = useRef<HTMLSpanElement>(null)
  const chapterNumberRef = useRef<HTMLSpanElement>(null)
  const chapterStatusRef = useRef<HTMLParagraphElement>(null)
  const variantRef = useRef<VariantId>(selectedVariant)
  const requestedFilmVariant = useRef<FilmVariantId>(filmVariantFor(selectedVariant))
  const debugLastUpdate = useRef(0)
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1'
  const [snapshot, setSnapshot] = useState<DebugSnapshot>({ ...emptySnapshot, dpr: preferences.dpr, quality: preferences.quality })

  const setPosterSource = (image: HTMLImageElement | null, source: string) => {
    if (!image) return
    image.dataset.src = source
    if (image.getAttribute('src') !== source) image.src = source
  }

  const assignVideoSource = (video: HTMLVideoElement | null, kind: 1 | 2, requested = filmVariantFor(variantRef.current)) => {
    const sequence: FilmSequenceAssets = kind === 1 ? filmVariants[requested].one : filmVariants[requested].two
    setPosterSource(kind === 1 ? film1StartPosterRef.current : film2StartPosterRef.current, sequence.start)
    setPosterSource(kind === 1 ? film1EndPosterRef.current : film2EndPosterRef.current, sequence.end)
    if (!video || preferences.reducedMotion || !cinematicEnabled) return
    const assigned = kind === 1 ? film1Assigned : film2Assigned
    const sourceKey = `${requested}-${preferences.mobile ? 'mobile' : 'desktop'}`
    if (assigned.current === sourceKey) return
    assigned.current = sourceKey
    const layer = kind === 1 ? film1LayerRef.current : film2LayerRef.current
    const lastFrame = kind === 1 ? film1LastFrame : film2LastFrame
    lastFrame.current = -1
    layer?.classList.remove('has-error')
    video.classList.remove('is-frame-ready')
    video.preload = 'auto'
    video.src = preferences.mobile ? sequence.mobile : sequence.desktop
    video.load()
  }

  useEffect(() => {
    variantRef.current = selectedVariant
    const next = filmVariantFor(selectedVariant)
    stageRef.current?.setAttribute('data-film-variant', next)
    if (requestedFilmVariant.current === next) return
    requestedFilmVariant.current = next

    // The configurator sits between the films. Prioritise film 2 for the
    // natural forward journey, then prepare film 1 shortly afterwards so a
    // reverse scroll is also seamless. Both layers are hidden during the swap.
    assignVideoSource(film2VideoRef.current, 2, next)
    const reverseLoad = window.setTimeout(() => assignVideoSource(film1VideoRef.current, 1, next), 320)
    return () => window.clearTimeout(reverseLoad)
  }, [selectedVariant, cinematicEnabled, preferences.mobile, preferences.reducedMotion])

  useImperativeHandle(forwardedRef, () => ({
    setTexture: async (url, id) => {
      const experience = experienceRef.current
      // The engine is lazy-loaded after the shell, so a variant can be picked
      // before it exists. Queue it instead of rejecting.
      if (!experience) {
        pendingTexture.current = { url, id }
        return
      }
      await experience.setTexture(url, id)
    },
    setFinish: (id) => experienceRef.current?.setFinish(id),
    exportImage: async (metadata) => {
      const experience = experienceRef.current
      if (!experience) throw new Error('The 3D product is still loading.')
      return experience.exportImage(metadata)
    },
    replay: () => {
      const wrapper = wrapperRef.current
      if (wrapper) window.scrollTo({ top: wrapper.offsetTop, behavior: preferences.reducedMotion ? 'auto' : 'smooth' })
    },
  }), [preferences.reducedMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    void import('../webgl/CanExperience')
      .then(async ({ CanExperience: Experience }) => {
        if (cancelled) return
        let experience: CanExperience
        try {
          experience = new Experience(canvas, preferences, {
            onReady,
            onError: (error) => onError(error.message),
            onContextLost,
            onContextRestored,
            onQualityChange,
          })
        } catch (cause) {
          onError(cause instanceof Error ? cause.message : 'WebGL is unavailable.')
          return
        }
        experienceRef.current = experience
        await experience.initialize(initialTexture, easedProgress.current)
        if (cancelled) return
        const queued = pendingTexture.current
        pendingTexture.current = null
        if (queued) await experience.setTexture(queued.url, queued.id)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        onError(cause instanceof Error ? cause.message : 'Unable to load the WebGL engine.')
      })
    return () => {
      cancelled = true
      experienceRef.current?.dispose()
      experienceRef.current = null
    }
  }, [initialTexture, onContextLost, onContextRestored, onError, onQualityChange, onReady, preferences])

  useEffect(() => {
    const updateTarget = () => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const distance = Math.max(1, wrapper.offsetHeight - innerHeight)
      targetProgress.current = clamp((scrollY - wrapper.offsetTop) / distance)
      // A reload or back-navigation restores the scroll offset. Starting the
      // eased value at 0 would replay the whole timeline once on arrival.
      if (!progressSeeded.current) {
        progressSeeded.current = true
        easedProgress.current = targetProgress.current
      }
    }
    updateTarget()
    window.addEventListener('scroll', updateTarget, { passive: true })
    window.addEventListener('resize', updateTarget, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateTarget)
      window.removeEventListener('resize', updateTarget)
    }
  }, [])

  useEffect(() => {
    const idleLoad = window.setTimeout(() => assignVideoSource(film1VideoRef.current, 1), 1100)
    const handleVisibility = () => {
      pageVisible.current = !document.hidden
      previousTime.current = performance.now()
      if (pageVisible.current && !rafRef.current) rafRef.current = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    function frame(now: number) {
      rafRef.current = 0
      if (!pageVisible.current) return
      const delta = Math.min((now - previousTime.current) / 1000, 0.05)
      previousTime.current = now
      const damping = preferences.reducedMotion ? 24 : preferences.mobile ? 15 : 10
      const response = 1 - Math.exp(-damping * delta)
      easedProgress.current += (targetProgress.current - easedProgress.current) * response
      if (Math.abs(targetProgress.current - easedProgress.current) < 0.00008) easedProgress.current = targetProgress.current
      const progress = clamp(easedProgress.current)
      const chapter = activeChapter(progress)
      if (chapter !== currentChapter.current) {
        currentChapter.current = chapter
        stageRef.current?.setAttribute('data-chapter', String(chapter))
        if (chapterNumberRef.current) chapterNumberRef.current.textContent = `0${chapter + 1}`
        if (chapterStatusRef.current) {
          chapterStatusRef.current.textContent = `Chapter ${chapter + 1} of ${chapterCount} — ${chapterTitles[chapter] ?? ''}`
        }
      }

      if (targetProgress.current > 0.055) assignVideoSource(film1VideoRef.current, 1)
      if (targetProgress.current > 0.46) assignVideoSource(film2VideoRef.current, 2)

      const film1Local = inverseLerp(timeline.film1Scrub[0], timeline.film1Scrub[1], progress)
      const film2Local = inverseLerp(timeline.film2Scrub[0], timeline.film2Scrub[1], progress)
      const film1LayerOpacity = preferences.reducedMotion
        ? rangeOpacity(progress, timeline.film1[0] + 0.02, timeline.film1[1] - 0.02, 0.045)
        : rangeOpacity(progress, timeline.film1[0], timeline.film1[1], 0.025)
      // The wet, photoreal source tab cannot register exactly with the lean
      // realtime geometry. A long dissolve at the rim creates a doubled tab, so
      // film 2 dissolves in softly and then cuts within a sub-pixel interval at
      // the matched rim. The entrance stays a real crossfade: cutting there too
      // popped the frame straight out of the WebGL full-can pose.
      const film2LayerOpacity = preferences.reducedMotion
        ? rangeOpacity(progress, timeline.film2[0] + 0.01, timeline.film2[1] - 0.018, 0.045)
        : rangeOpacity(progress, timeline.film2[0], timeline.film2[1], 0.02, 0.0001)
      setVisibility(film1LayerRef.current, film1LayerOpacity)
      setVisibility(film2LayerRef.current, film2LayerOpacity)
      if (film1StartPosterRef.current) film1StartPosterRef.current.style.opacity = String(1 - smoothstep(0.58, 0.88, film1Local))
      if (film1EndPosterRef.current) film1EndPosterRef.current.style.opacity = String(smoothstep(0.58, 0.88, film1Local))
      if (film2StartPosterRef.current) film2StartPosterRef.current.style.opacity = String(1 - smoothstep(0.56, 0.9, film2Local))
      if (film2EndPosterRef.current) film2EndPosterRef.current.style.opacity = String(smoothstep(0.56, 0.9, film2Local))

      let film1Time = 0
      let film2Time = 0
      if (!preferences.reducedMotion && film1LayerOpacity > 0.002) {
        film1Time = syncVideo(film1VideoRef.current, progress, timeline.film1Scrub[0], timeline.film1Scrub[1], film1LastFrame)
      }
      if (!preferences.reducedMotion && film2LayerOpacity > 0.002) {
        film2Time = syncVideo(film2VideoRef.current, progress, timeline.film2Scrub[0], timeline.film2Scrub[1], film2LastFrame)
      }

      updateCopy(heroCopyRef.current, rangeOpacity(progress, timeline.hero[0], timeline.hero[1], 0.035))
      updateCopy(surfaceCopyRef.current, rangeOpacity(progress, timeline.surfaceCopy[0], timeline.surfaceCopy[1], 0.03))
      updateCopy(openCopyRef.current, rangeOpacity(progress, timeline.openCopy[0], timeline.openCopy[1], 0.03))
      updateCopy(finalCopyRef.current, smoothstep(0.935, 0.98, progress))
      if (progressFillRef.current) progressFillRef.current.style.transform = `scaleY(${progress.toFixed(4)})`

      experienceRef.current?.render(progress, delta)
      if (debugEnabled && now - debugLastUpdate.current > 250 && experienceRef.current) {
        debugLastUpdate.current = now
        setSnapshot({
          ...experienceRef.current.getStats(),
          progress,
          target: targetProgress.current,
          chapter,
          film1Time,
          film2Time,
          variant: variantRef.current,
        })
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      window.clearTimeout(idleLoad)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    // `selectedVariant` is deliberately read through a ref: putting it in the
    // dependency list tore down and rebuilt the scroll loop on every click.
  }, [cinematicEnabled, debugEnabled, preferences])

  useEffect(() => {
    if (!debugEnabled) return
    const shortcuts = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      const point = calibrationPoints[index]
      const wrapper = wrapperRef.current
      if (point === undefined || !wrapper || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      const top = wrapper.offsetTop + point * (wrapper.offsetHeight - innerHeight)
      window.scrollTo({ top, behavior: 'auto' })
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  }, [debugEnabled])

  const markVideoReady = (video: HTMLVideoElement | null) => video?.classList.add('is-frame-ready')
  const markVideoError = (layer: HTMLDivElement | null) => layer?.classList.add('has-error')

  return (
    <div ref={wrapperRef} className="experience-scroll" id="top">
      <div ref={stageRef} className="experience-stage" data-chapter="0" data-quality={runtimeQuality.toLowerCase()}>
        <canvas
          ref={canvasRef}
          className="webgl-canvas"
          role="img"
          aria-label="Interactive 3D aluminum can. Drag horizontally in the configurator to rotate."
        />

        <VideoLayer
          id="one"
          videoRef={film1VideoRef}
          layerRef={film1LayerRef}
          startPosterRef={film1StartPosterRef}
          endPosterRef={film1EndPosterRef}
          startPoster={filmVariants.noir.one.start}
          endPoster={filmVariants.noir.one.end}
          onReady={() => markVideoReady(film1VideoRef.current)}
          onError={() => markVideoError(film1LayerRef.current)}
        />
        <VideoLayer
          id="two"
          videoRef={film2VideoRef}
          layerRef={film2LayerRef}
          startPosterRef={film2StartPosterRef}
          endPosterRef={film2EndPosterRef}
          startPoster={filmVariants.noir.two.start}
          endPoster={filmVariants.noir.two.end}
          onReady={() => markVideoReady(film2VideoRef.current)}
          onError={() => markVideoError(film2LayerRef.current)}
          deferPosters
        />

        <div className="atmosphere" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />

        <header className="site-header">
          <a className="wordmark" href="#top" aria-label="CAN FORM — back to the beginning">CAN<span>//</span>FORM</a>
          <div className="header-meta"><span>Interactive product system</span><span>2026 / 330 ML</span></div>
        </header>

        <div ref={heroCopyRef} className="story-copy hero-copy">
          <span className="eyebrow">01 / Product, reformed</span>
          <h1>Your label.<br />In motion.</h1>
          <div className="hero-support">
            <p>A configurable packaging system — rendered in real time.</p>
            <span className="scroll-cue">Scroll to explore <i /></span>
          </div>
        </div>

        <div ref={surfaceCopyRef} className="story-copy cinematic-copy cinematic-copy--surface">
          <span className="eyebrow">02 / Surface</span>
          <h2>Cold aluminum.<br />Controlled light.</h2>
          <p>Condensation / finish / precision</p>
        </div>

        <div ref={openCopyRef} className="story-copy cinematic-copy cinematic-copy--open">
          <span className="eyebrow">04 / Open</span>
          <h2>Pressure,<br />released.</h2>
          <p>Cold / detail / ritual</p>
        </div>

        <div ref={finalCopyRef} className="story-copy final-copy">
          <span className="eyebrow">05 / Ready to pour</span>
          <h2>Product,<br />made interactive.</h2>
          <div className="final-actions">
            <a className="button button--primary" href="mailto:hello@canform.studio">
              <span>Start a project</span>
              <span aria-hidden="true">↗</span>
            </a>
            <button className="button button--ghost" type="button" onClick={() => {
              const wrapper = wrapperRef.current
              if (wrapper) window.scrollTo({ top: wrapper.offsetTop, behavior: preferences.reducedMotion ? 'auto' : 'smooth' })
            }}>
              <span>Replay</span>
            </button>
          </div>
        </div>

        {children}

        <div className="chapter-progress" aria-hidden="true">
          <span ref={chapterNumberRef} className="chapter-progress__number">01</span>
          <span className="chapter-progress__track"><span ref={progressFillRef} /></span>
          <span className="chapter-progress__total">0{chapterCount}</span>
        </div>

        <p ref={chapterStatusRef} className="visually-hidden" role="status" aria-live="polite" />

        <footer className="stage-footer">
          <span className="footer-credit">
            <span>© CAN//FORM</span>
            <span className="footer-credit__separator" aria-hidden="true">/</span>
            <span>Crafted by <a href="https://apkmason.dev/" target="_blank" rel="noreferrer" aria-label="APKMason.dev — project author">APKMason.dev</a></span>
          </span>
          <span>WebGL / Film / Identity</span>
        </footer>

        {debugEnabled ? <DebugPanel snapshot={snapshot} /> : null}
      </div>
    </div>
  )
})
