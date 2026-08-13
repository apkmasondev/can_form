import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import canModelUrl from '../assets/models/can-form.glb'
import { clamp, smoothstep } from '../config/timeline'
import type { ExperiencePreferences, QualityTier } from '../hooks/usePreferences'
import type { FinishId, VariantId } from '../config/variants'
import { finishes } from '../config/variants'

type CameraState = {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
  rotation: number
}

export type RenderStats = {
  fps: number
  dpr: number
  quality: QualityTier
  triangles: number
  calls: number
  camera: string
  light: string
  label: string
}

export type ExportMetadata = {
  variant: string
  finish: string
}

type ExperienceCallbacks = {
  onReady: () => void
  onError: (error: Error) => void
  onContextLost: () => void
  onContextRestored: () => void
  onQualityChange: (quality: QualityTier) => void
}

const qualityLadder: QualityTier[] = ['HIGH', 'MEDIUM', 'LOW']

const cameraKeys: Array<{ at: number; state: CameraState }> = [
  { at: 0, state: { position: new THREE.Vector3(0.22, 0.14, 10), target: new THREE.Vector3(0, 0.05, 0), fov: 32, rotation: 0.08 } },
  { at: 0.105, state: { position: new THREE.Vector3(0.12, 0.3, 8.5), target: new THREE.Vector3(0, 0.25, 0), fov: 31, rotation: 0.03 } },
  { at: 0.175, state: { position: new THREE.Vector3(0.05, 1.78, 2.12), target: new THREE.Vector3(0, 1.74, 0), fov: 28, rotation: 0 } },
  { at: 0.405, state: { position: new THREE.Vector3(0, 0.04, 9.7), target: new THREE.Vector3(0, 0.04, 0), fov: 33, rotation: 0 } },
  { at: 0.625, state: { position: new THREE.Vector3(0.18, 0.1, 9.8), target: new THREE.Vector3(0, 0.04, 0), fov: 33, rotation: -0.04 } },
  { at: 0.68, state: { position: new THREE.Vector3(0, 0.04, 9.7), target: new THREE.Vector3(0, 0.04, 0), fov: 33, rotation: 0 } },
  // Matched to the last frame of film 2: ~53 degrees above the end, close
  // enough that the double seam is cropped by the frame edges. The whole can
  // turns here so the directional end mechanism hands off on the same diagonal
  // as the film (opening lower-left, finger ring upper-right). Rotating the
  // complete can keeps the score panel, rivet, lid and tab mechanically aligned.
  { at: 0.92, state: { position: new THREE.Vector3(0.06, 3.95, 1.24), target: new THREE.Vector3(0, 2.32, 0), fov: 30, rotation: -0.42 } },
  { at: 1, state: { position: new THREE.Vector3(0.42, 1.12, 9.45), target: new THREE.Vector3(0, 0.25, 0), fov: 32, rotation: -0.13 } },
]

// Reused across frames: `interpolateState` runs once per rendered frame and used
// to allocate two Vector3 clones every time, which showed up as GC sawtooth.
const scratchState: CameraState = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  fov: 32,
  rotation: 0,
}

function interpolateState(progress: number): CameraState {
  const last = cameraKeys.at(-1)
  if (!last) throw new Error('Camera timeline is empty')
  for (let index = 0; index < cameraKeys.length - 1; index += 1) {
    const current = cameraKeys[index]
    const next = cameraKeys[index + 1]
    if (!current || !next || progress > next.at) continue
    const mix = smoothstep(current.at, next.at, progress)
    scratchState.position.copy(current.state.position).lerp(next.state.position, mix)
    scratchState.target.copy(current.state.target).lerp(next.state.target, mix)
    scratchState.fov = THREE.MathUtils.lerp(current.state.fov, next.state.fov, mix)
    scratchState.rotation = THREE.MathUtils.lerp(current.state.rotation, next.state.rotation, mix)
    return scratchState
  }
  scratchState.position.copy(last.state.position)
  scratchState.target.copy(last.state.target)
  scratchState.fov = last.state.fov
  scratchState.rotation = last.state.rotation
  return scratchState
}

