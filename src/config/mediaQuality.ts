import type { QualityTier } from '../hooks/usePreferences'

export type FilmRendition = 'desktop' | 'mobile'

/**
 * Compact films are not mobile-only: they are also the adaptive rendition for
 * lower performance tiers on wide screens. This keeps WebGL and video quality
 * decisions aligned instead of reducing only the canvas cost.
 */
export function filmRenditionFor(mobile: boolean, quality: QualityTier): FilmRendition {
  return mobile || quality !== 'HIGH' ? 'mobile' : 'desktop'
}
