import noir1Desktop from '../assets/media/can-film-01-desktop.mp4'
import noir1Mobile from '../assets/media/can-film-01-mobile.mp4'
import noir1Start from '../assets/media/can-film-01-start.webp'
import noir1End from '../assets/media/can-film-01-end.webp'
import noir2Desktop from '../assets/media/can-film-02-desktop.mp4'
import noir2Mobile from '../assets/media/can-film-02-mobile.mp4'
import noir2Start from '../assets/media/can-film-02-start.webp'
import noir2End from '../assets/media/can-film-02-end.webp'
import lime1Desktop from '../assets/media/can-film-01-lime-desktop.mp4'
import lime1Mobile from '../assets/media/can-film-01-lime-mobile.mp4'
import lime1Start from '../assets/media/can-film-01-lime-start.webp'
import lime1End from '../assets/media/can-film-01-lime-end.webp'
import lime2Desktop from '../assets/media/can-film-02-lime-desktop.mp4'
import lime2Mobile from '../assets/media/can-film-02-lime-mobile.mp4'
import lime2Start from '../assets/media/can-film-02-lime-start.webp'
import lime2End from '../assets/media/can-film-02-lime-end.webp'
import cherry1Desktop from '../assets/media/can-film-01-cherry-desktop.mp4'
import cherry1Mobile from '../assets/media/can-film-01-cherry-mobile.mp4'
import cherry1Start from '../assets/media/can-film-01-cherry-start.webp'
import cherry1End from '../assets/media/can-film-01-cherry-end.webp'
import cherry2Desktop from '../assets/media/can-film-02-cherry-desktop.mp4'
import cherry2Mobile from '../assets/media/can-film-02-cherry-mobile.mp4'
import cherry2Start from '../assets/media/can-film-02-cherry-start.webp'
import cherry2End from '../assets/media/can-film-02-cherry-end.webp'
import zero1Desktop from '../assets/media/can-film-01-zero-desktop.mp4'
import zero1Mobile from '../assets/media/can-film-01-zero-mobile.mp4'
import zero1Start from '../assets/media/can-film-01-zero-start.webp'
import zero1End from '../assets/media/can-film-01-zero-end.webp'
import zero2Desktop from '../assets/media/can-film-02-zero-desktop.mp4'
import zero2Mobile from '../assets/media/can-film-02-zero-mobile.mp4'
import zero2Start from '../assets/media/can-film-02-zero-start.webp'
import zero2End from '../assets/media/can-film-02-zero-end.webp'
import type { VariantId } from './variants'

export type FilmVariantId = 'noir' | 'lime' | 'cherry' | 'zero'

export type FilmSequenceAssets = {
  desktop: string
  mobile: string
  start: string
  end: string
}

export type FilmVariantAssets = {
  one: FilmSequenceAssets
  two: FilmSequenceAssets
}

export const filmVariants: Record<FilmVariantId, FilmVariantAssets> = {
  noir: {
    one: { desktop: noir1Desktop, mobile: noir1Mobile, start: noir1Start, end: noir1End },
    two: { desktop: noir2Desktop, mobile: noir2Mobile, start: noir2Start, end: noir2End },
  },
  lime: {
    one: { desktop: lime1Desktop, mobile: lime1Mobile, start: lime1Start, end: lime1End },
    two: { desktop: lime2Desktop, mobile: lime2Mobile, start: lime2Start, end: lime2End },
  },
  cherry: {
    one: { desktop: cherry1Desktop, mobile: cherry1Mobile, start: cherry1Start, end: cherry1End },
    two: { desktop: cherry2Desktop, mobile: cherry2Mobile, start: cherry2Start, end: cherry2End },
  },
  zero: {
    one: { desktop: zero1Desktop, mobile: zero1Mobile, start: zero1Start, end: zero1End },
    two: { desktop: zero2Desktop, mobile: zero2Mobile, start: zero2Start, end: zero2End },
  },
}

// Custom artwork deliberately falls back to the original Noir cinematics
// because an arbitrary uploaded label cannot have a pre-rendered film.
export function filmVariantFor(variant: VariantId): FilmVariantId {
  return variant === 'lime' || variant === 'cherry' || variant === 'zero' ? variant : 'noir'
}