export class CanExperience {
  private readonly canvas: HTMLCanvasElement
  private readonly preferences: ExperiencePreferences
  private readonly callbacks: ExperienceCallbacks
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  private readonly textureLoader = new THREE.TextureLoader()
  private readonly textureCache = new Map<string, THREE.Texture>()
  private readonly target = new THREE.Vector3()
  private readonly pointerLightTarget = new THREE.Vector2()
  private readonly pointerLightCurrent = new THREE.Vector2()
  private readonly keyBaseColor = new THREE.Color(0xffffff)
  private readonly keyMatchColor = new THREE.Color(0xc5d2d5)
  private readonly rimBaseColor = new THREE.Color(0xc9d3d1)
  private readonly rimMatchColor = new THREE.Color(0xaebfc4)
  private readonly topBaseColor = new THREE.Color(0xf5f1e7)
  private readonly topMatchColor = new THREE.Color(0xb8c5ca)
  private readonly transitionDuration = 0.38
  private environmentTarget: THREE.WebGLRenderTarget | null = null
  private root: THREE.Group | null = null
  private keyLight: THREE.RectAreaLight | null = null
  private rimLight: THREE.RectAreaLight | null = null
  private topLight: THREE.RectAreaLight | null = null
  private tabPivot: THREE.Object3D | null = null
  private lidPivot: THREE.Object3D | null = null
  private tabRestY = 0
  private bodyMaterial: THREE.MeshPhysicalMaterial | null = null
  private readonly metalMaterials: Array<{ material: THREE.MeshPhysicalMaterial; baseEnvironment: number }> = []
  private shader: THREE.WebGLProgramParametersWithUniforms | null = null
  private currentTexture: THREE.Texture | null = null
  private nextTexture: THREE.Texture | null = null
  private currentTextureCustom = false
  private nextTextureCustom = false
  private transitionElapsed = 0
  private activeVariant: VariantId = 'noir'
  private printStrength = 1
  private finishTarget = finishes.satin
  private userRotation = 0
  private dragVelocity = 0
  private dragging = false
  private pointerId = -1
  private pointerStart = { x: 0, y: 0 }
  private pointerLastX = 0
  private horizontalIntent = false
  private interactionEnabled = false
  private elapsed = 0
  private fpsAccumulator = 0
  private fpsFrames = 0
  private averageFps = 60
  private qualitySteps = 0
  private effectiveQuality: QualityTier
  private dpr: number
  private resizeTimer = 0
  private contextLost = false
  private disposed = false

  constructor(canvas: HTMLCanvasElement, preferences: ExperiencePreferences, callbacks: ExperienceCallbacks) {
    this.canvas = canvas
    this.preferences = preferences
    this.callbacks = callbacks
    this.dpr = preferences.dpr
    this.effectiveQuality = preferences.quality
    this.scene.background = new THREE.Color(0x080808)
    this.scene.fog = new THREE.FogExp2(0x121719, 0)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: preferences.quality !== 'LOW',
      alpha: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.06
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, false)

