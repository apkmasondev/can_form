import type { RefObject } from 'react'

type VideoLayerProps = {
  id: string
  videoRef: RefObject<HTMLVideoElement | null>
  layerRef: RefObject<HTMLDivElement | null>
  startPosterRef: RefObject<HTMLImageElement | null>
  endPosterRef: RefObject<HTMLImageElement | null>
  startPoster: string
  endPoster: string
  onReady: () => void
  onError: () => void
  deferPosters?: boolean
}

export function VideoLayer({ id, videoRef, layerRef, startPosterRef, endPosterRef, startPoster, endPoster, onReady, onError, deferPosters = false }: VideoLayerProps) {
  return (
    <div ref={layerRef} className={`video-layer video-layer--${id}`} aria-hidden="true">
      <img ref={startPosterRef} className="video-poster video-poster--start" src={deferPosters ? undefined : startPoster} data-src={startPoster} alt="" decoding="async" />
      <img ref={endPosterRef} className="video-poster video-poster--end" src={deferPosters ? undefined : endPoster} data-src={endPoster} alt="" decoding="async" />
      <video
        ref={videoRef}
        className="cinematic-video"
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        tabIndex={-1}
        onLoadedData={onReady}
        onSeeked={onReady}
        onError={onError}
      />
    </div>
  )
}
