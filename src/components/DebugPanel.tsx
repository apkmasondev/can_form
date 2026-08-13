import { useState } from 'react'
import film1Start from '../assets/media/can-film-01-start.webp'
import film1End from '../assets/media/can-film-01-end.webp'
import film2Start from '../assets/media/can-film-02-start.webp'
import film2End from '../assets/media/can-film-02-end.webp'
import type { RenderStats } from '../webgl/CanExperience'

export type DebugSnapshot = RenderStats & {
  progress: number
  target: number
  chapter: number
  film1Time: number
  film2Time: number
  variant: string
}

const references = {
  off: '',
  film1Start,
  film1End,
  film2Start,
  film2End,
}

export function DebugPanel({ snapshot }: { snapshot: DebugSnapshot }) {
  const [reference, setReference] = useState<keyof typeof references>('off')
  const [opacity, setOpacity] = useState(0.5)
  const source = references[reference]

  return (
    <>
      {source ? <img className="debug-reference" src={source} style={{ opacity }} alt="Calibration reference" /> : null}
      <aside className="debug-panel" aria-label="Developer calibration panel">
        <strong>CALIBRATION</strong>
        <code>p {snapshot.progress.toFixed(4)} / target {snapshot.target.toFixed(4)}</code>
        <code>chapter {snapshot.chapter} / variant {snapshot.variant}</code>
        <code>film 1 {snapshot.film1Time.toFixed(3)}s</code>
        <code>film 2 {snapshot.film2Time.toFixed(3)}s</code>
        <code>{snapshot.fps} fps / DPR {snapshot.dpr} / {snapshot.quality}</code>
        <code>{snapshot.triangles.toLocaleString()} tris / {snapshot.calls} calls</code>
        <code>light {snapshot.light}</code>
        <code>label {snapshot.label}</code>
        <label>
          Reference
          <select value={reference} onChange={(event) => setReference(event.target.value as keyof typeof references)}>
            {Object.keys(references).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <label>
          Opacity {opacity.toFixed(2)}
          <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
        </label>
        <small>Keys 1–7 jump to calibration points.</small>
      </aside>
    </>
  )
}
