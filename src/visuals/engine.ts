import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { AudioMetrics } from '../audio/AudioEngine'
import { createPalette, evolvePalette, type Palette } from './palette'
import { createAllStyles, type VisualStyle } from './styles'

export class VisualizerEngine {
  readonly styles: VisualStyle[]
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private holePass: ShaderPass
  private current: VisualStyle | null = null
  private raf = 0
  private last = 0
  private running = false
  private bloomStrength = 0.28
  private host: HTMLElement
  palette: Palette
  styleId: string
  speed = 1.35
  sensitivity = 1.15
  private scaledSpectrum = new Float32Array(64)
  onFrame: ((metrics: AudioMetrics, palette: Palette) => void) | null = null
  pullMetrics: (() => AudioMetrics) | null = null

  constructor(host: HTMLElement, seed: number, initialStyleId?: string) {
    this.host = host
    this.palette = createPalette(seed)
    this.styles = createAllStyles()
    this.styleId =
      (initialStyleId && this.styles.some((style) => style.id === initialStyleId)
        ? initialStyleId
        : this.styles[0].id)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(host.clientWidth, host.clientHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.78
    this.renderer.setClearColor(0x030308, 1)
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x030308, 0.035)
    this.camera = new THREE.PerspectiveCamera(
      60,
      host.clientWidth / host.clientHeight,
      0.1,
      280,
    )

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(host.clientWidth, host.clientHeight),
      0.28,
      0.38,
      0.48,
    )
    this.composer.addPass(this.bloom)
    this.holePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new THREE.Vector2(host.clientWidth, host.clientHeight) },
        uRadius: { value: 0.154 },
        uFeather: { value: 0.005 },
        uEnabled: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uRes;
        uniform float uRadius, uFeather, uEnabled;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          if (uEnabled < 0.5) {
            gl_FragColor = c;
            return;
          }
          vec2 uv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
          float hole = smoothstep(uRadius, uRadius - uFeather, length(uv));
          gl_FragColor = vec4(mix(c.rgb, vec3(0.0), hole), 1.0);
        }
      `,
    })
    this.holePass.enabled = false
    this.composer.addPass(this.holePass)
    this.composer.addPass(new OutputPass())

    this.setStyle(this.styleId)
    window.addEventListener('resize', this.resize)
  }

  setPalette(palette: Palette) {
    this.palette = palette
  }

  setStyle(id: string) {
    const next = this.styles.find((style) => style.id === id) ?? this.styles[0]
    if (this.current) this.current.dispose(this.scene)
    this.current = next
    this.styleId = next.id
    this.scene.fog = new THREE.FogExp2(0x030308, 0.028)
    this.scene.background = new THREE.Color(0x030308)
    this.camera.fov = 60
    this.camera.near = 0.1
    this.camera.far = 280
    this.camera.position.set(0, 0, 8)
    this.camera.rotation.set(0, 0, 0)
    this.current.mount(this.scene, this.camera, this.palette)
    this.current.resize?.(this.host.clientWidth, this.host.clientHeight)
    this.camera.updateProjectionMatrix()
    // compile every visible material up front so late-appearing actors don't hitch the frame
    this.renderer.compile(this.scene, this.camera)
  }

  nextStyle() {
    const index = this.styles.findIndex((style) => style.id === this.styleId)
    const next = this.styles[(index + 1) % this.styles.length]
    this.setStyle(next.id)
    return next.id
  }

  randomStyle() {
    const pool = this.styles.filter((style) => style.id !== this.styleId)
    const next = pool[Math.floor(Math.random() * pool.length)] ?? this.styles[0]
    this.setStyle(next.id)
    return next.id
  }

  private resize = () => {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    this.holePass.uniforms.uRes.value.set(w, h)
    this.current?.resize?.(w, h)
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.speed
      this.last = now
      const time = (now / 1000) * this.speed
      const live = this.pullMetrics?.() ?? {
        bass: 0,
        mid: 0,
        treble: 0,
        energy: 0,
        beat: false,
        spectrum: new Float32Array(64),
        waveform: new Float32Array(128),
      }
      const gain = this.sensitivity
      const scale = (n: number) => {
        const v = Math.max(0, n) * gain
        return v / (1 + Math.max(0, v - 1) * 0.35)
      }
      const silent = live.energy < 0.03
      const idle = silent ? 0.05 + 0.02 * Math.sin(time * 1.1) : 0
      const spec = this.scaledSpectrum
      const src = live.spectrum
      for (let i = 0; i < spec.length; i++) spec[i] = scale(src[i] ?? 0)
      const metrics = {
        ...live,
        bass: scale(live.bass) + idle * 0.3,
        mid: scale(live.mid) + idle * 0.22,
        treble: scale(live.treble) + idle * 0.16,
        energy: scale(live.energy) + idle,
        spectrum: spec,
        beat: live.beat && scale(live.energy) > 0.18,
      }
      const livePalette = evolvePalette(this.palette, metrics, time, this.speed)
      this.current?.update(metrics, time, dt, livePalette, this.speed, this.sensitivity)
      const bloom = this.current?.bloom
      const targetBloom = (bloom?.base ?? 0.22) + metrics.energy * (bloom?.pulse ?? 0.28)
      this.bloomStrength += (targetBloom - this.bloomStrength) * 0.06
      this.bloom.strength = this.bloomStrength
      this.bloom.radius = 0.36
      this.bloom.threshold = 0.5
      const hole = this.current?.holeMask
      this.holePass.enabled = Boolean(hole)
      this.holePass.uniforms.uEnabled.value = hole ? 1 : 0
      if (hole) {
        this.holePass.uniforms.uRadius.value = hole.radius
        this.holePass.uniforms.uFeather.value = hole.feather
      }
      this.renderer.toneMappingExposure = 0.78
      this.composer.render()
      this.onFrame?.(live, livePalette)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.resize)
    this.current?.dispose(this.scene)
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
