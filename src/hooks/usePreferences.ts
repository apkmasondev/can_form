import { useMemo } from 'react'

export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW'

export type ExperiencePreferences = {
  reducedMotion: boolean
  saveData: boolean
  mobile: boolean
  quality: QualityTier
  dpr: number
}

function readMedia(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

export function usePreferences(): ExperiencePreferences {
  return useMemo(() => {
    const mobile = readMedia('(max-width: 767px), (pointer: coarse)')
    const reducedMotion = readMedia('(prefers-reduced-motion: reduce)')
    const saveData = navigator.connection?.saveData === true
    const memory = navigator.deviceMemory ?? 8
    const cores = navigator.hardwareConcurrency ?? 8
    let quality: QualityTier = 'HIGH'
    if (mobile || memory <= 6 || cores <= 6) quality = 'MEDIUM'
    if (saveData || memory <= 3 || cores <= 4) quality = 'LOW'
    const dpr = quality === 'LOW' ? 1 : mobile ? Math.min(devicePixelRatio, quality === 'HIGH' ? 1.4 : 1.2) : Math.min(devicePixelRatio, quality === 'HIGH' ? 1.5 : 1.25)
    return { reducedMotion, saveData, mobile, quality, dpr }
  }, [])
}
