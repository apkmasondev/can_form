import noirDesktop from '../assets/textures/noir-2048.webp'
import noirMobile from '../assets/textures/noir-1024.webp'
import limeDesktop from '../assets/textures/lime-2048.webp'
import limeMobile from '../assets/textures/lime-1024.webp'
import cherryDesktop from '../assets/textures/cherry-2048.webp'
import cherryMobile from '../assets/textures/cherry-1024.webp'
import zeroDesktop from '../assets/textures/zero-2048.webp'
import zeroMobile from '../assets/textures/zero-1024.webp'

export type VariantId = 'noir' | 'lime' | 'cherry' | 'zero' | 'custom'
export type FinishId = 'matte' | 'satin' | 'metallic'

export type CanVariant = {
  id: Exclude<VariantId, 'custom'>
  name: string
  edition: string
  color: string
  texture: { desktop: string; mobile: string }
  roughness: number
  metalness: number
}

export const variants: CanVariant[] = [
  { id: 'noir', name: 'Noir', edition: 'Mineral / 01', color: '#171819', texture: { desktop: noirDesktop, mobile: noirMobile }, roughness: 0.31, metalness: 0.64 },
  { id: 'lime', name: 'Lime', edition: 'Citrus / 02', color: '#B9E23C', texture: { desktop: limeDesktop, mobile: limeMobile }, roughness: 0.36, metalness: 0.56 },
  { id: 'cherry', name: 'Cherry', edition: 'Tart / 03', color: '#B73245', texture: { desktop: cherryDesktop, mobile: cherryMobile }, roughness: 0.34, metalness: 0.58 },
  { id: 'zero', name: 'Zero', edition: 'Pure / 00', color: '#CFE5F7', texture: { desktop: zeroDesktop, mobile: zeroMobile }, roughness: 0.3, metalness: 0.62 },
]

export const finishes: Record<FinishId, { label: string; roughness: number; metalness: number; clearcoat: number }> = {
  matte: { label: 'Matte', roughness: 0.54, metalness: 0.46, clearcoat: 0.04 },
  satin: { label: 'Satin', roughness: 0.31, metalness: 0.62, clearcoat: 0.16 },
  metallic: { label: 'Metallic', roughness: 0.21, metalness: 0.82, clearcoat: 0.08 },
}
