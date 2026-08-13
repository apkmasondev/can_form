import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { finishes, variants, type FinishId, type VariantId } from '../config/variants'

export type TextureStatus =
  | { state: 'idle' }
  | { state: 'loading'; label?: string }
  | { state: 'notice'; message: string }
  | { state: 'error'; message: string }

type ConfiguratorProps = {
  activeVariant: VariantId
  activeFinish: FinishId
  status: TextureStatus
  disabled: boolean
  onVariant: (id: Exclude<VariantId, 'custom'>) => void
  onFinish: (id: FinishId) => void
  onCustomTexture: (url: string, label: string) => Promise<void>
  onResetCustom: () => void
  onStatus: (status: TextureStatus) => void
  onExport: () => Promise<Blob>
}

const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxBytes = 10 * 1024 * 1024
const minWidth = 512
const minHeight = 256
// The body UV is a 2:1 unwrap. Artwork outside this tolerance still maps, but it
// is stretched around the circumference, so the user is told rather than blocked.
const targetAspect = 2
const aspectTolerance = 0.12

type Decoded = { width: number; height: number }

async function decodeDimensions(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    const decoded = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return decoded
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    image.src = url
  })
}

export function Configurator({
  activeVariant,
  activeFinish,
  status,
  disabled,
  onVariant,
  onFinish,
  onCustomTexture,
  onResetCustom,
  onStatus,
  onExport,
}: ConfiguratorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const exportResetTimerRef = useRef(0)
  const [fileName, setFileName] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'done'>('idle')
  const noteId = useId()
  const statusId = useId()

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    window.clearTimeout(exportResetTimerRef.current)
  }, [])

  const handleFile = async (file?: File) => {
    if (!file) return
    if (!acceptedTypes.has(file.type)) {
      onStatus({ state: 'error', message: 'Use a PNG, JPG or WebP file.' })
      return
    }
    if (file.size === 0) {
      onStatus({ state: 'error', message: 'That file is empty.' })
      return
    }
    if (file.size > maxBytes) {
      onStatus({ state: 'error', message: `The artwork must be smaller than 10 MB — this one is ${(file.size / 1024 / 1024).toFixed(1)} MB.` })
      return
    }

    onStatus({ state: 'loading', label: file.name })
    let decoded: Decoded
    try {
      decoded = await decodeDimensions(file)
    } catch {
      onStatus({ state: 'error', message: 'This image could not be decoded. Try another PNG, JPG or WebP file.' })
      return
    }
    if (decoded.width < minWidth || decoded.height < minHeight) {
      onStatus({ state: 'error', message: `Artwork must be at least ${minWidth}×${minHeight} px — this one is ${decoded.width}×${decoded.height} px.` })
      return
    }

    const aspect = decoded.width / decoded.height
    const offAspect = Math.abs(aspect - targetAspect) / targetAspect > aspectTolerance

    const nextUrl = URL.createObjectURL(file)
    try {
      await onCustomTexture(nextUrl, file.name)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = nextUrl
      setFileName(file.name)
      if (offAspect) {
        onStatus({
          state: 'notice',
          message: `Applied at ${decoded.width}×${decoded.height}. The body unwrap is 2:1, so this artwork is stretched around the can — use the UV template for an exact fit.`,
        })
      }
    } catch {
      URL.revokeObjectURL(nextUrl)
    }
  }

  const reset = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
    onResetCustom()
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return
    void handleFile(event.dataTransfer.files[0])
  }

  const exportPng = async () => {
    window.clearTimeout(exportResetTimerRef.current)
    setExportState('rendering')
    try {
      // Let React paint the busy state before the one-off synchronous GPU read.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const blob = await onExport()
      if (blob.type !== 'image/png' || blob.size < 1024) throw new Error('The PNG export was empty.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `can-form-${activeVariant}-${activeFinish}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportState('done')
      exportResetTimerRef.current = window.setTimeout(() => setExportState('idle'), 2400)
    } catch (cause) {
      setExportState('idle')
      onStatus({ state: 'error', message: cause instanceof Error ? cause.message : 'The PNG could not be exported.' })
    }
  }

  const busy = status.state === 'loading'
  const statusMessage = status.state === 'loading'
    ? `Loading ${status.label ?? 'label'}…`
    : status.state === 'error' || status.state === 'notice'
      ? status.message
      : ''

  const finishIds = Object.keys(finishes) as FinishId[]
  const finishIndex = Math.max(0, finishIds.indexOf(activeFinish))
  // Live spec readouts, so each control block states what it is currently set to
  // instead of relying on the highlighted chip alone.
  const labelReadout = fileName
    ? 'Custom / uploaded'
    : variants.find((variant) => variant.id === activeVariant)?.edition ?? 'Custom'

  return (
    <section className="configurator ticked" aria-labelledby="configurator-title">
      <div className="configurator__heading">
        <span className="eyebrow">03 / Identity</span>
        <h2 id="configurator-title">Make it yours.</h2>
        <p>Drag sideways to rotate. Scroll stays native.</p>
      </div>

      <div className="control-group" data-index="01">
        <div className="control-head">
          <span className="control-label" id={`${statusId}-label-group`}>Label</span>
          <i className="control-rule" aria-hidden="true" />
          <span className="control-readout">{labelReadout}</span>
        </div>
        <div className="variant-list" role="group" aria-labelledby={`${statusId}-label-group`}>
          {variants.map((variant) => (
            <button
              key={variant.id}
              className="variant-button"
              data-active={activeVariant === variant.id}
              type="button"
              disabled={disabled}
              aria-pressed={activeVariant === variant.id}
              aria-label={`${variant.name} label — ${variant.edition}`}
              onClick={() => onVariant(variant.id)}
            >
              <span className="variant-button__swatch" style={{ background: variant.color }} aria-hidden="true" />
              <span className="variant-button__name">{variant.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="control-group control-group--finish" data-index="02">
        <div className="control-head">
          <span className="control-label" id={`${statusId}-finish-group`}>Finish</span>
          <i className="control-rule" aria-hidden="true" />
          <span className="control-readout">{finishes[activeFinish].label}</span>
        </div>
        <div
          className="finish-list"
          role="group"
          aria-labelledby={`${statusId}-finish-group`}
          style={{ '--finish-index': finishIndex } as CSSProperties}
        >
          {finishIds.map((finish) => (
            <button
              key={finish}
              className="finish-button"
              type="button"
              disabled={disabled}
              data-active={activeFinish === finish}
              aria-pressed={activeFinish === finish}
              onClick={() => onFinish(finish)}
            >
              {finishes[finish].label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="upload-control"
        data-drag={dragActive}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        data-index="03"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <div className="configurator-actions">
          <button
            className="button button--primary upload-button"
            type="button"
            disabled={disabled || busy || exportState === 'rendering'}
            aria-describedby={noteId}
            onClick={() => inputRef.current?.click()}
          >
            <span>{fileName ? 'Replace artwork' : 'Try your label'}</span>
            <span className="button__icon" aria-hidden="true">↗</span>
          </button>
          <button
            className="button button--ghost export-button"
            type="button"
            disabled={disabled || busy || exportState === 'rendering'}
            aria-describedby={`${noteId}-export`}
            onClick={() => void exportPng()}
          >
            <span>{exportState === 'rendering' ? 'Rendering…' : exportState === 'done' ? 'PNG ready' : 'Export PNG'}</span>
            <span className="button__icon" aria-hidden="true">{exportState === 'done' ? '✓' : '↓'}</span>
          </button>
        </div>
        <span className="visually-hidden" id={`${noteId}-export`}>Download a high-resolution PNG of the current label, finish and rotation.</span>

        {fileName ? (
          <p className="upload-file">
            <span className="upload-file__name" title={fileName}>{fileName}</span>
            <button className="link-button" type="button" onClick={reset}>Reset</button>
          </p>
        ) : null}

        <p className="upload-note" id={noteId}>
          <span>PNG · JPG · WEBP</span>
          <span>2:1</span>
          <span>Max 10 MB</span>
          <span>Local preview only</span>
          <a href={`${import.meta.env.BASE_URL}downloads/can-uv-template.svg`} download>UV template ↓</a>
        </p>

        <p className="status-line" data-state={status.state} role="status" aria-live="polite">
          {busy ? <span className="status-line__spinner" aria-hidden="true" /> : null}
          <span>{statusMessage}</span>
        </p>
      </div>
    </section>
  )
}