    this.setupEnvironment()
    this.bindEvents()
  }

  /**
   * `initialProgress` keeps the first painted frame in sync with the scroll
   * position the page was restored at. Without it a mid-page reload paints the
   * hero pose for one frame before the timeline catches up.
   */
  async initialize(initialTextureUrl: string, initialProgress = 0) {
    try {
      const [gltf, initialTexture] = await Promise.all([
        new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(canModelUrl),
        this.loadTexture(initialTextureUrl, false),
      ])
      if (this.disposed) return
      this.root = gltf.scene
      this.root.name = 'CAN_FORM_Product'
      this.currentTexture = initialTexture
      this.configureModel(initialTexture)
      this.scene.add(this.root)
      this.resize()
      this.render(clamp(initialProgress), 1 / 60)
      this.callbacks.onReady()
    } catch (cause) {
      this.callbacks.onError(cause instanceof Error ? cause : new Error('Unable to load the 3D product.'))
    }
  }

  private setupEnvironment() {
    RectAreaLightUniformsLib.init()
    const environment = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(this.renderer)
    this.environmentTarget = generator.fromScene(environment, 0.04)
    this.scene.environment = this.environmentTarget.texture
    environment.dispose()
    generator.dispose()

    const key = new THREE.RectAreaLight(0xffffff, 7.5, 1.7, 7)
    key.position.set(-3.8, 1.3, 3.6)
    key.lookAt(0, 0, 0)
    this.scene.add(key)
    this.keyLight = key

    const rim = new THREE.RectAreaLight(0xc9d3d1, 8, 1.3, 5.5)
    rim.position.set(3.2, 0.8, -1.2)
    rim.lookAt(0, 0.25, 0)
    this.scene.add(rim)
    this.rimLight = rim

    const top = new THREE.RectAreaLight(0xf5f1e7, 4.2, 3.6, 1.1)
    top.position.set(0, 5.5, 1.1)
    top.lookAt(0, 1.2, 0)
    this.scene.add(top)
    this.topLight = top
  }

  private createAluminumMaterial(name: string) {
    const isEndSurface = name === 'Top' || name === 'TopPanel' || name === 'ScorePanel' || name === 'Rivet'
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xb9bcbb,
      metalness: 0.96,
      roughness: isEndSurface ? 0.31 : 0.28,
      clearcoat: 0.03,
      envMapIntensity: isEndSurface ? 1.16 : 1.3,
    })
    material.name = isEndSurface ? 'Radial_Brushed_End' : 'Brushed_Aluminum'

    // Fine concentric roughness bands reveal themselves only inside a moving
    // reflection. They add no texture allocation and no draw call; `fwidth`
    // suppresses the pattern before it can alias in distant views.
    if (isEndSurface && this.preferences.quality !== 'LOW') {
      const frequency = this.preferences.mobile ? 520 : 760
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCanWorldPosition;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCanWorldPosition;')
          .replace('#include <roughnessmap_fragment>', `
            #include <roughnessmap_fragment>
            float brushPhase = length(vCanWorldPosition.xz) * ${frequency.toFixed(1)};
            float brushFilter = 1.0 - smoothstep(0.32, 1.15, fwidth(brushPhase));
            float radialBrush = (sin(brushPhase) + 0.34 * sin(brushPhase * 0.613 + 1.7)) * 0.72 * brushFilter;
            roughnessFactor = clamp(roughnessFactor + radialBrush * 0.012, 0.18, 0.58);
          `)
      }
      material.customProgramCacheKey = () => `can-form-radial-end-${frequency}`
    }

    this.metalMaterials.push({ material, baseEnvironment: material.envMapIntensity })
    return material
  }

  private configureModel(initialTexture: THREE.Texture) {
    if (!this.root) return
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.frustumCulled = true
      if (object.name === 'Body') {
        const material = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: initialTexture,
          metalness: finishes.satin.metalness,
          roughness: finishes.satin.roughness,
          clearcoat: finishes.satin.clearcoat,
          clearcoatRoughness: 0.42,
          envMapIntensity: 1.18,
        })
        material.name = 'Crossfade_Label_Material'
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uMapB = { value: this.nextTexture ?? this.currentTexture }
          shader.uniforms.uMapMix = { value: this.nextTexture ? clamp(this.transitionElapsed / this.transitionDuration) : 0 }
          shader.uniforms.uPrintStrength = { value: 1 }
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D uMapB;\nuniform float uMapMix;\nuniform float uPrintStrength;')
            .replace('#include <map_fragment>', `
              #ifdef USE_MAP
                vec4 labelA = texture2D(map, vMapUv);
                vec4 labelB = texture2D(uMapB, vMapUv);
                vec3 labelColor = mix(labelA.rgb, labelB.rgb, uMapMix);
                float lowerMask = smoothstep(0.105, 0.165, vMapUv.y);
                float upperMask = 1.0 - smoothstep(0.835, 0.895, vMapUv.y);
                float labelMask = lowerMask * upperMask;
                vec3 aluminum = vec3(0.58, 0.60, 0.605);
                vec3 neutralLabel = vec3(0.025, 0.026, 0.027);
                vec3 printed = mix(neutralLabel, labelColor, uPrintStrength);
                diffuseColor.rgb *= mix(aluminum, printed, labelMask);
                diffuseColor.a *= mix(labelA.a, labelB.a, uMapMix);
              #endif
            `)
          this.shader = shader
        }
        material.customProgramCacheKey = () => 'can-form-label-crossfade-v2'
        object.material = material
        this.bodyMaterial = material
      } else if (object.name === 'InnerOpening') {
        // Double-sided: the interior cup is seen through the tear opening at
        // grazing angles where its own winding would cull it away.
        object.material = new THREE.MeshStandardMaterial({
          color: 0x030303,
          metalness: 0.15,
          roughness: 0.62,
          envMapIntensity: 0.3,
          side: THREE.DoubleSide,
        })
      } else if (object.name === 'Tab') {
        const material = new THREE.MeshPhysicalMaterial({ color: 0x929594, metalness: 0.94, roughness: 0.38, clearcoat: 0.02, envMapIntensity: 0.82 })
        this.metalMaterials.push({ material, baseEnvironment: material.envMapIntensity })
        object.material = material
      } else {
        object.material = this.createAluminumMaterial(object.name)
      }
    })
    this.tabPivot = this.root.getObjectByName('TabPivot') ?? null
    this.lidPivot = this.root.getObjectByName('LidPivot') ?? null
    this.tabRestY = this.tabPivot?.position.y ?? 0
    if (import.meta.env.DEV) Object.assign(window, { __canForm: this })
  }

  private async loadTexture(url: string, custom: boolean) {
    if (!custom) {
      const cached = this.textureCache.get(url)
      if (cached) return cached
    }
    const texture = await this.textureLoader.loadAsync(url)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = true
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.repeat.x = -1
    texture.offset.x = 1
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.preferences.mobile ? 4 : 8)
    texture.needsUpdate = true
    if (!custom) this.textureCache.set(url, texture)
    return texture
  }

  private get transitionMix() {
    if (!this.nextTexture) return 0
    const uniform = this.shader?.uniforms.uMapMix
    if (uniform) return Number(uniform.value)
    return clamp(this.transitionElapsed / this.transitionDuration)
  }

  async setTexture(url: string, id: VariantId) {
    const custom = id === 'custom'
    const texture = await this.loadTexture(url, custom)
    if (this.disposed) {
      if (custom) texture.dispose()
      return
    }
    this.activeVariant = id
    if (texture === this.nextTexture) return
    if (texture === this.currentTexture && !this.nextTexture) return

    const pending = this.nextTexture
    if (pending) {
      // A crossfade is already running. Resetting the mix to 0 here used to snap
      // the label back to the previous variant before fading again, which reads
      // as a flicker when variants are clicked quickly.
      if (this.transitionMix >= 0.5) {
        // The pending label is already dominant: commit it and start clean.
        this.completeTextureTransition()
        this.transitionElapsed = 0
      } else {
        if (this.nextTextureCustom && pending !== texture) pending.dispose()
        // Keep the eased mix continuous and simply retarget it at the new label.
      }
    } else {
      this.transitionElapsed = 0
    }

    this.nextTexture = texture
    this.nextTextureCustom = custom
    const mapB = this.shader?.uniforms.uMapB
    if (mapB) mapB.value = texture
  }

  setFinish(finish: FinishId) {
    this.finishTarget = finishes[finish]!
  }

  async exportImage(metadata: ExportMetadata) {
    if (this.disposed || this.contextLost || !this.root) throw new Error('The 3D product is not ready to export.')

    const requestedSize = this.preferences.mobile ? 1200 : 1600
    const size = Math.min(requestedSize, this.renderer.capabilities.maxTextureSize)
    if (size < 768) throw new Error('This device cannot create a high-resolution export.')

    const renderTarget = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    })
    renderTarget.texture.colorSpace = THREE.SRGBColorSpace
    // Supersampled output is already much denser than the on-screen canvas.
    // Two MSAA samples are reserved for desktop HIGH; mobile avoids the extra
    // multisample color/depth allocation entirely.
    if (!this.preferences.mobile && this.renderer.capabilities.isWebGL2 && this.effectiveQuality === 'HIGH') renderTarget.samples = 2

    const savedTarget = this.renderer.getRenderTarget()
    const savedCameraPosition = this.camera.position.clone()
    const savedCameraQuaternion = this.camera.quaternion.clone()
    const savedCameraFov = this.camera.fov
    const savedCameraAspect = this.camera.aspect
    const savedRootPosition = this.root.position.clone()
    const savedRootQuaternion = this.root.quaternion.clone()
    const savedExposure = this.renderer.toneMappingExposure
    const pixels = new Uint8Array(size * size * 4)

    try {
      this.root.position.set(0, 0, 0)
      // Preserve the user's chosen 360° angle, but remove the timeline's small
      // presentation tilt so the exported packshot is mechanically level.
      this.root.rotation.set(0, this.userRotation, 0)
      this.camera.position.set(0.32, 0.18, 10.15)
      this.camera.fov = 31
      this.camera.aspect = 1
      this.camera.lookAt(0, 0.08, 0)
      this.camera.updateProjectionMatrix()
      this.renderer.toneMappingExposure = 1.02
      this.renderer.setRenderTarget(renderTarget)
      this.renderer.clear()
      this.renderer.render(this.scene, this.camera)
      this.renderer.readRenderTargetPixels(renderTarget, 0, 0, size, size, pixels)
    } finally {
      this.renderer.setRenderTarget(savedTarget)
      this.renderer.toneMappingExposure = savedExposure
      this.root.position.copy(savedRootPosition)
      this.root.quaternion.copy(savedRootQuaternion)
      this.camera.position.copy(savedCameraPosition)
      this.camera.quaternion.copy(savedCameraQuaternion)
      this.camera.fov = savedCameraFov
      this.camera.aspect = savedCameraAspect
      this.camera.updateProjectionMatrix()
      renderTarget.dispose()
    }

    const output = document.createElement('canvas')
    output.width = size
    output.height = size
    const context = output.getContext('2d')
    if (!context) throw new Error('The browser could not prepare the PNG canvas.')
    const flipped = new Uint8ClampedArray(pixels.length)
    const rowLength = size * 4
    for (let row = 0; row < size; row += 1) {
      const source = row * rowLength
      const destination = (size - row - 1) * rowLength
      flipped.set(pixels.subarray(source, source + rowLength), destination)
    }
    context.putImageData(new ImageData(flipped, size, size), 0, 0)

    const edgeShade = context.createLinearGradient(0, 0, 0, size)
    edgeShade.addColorStop(0, 'rgba(0, 0, 0, 0.32)')
    edgeShade.addColorStop(0.22, 'rgba(0, 0, 0, 0)')
    edgeShade.addColorStop(0.76, 'rgba(0, 0, 0, 0)')
    edgeShade.addColorStop(1, 'rgba(0, 0, 0, 0.42)')
    context.fillStyle = edgeShade
    context.fillRect(0, 0, size, size)

    const margin = Math.round(size * 0.052)
    context.fillStyle = '#f1efe8'
    context.textBaseline = 'top'
    context.font = `700 ${Math.round(size * 0.018)}px Arial, Helvetica, sans-serif`
    context.fillText('CAN//FORM', margin, margin)
    context.textAlign = 'right'
    context.font = `600 ${Math.round(size * 0.009)}px Arial, Helvetica, sans-serif`
    context.fillStyle = 'rgba(241, 239, 232, 0.62)'
    context.fillText('INTERACTIVE PRODUCT SYSTEM', size - margin, margin + Math.round(size * 0.006))

    context.textBaseline = 'bottom'
    context.textAlign = 'left'
    context.font = `700 ${Math.round(size * 0.011)}px Arial, Helvetica, sans-serif`
    context.fillText(`${metadata.variant.toUpperCase()} / ${metadata.finish.toUpperCase()}`, margin, size - margin)
    context.textAlign = 'right'
    context.fillText('CRAFTED BY APKMASON.DEV', size - margin, size - margin)

    return new Promise<Blob>((resolve, reject) => {
      output.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The browser could not encode the PNG.'))
      }, 'image/png')
    })
  }

  private completeTextureTransition() {
    if (!this.nextTexture || !this.bodyMaterial) return
    const oldTexture = this.currentTexture
    const oldWasCustom = this.currentTextureCustom
    this.currentTexture = this.nextTexture
    this.currentTextureCustom = this.nextTextureCustom
    this.nextTexture = null
    this.nextTextureCustom = false
    this.bodyMaterial.map = this.currentTexture
    if (this.shader) {
      const mapB = this.shader.uniforms.uMapB
      const mapMix = this.shader.uniforms.uMapMix
      if (mapB) mapB.value = this.currentTexture
      if (mapMix) mapMix.value = 0
    }
    if (oldWasCustom && oldTexture && oldTexture !== this.currentTexture) oldTexture.dispose()
  }

  render(progress: number, suppliedDelta?: number) {
    if (this.disposed || this.contextLost || !this.root) return
    const delta = Math.min(suppliedDelta ?? 1 / 60, 0.05)
    this.elapsed += delta
    this.updateCamera(progress)
    this.updateProduct(progress, delta)
    this.updateMaterial(progress, delta)
    this.updateLighting(progress, delta)
    this.renderer.render(this.scene, this.camera)
    this.trackPerformance(delta, progress)
  }

  /**
   * Reduced motion collapses the fly-through to three held anchors. The handover
   * is blended over a short scroll window so the camera never teleports, which
   * is itself a motion event.
   */
  private timelineProgress(progress: number) {
    if (!this.preferences.reducedMotion) return progress
    return smoothstep(0.36, 0.46, progress) * 0.5 + smoothstep(0.86, 0.94, progress) * 0.5
  }

  private updateCamera(progress: number) {
    const state = interpolateState(this.timelineProgress(progress))
    this.camera.position.copy(state.position)
    this.target.copy(state.target)
    this.camera.fov = state.fov
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(this.target)
    if (this.root) {
      const idle = this.preferences.reducedMotion ? 0 : Math.sin(this.elapsed * 0.34) * 0.018
      const configBlend = smoothstep(0.43, 0.47, progress) * (1 - smoothstep(0.625, 0.66, progress))
      const heroBlend = 1 - smoothstep(0.075, 0.15, progress)
      const finalBlend = smoothstep(0.94, 0.985, progress)
      const heroShift = (this.preferences.mobile ? 0.34 : 1.08) * heroBlend
      const configShift = (this.preferences.mobile ? 0 : -0.72) * configBlend
      const finalShift = (this.preferences.mobile ? 0.32 : 0.95) * finalBlend
      this.root.position.x = heroShift + configShift + finalShift
      this.root.position.y = this.preferences.mobile ? -1.85 * heroBlend - 0.55 * finalBlend : 0
      this.root.rotation.y = state.rotation + idle + this.userRotation * configBlend
    }
  }

  private updateLighting(progress: number, delta: number) {
    const matchGrade = smoothstep(0.872, 0.924, progress) * (1 - smoothstep(0.94, 0.978, progress))
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.06, 0.62, matchGrade)

    const fog = this.scene.fog
    if (fog instanceof THREE.FogExp2) fog.density = matchGrade * 0.026
    this.metalMaterials.forEach(({ material, baseEnvironment }) => {
      material.envMapIntensity = THREE.MathUtils.lerp(baseEnvironment, baseEnvironment * 0.62, matchGrade)
    })

    const configBlend = smoothstep(0.43, 0.47, progress) * (1 - smoothstep(0.625, 0.66, progress))
    if (!configBlend || this.preferences.mobile || this.preferences.reducedMotion) this.pointerLightTarget.set(0, 0)
    const pointerResponse = 1 - Math.exp(-delta * 5.5)
    this.pointerLightCurrent.lerp(this.pointerLightTarget, pointerResponse)

    if (this.keyLight) {
      this.keyLight.position.set(
        -3.8 + this.pointerLightCurrent.x * 1.15 * configBlend,
        1.3 + this.pointerLightCurrent.y * 0.48 * configBlend,
        3.6,
      )
      this.keyLight.lookAt(this.pointerLightCurrent.x * 0.16 * configBlend, this.pointerLightCurrent.y * 0.1 * configBlend, 0)
      this.keyLight.intensity = THREE.MathUtils.lerp(7.5, 4.8, matchGrade)
      this.keyLight.color.lerpColors(this.keyBaseColor, this.keyMatchColor, matchGrade)
    }
    if (this.rimLight) {
      this.rimLight.intensity = THREE.MathUtils.lerp(8, 5.3, matchGrade)
      this.rimLight.color.lerpColors(this.rimBaseColor, this.rimMatchColor, matchGrade)
    }
    if (this.topLight) {
      this.topLight.intensity = THREE.MathUtils.lerp(4.2, 2.6, matchGrade)
      this.topLight.color.lerpColors(this.topBaseColor, this.topMatchColor, matchGrade)
    }
  }

  private updateProduct(progress: number, delta: number) {
    this.interactionEnabled = progress > 0.42 && progress < 0.67
    if (!this.dragging && !this.preferences.reducedMotion) {
      this.userRotation += this.dragVelocity * delta
      this.dragVelocity *= Math.exp(-5.5 * delta)
    }
    // Film 2 cuts away at 0.928 on an already-open can, so both the ring and the
    // tear panel have to be fully travelled by then or the hand-off snaps shut.
    const open = smoothstep(0.884, 0.924, progress)
    if (this.tabPivot) {
      // The ring lifts around the rivet, which drives the nose down onto the
      // hinge end of the tear panel.
      this.tabPivot.rotation.x = open * 0.55
      this.tabPivot.position.y = this.tabRestY + open * 0.014
    }
    // Past 90 degrees the panel is folded back under the end, out of sight of a
    // camera looking down at it. Stopping short of vertical left its top face
    // still pointed at the lens, so the opening read as a closed lid.
    if (this.lidPivot) this.lidPivot.rotation.x = smoothstep(0.888, 0.928, progress) * 1.95
  }

  private updateMaterial(progress: number, delta: number) {
    if (!this.bodyMaterial) return
    const response = 1 - Math.exp(-delta * 8)
    this.bodyMaterial.roughness = THREE.MathUtils.lerp(this.bodyMaterial.roughness, this.finishTarget.roughness, response)
    this.bodyMaterial.metalness = THREE.MathUtils.lerp(this.bodyMaterial.metalness, this.finishTarget.metalness, response)
    this.bodyMaterial.clearcoat = THREE.MathUtils.lerp(this.bodyMaterial.clearcoat, this.finishTarget.clearcoat, response)

    if (this.nextTexture) {
      this.transitionElapsed += delta
      const mix = smoothstep(0, this.transitionDuration, this.transitionElapsed)
      const mapMix = this.shader?.uniforms.uMapMix
      if (mapMix) mapMix.value = mix
      if (mix >= 0.999) this.completeTextureTransition()
    }

    // Film 1 is always the original Noir sequence, so its early hand-off keeps
    // the neutralisation used by the initial campaign. Film 2 now has matching
    // Noir, Lime and Cherry renders: those identities must retain their colour
    // right through the cut. Only Zero and arbitrary Custom artwork use the
    // deliberate Noir fallback and therefore neutralise before Film 2.
    let printStrength = 1
    if (progress > 0.115 && progress < 0.43) {
      printStrength = 1 - smoothstep(0.115, 0.16, progress) + smoothstep(0.405, 0.445, progress)
    } else if ((this.activeVariant === 'zero' || this.activeVariant === 'custom') && progress >= 0.625 && progress < 0.96) {
      printStrength = 1 - smoothstep(0.625, 0.675, progress) + smoothstep(0.92, 0.965, progress)
    }
    this.printStrength = clamp(printStrength)
    const printUniform = this.shader?.uniforms.uPrintStrength
    if (printUniform) printUniform.value = this.printStrength
  }

  private trackPerformance(delta: number, progress: number) {
    this.fpsAccumulator += delta
    this.fpsFrames += 1
    if (this.fpsAccumulator < 2.5) return
    this.averageFps = this.fpsFrames / this.fpsAccumulator
    this.fpsAccumulator = 0
    this.fpsFrames = 0
    // Never resize the drawing buffer while a cinematic handover is on screen.
    const inTransition = (progress > 0.14 && progress < 0.43) || (progress > 0.65 && progress < 0.94)
    if (inTransition || this.qualitySteps >= 2 || this.averageFps >= 46) return
    const floor = 0.8
    if (this.dpr <= floor + 0.001) return
    this.qualitySteps += 1
    this.dpr = Math.max(floor, this.dpr * 0.8)
    this.renderer.setPixelRatio(this.dpr)
    this.resize()
    const nextTier = qualityLadder[Math.min(qualityLadder.length - 1, qualityLadder.indexOf(this.effectiveQuality) + 1)]
    if (nextTier && nextTier !== this.effectiveQuality) {
      this.effectiveQuality = nextTier
      this.callbacks.onQualityChange(nextTier)
    }
  }

  getStats(): RenderStats {
    return {
      fps: Math.round(this.averageFps),
      dpr: Number(this.dpr.toFixed(2)),
      quality: this.effectiveQuality,
      triangles: this.renderer.info.render.triangles,
      calls: this.renderer.info.render.calls,
      camera: `${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}`,
      light: `${this.pointerLightCurrent.x.toFixed(2)}, ${this.pointerLightCurrent.y.toFixed(2)}`,
      label: `${this.activeVariant} / ${this.printStrength.toFixed(2)}`,
    }
  }

  private bindEvents() {
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)
    window.addEventListener('resize', this.scheduleResize, { passive: true })
  }

  private handleContextLost = (event: Event) => {
    // preventDefault is what lets the browser hand the context back.
    event.preventDefault()
    this.contextLost = true
    this.callbacks.onContextLost()
  }

  private handleContextRestored = () => {
    this.contextLost = false
    // The program cache is gone with the context; the crossfade uniforms are
    // re-published by onBeforeCompile when the material is recompiled.
    this.shader = null
    this.callbacks.onContextRestored()
    this.resize()
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.interactionEnabled || event.button !== 0) return
    this.pointerId = event.pointerId
    this.pointerStart = { x: event.clientX, y: event.clientY }
    this.pointerLastX = event.clientX
    this.horizontalIntent = false
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.interactionEnabled && !this.preferences.mobile && !this.preferences.reducedMotion && event.pointerType !== 'touch') {
      const bounds = this.canvas.getBoundingClientRect()
      this.pointerLightTarget.set(
        clamp(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1, -1, 1),
        clamp(1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2, -1, 1),
      )
    }
    if (event.pointerId !== this.pointerId || !this.interactionEnabled) return
    const totalX = event.clientX - this.pointerStart.x
    const totalY = event.clientY - this.pointerStart.y
    if (!this.horizontalIntent && Math.abs(totalX) > 8 && Math.abs(totalX) > Math.abs(totalY) * 1.15) {
      this.horizontalIntent = true
      this.dragging = true
      this.canvas.setPointerCapture(event.pointerId)
    }
    if (!this.horizontalIntent) return
    const deltaX = event.clientX - this.pointerLastX
    this.pointerLastX = event.clientX
    this.userRotation += deltaX * 0.008
    this.dragVelocity = deltaX * 0.26
  }

  private handlePointerLeave = () => {
    this.pointerLightTarget.set(0, 0)
  }

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    this.pointerId = -1
    this.dragging = false
    this.horizontalIntent = false
  }

  private scheduleResize = () => {
    window.clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => this.resize(), 120)
  }

  resize() {
    if (this.disposed) return
    const width = Math.max(1, this.canvas.clientWidth || innerWidth)
    const height = Math.max(1, this.canvas.clientHeight || innerHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    window.clearTimeout(this.resizeTimer)
    window.removeEventListener('resize', this.scheduleResize)
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose?.()
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.textureCache.forEach((texture) => texture.dispose())
    this.textureCache.clear()
    if (this.currentTextureCustom) this.currentTexture?.dispose()
    if (this.nextTextureCustom) this.nextTexture?.dispose()
    this.currentTexture = null
    this.nextTexture = null
    this.shader = null
    this.bodyMaterial = null
    this.metalMaterials.length = 0
    this.keyLight = null
    this.rimLight = null
    this.topLight = null
    this.root = null
    // Disposing only `scene.environment` leaves the PMREM render target's
    // renderbuffers allocated; the target owns them.
    this.scene.environment = null
    this.environmentTarget?.dispose()
    this.environmentTarget = null
    // Deliberately no forceContextLoss(): React keeps the same <canvas> element
    // across remounts, and a force-lost canvas can never be given a new context
    // again, so the next engine would fail to construct. dispose() already
    // releases the GPU resources this instance owns.
    this.renderer.dispose()
  }
}
