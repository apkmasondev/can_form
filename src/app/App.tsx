import { useCallback, useEffect, useRef, useState } from 'react'
import fallbackPoster from '../assets/media/can-film-01-end.webp'
import { Configurator, type TextureStatus } from '../components/Configurator'
import { ExperienceStage, type StageHandle } from '../components/ExperienceStage'
import { filmRenditionFor } from '../config/mediaQuality'
import { variants, type FinishId, type VariantId } from '../config/variants'
import { usePreferences, type QualityTier } from '../hooks/usePreferences'

// Combined transfer size of the two cinematic renditions, used by the
// Save-Data prompt so the number the user is asked to approve is truthful.
const filmWeight = { desktop: '11.3 MB', mobile: '6.6 MB' } as const

export function App() {
  const preferences = usePreferences()
  const stageRef = useRef<StageHandle>(null)
  const [ready, setReady] = useState(false)
  const [webglError, setWebglError] = useState('')
  const [contextLost, setContextLost] = useState(false)
  const [activeVariant, setActiveVariant] = useState<VariantId>('noir')
  const [activeFinish, setActiveFinish] = useState<FinishId>('satin')
  const [cinematicEnabled, setCinematicEnabled] = useState(!preferences.saveData)
  const [runtimeQuality, setRuntimeQuality] = useState<QualityTier>(preferences.quality)
  const [textureStatus, setTextureStatus] = useState<TextureStatus>({ state: 'idle' })
  const filmRendition = filmRenditionFor(preferences.mobile, runtimeQuality)

  useEffect(() => {
    document.documentElement.dataset.motion = preferences.reducedMotion ? 'reduced' : 'full'
    document.documentElement.dataset.saveData = preferences.saveData ? 'true' : 'false'
  }, [preferences.reducedMotion, preferences.saveData])

  const onReady = useCallback(() => setReady(true), [])
  const onError = useCallback((message: string) => {
    setWebglError(message)
    setReady(true)
  }, [])
  const onContextLost = useCallback(() => setContextLost(true), [])
  const onContextRestored = useCallback(() => setContextLost(false), [])
  const onQualityChange = useCallback((quality: QualityTier) => setRuntimeQuality(quality), [])

  const chooseVariant = (id: Exclude<VariantId, 'custom'>) => {
    const variant = variants.find((item) => item.id === id)
    if (!variant) return
    const previous = activeVariant
    setActiveVariant(id)
    setTextureStatus({ state: 'loading', label: variant.name })
    const url = preferences.mobile ? variant.texture.mobile : variant.texture.desktop
    // Without this catch a failed decode became an unhandled rejection and the
    // control silently kept the new selection highlighted.
    stageRef.current?.setTexture(url, id)
      .then(() => setTextureStatus({ state: 'idle' }))
      .catch(() => {
        setActiveVariant(previous)
        setTextureStatus({ state: 'error', message: `${variant.name} could not be loaded. Check your connection and try again.` })
      })
  }

  const chooseFinish = (id: FinishId) => {
    setActiveFinish(id)
    stageRef.current?.setFinish(id)
  }

  const useCustomTexture = async (url: string, label: string) => {
    setTextureStatus({ state: 'loading', label })
    try {
      await stageRef.current?.setTexture(url, 'custom')
      setActiveVariant('custom')
      setTextureStatus({ state: 'idle' })
    } catch (cause) {
      setTextureStatus({ state: 'error', message: 'This image could not be decoded. Try another PNG, JPG or WebP file.' })
      throw cause
    }
  }

  const resetCustom = () => chooseVariant('noir')

  const exportImage = async () => {
    const variant = variants.find((item) => item.id === activeVariant)
    const blob = await stageRef.current?.exportImage({
      variant: variant?.name ?? 'Custom',
      finish: activeFinish,
    })
    if (!blob) throw new Error('The 3D product is still loading.')
    return blob
  }

  return (
    <main>
      <ExperienceStage
        ref={stageRef}
        preferences={preferences}
        runtimeQuality={runtimeQuality}
        initialTexture={preferences.mobile ? variants[0]!.texture.mobile : variants[0]!.texture.desktop}
        selectedVariant={activeVariant}
        cinematicEnabled={cinematicEnabled}
        onReady={onReady}
        onError={onError}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
        onQualityChange={onQualityChange}
      >
        <Configurator
          activeVariant={activeVariant}
          activeFinish={activeFinish}
          status={textureStatus}
          disabled={Boolean(webglError)}
          onVariant={chooseVariant}
          onFinish={chooseFinish}
          onCustomTexture={useCustomTexture}
          onResetCustom={resetCustom}
          onStatus={setTextureStatus}
          onExport={exportImage}
        />

        {preferences.saveData && !cinematicEnabled ? (
          <button className="data-saver-prompt" type="button" onClick={() => setCinematicEnabled(true)}>
            <span className="data-saver-prompt__label">Cinematic media paused</span>
            <span className="data-saver-prompt__action">Load films · {filmWeight[filmRendition]}</span>
          </button>
        ) : null}

        {webglError || contextLost ? (
          <>
            {/* Sibling, not a child: the still frame has to sit under the
                cinematic layers while its panel stays above them. */}
            <img className="webgl-fallback" src={fallbackPoster} alt="A cold aluminum can standing in a dark studio, lit from the left" />
            <div className="webgl-fallback__panel" role="status">
              <span className="eyebrow">Static product view</span>
              <p>
                {contextLost
                  ? 'The 3D context was interrupted. The product stays on screen as a still frame while the browser recovers it.'
                  : 'Interactive 3D is unavailable on this device, so the product is shown as a still frame. The cinematic sequences still play through the scroll.'}
              </p>
              {webglError ? (
                <button className="button button--ghost" type="button" onClick={() => location.reload()}>
                  <span>Retry WebGL</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </ExperienceStage>

      <div className={`loading-screen ${ready ? 'is-complete' : ''}`} aria-hidden={ready} inert={ready}>
        <span className="loading-screen__mark">CAN<span>//</span>FORM</span>
        <span className="loading-screen__track"><i /></span>
        <small role="status">{ready ? 'Product ready' : 'Preparing product'}</small>
      </div>
    </main>
  )
}
