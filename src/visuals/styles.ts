import * as THREE from 'three'
import type { AudioMetrics } from '../audio/AudioEngine'
import type { Palette } from './palette'
import { styleRng } from './rng'

export type VisualStyle = {
  id: string
  label: string
  hint: string
  bloom?: { base: number; pulse: number }
  holeMask?: { radius: number; feather: number }
  mount: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    palette: Palette,
  ) => void
  update: (
    metrics: AudioMetrics,
    time: number,
    dt: number,
    palette: Palette,
    speed?: number,
    sensitivity?: number,
  ) => void
  resize?: (w: number, h: number) => void
  dispose: (scene: THREE.Scene) => void
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
  })
}

function colorFrom(rgb: [number, number, number], target: THREE.Color) {
  return target.setRGB(rgb[0], rgb[1], rgb[2])
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function createCityWindows() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const cells: {
    x: number
    y: number
    bin: number
    phase: number
    occupied: boolean
    steady: boolean
    lane: number
  }[] = []
  for (let y = 4; y < 124; y += 10) {
    for (let x = 4; x < 60; x += 10) {
      const occupied = Math.random() > 0.34
      cells.push({
        x,
        y,
        bin: cells.length % 64,
        phase: Math.random() * Math.PI * 2,
        occupied,
        steady: occupied && Math.random() < 0.2,
        lane: cells.length % 3,
      })
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  const paint = (m: AudioMetrics, time: number, palette: Palette) => {
    if (!ctx) return
    ctx.fillStyle = '#0b0d14'
    ctx.fillRect(0, 0, 64, 128)
    const drift = time * 0.18 + m.bass * 0.55 + m.energy * 0.4
    for (const cell of cells) {
      if (!cell.occupied) {
        ctx.fillStyle = '#141820'
        ctx.fillRect(cell.x, cell.y, 6, 7)
        continue
      }
      if (cell.steady) {
        const tint = mixRgb(palette.a, palette.b, 0.35 + (cell.phase % 1) * 0.25)
        const r = Math.round(Math.min(1, tint[0] * 1.2 + 0.1) * 255)
        const g = Math.round(Math.min(1, tint[1] * 1.15 + 0.08) * 255)
        const b = Math.round(Math.min(1, tint[2] * 1.1 + 0.06) * 255)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`
        ctx.fillRect(cell.x, cell.y, 6, 7)
        continue
      }
      const spec = m.spectrum[cell.bin % m.spectrum.length] ?? 0
      const band =
        cell.lane === 0 ? m.bass : cell.lane === 1 ? m.mid : m.treble
      const cycle = (cell.lane / 3 + drift + spec * 0.35 + cell.phase * 0.08) % 1
      const rgb =
        cycle < 0.5
          ? mixRgb(palette.a, palette.b, cycle * 2)
          : mixRgb(palette.b, palette.c, (cycle - 0.5) * 2)
      const glow = 0.1 + spec * 0.95 + m.energy * 0.95 + band * 0.5
      const flicker = Math.sin(time * 11 + cell.phase) * m.treble * 0.16
      const alpha = Math.min(1, Math.max(0.06, glow + flicker))
      const lift = 1.05 + spec * 0.45 + m.energy * 0.4
      const r = Math.round(Math.min(1, rgb[0] * lift + 0.06) * 255)
      const g = Math.round(Math.min(1, rgb[1] * lift + 0.06) * 255)
      const b = Math.round(Math.min(1, rgb[2] * lift + 0.06) * 255)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.fillRect(cell.x, cell.y, 6, 7)
    }
    texture.needsUpdate = true
  }
  return { texture, paint }
}

function hexCellTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#5a3a14'
    ctx.fillRect(0, 0, 128, 128)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i
      const x = 64 + Math.cos(a) * 58
      const y = 64 + Math.sin(a) * 58
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    const wax = ctx.createRadialGradient(52, 48, 6, 64, 64, 60)
    wax.addColorStop(0, '#f0c56a')
    wax.addColorStop(0.45, '#d59a3a')
    wax.addColorStop(1, '#7a4a16')
    ctx.fillStyle = wax
    ctx.fill()
    ctx.strokeStyle = '#3d2410'
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()
  })
}

function clearNamed(scene: THREE.Scene, name: string) {
  const remove: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (o.name === name) remove.push(o)
  })
  remove.forEach((o) => {
    scene.remove(o)
    disposeObject(o)
  })
}

export function createNebula(): VisualStyle {
  let group: THREE.Group | null = null
  let arms: THREE.Points | null = null
  let dust: THREE.Points | null = null
  let sparks: THREE.Points | null = null
  let stars: THREE.Points | null = null
  let armMat: THREE.ShaderMaterial | null = null
  let starMat: THREE.ShaderMaterial | null = null
  const colorA = new THREE.Color()
  const colorB = new THREE.Color()
  const colorC = new THREE.Color()

  const particleMat = (
    size: number,
    glow: string,
  ) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uEnergy: { value: 0 },
        uA: { value: colorA },
        uB: { value: colorB },
        uC: { value: colorC },
        uSize: { value: size },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime, uBass, uEnergy, uSize;
        varying float vSeed;
        varying float vGlow;
        void main() {
          vSeed = aSeed;
          float t = uTime * (0.08 + aSeed * 0.42);
          vec3 p = position;
          float spin = t * (0.35 + aSeed * 0.8) + aSeed * 6.28318;
          float radius = length(p.xz);
          radius += sin(t * 1.4 + aSeed * 18.0) * (0.08 + uBass * 0.45);
          float twist = sin(radius * 0.55 - t) * (0.15 + uEnergy * 0.35);
          p.x = cos(spin + twist) * radius;
          p.z = sin(spin + twist) * radius;
          p.y += sin(t * 1.6 + aSeed * 14.0) * (0.12 + uEnergy * 0.55);
          vGlow = 0.52 + uEnergy * 0.6 + uBass * 0.3 + aSeed * 0.28;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (uSize + uBass * 3.2 + aSeed * 2.4) * (7.4 / max(1.3, -mv.z));
        }
      `,
      fragmentShader: glow,
    })

  return {
    id: 'nebula',
    label: 'Nebula',
    hint: 'Spiral dust and embers',
    bloom: { base: 0.42, pulse: 0.24 },
    mount(scene, camera, palette) {
      camera.position.set(0, 1.4, 10)
      camera.lookAt(0, 0, 0)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      const makeCloud = (count: number, spread: number, flatten: number) => {
        const positions = new Float32Array(count * 3)
        const seeds = new Float32Array(count)
        for (let i = 0; i < count; i++) {
          const arm = Math.floor(rng.next() * 4)
          const t = rng.next() * 6.2
          const r = 0.8 + Math.pow(rng.next(), 0.65) * spread
          const a = t + arm * 1.57 + r * 0.45
          positions[i * 3] = Math.cos(a) * r + (rng.next() - 0.5) * 0.7
          positions[i * 3 + 1] = (rng.next() - 0.5) * flatten
          positions[i * 3 + 2] = Math.sin(a) * r + (rng.next() - 0.5) * 0.7
          seeds[i] = rng.next()
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
        return geo
      }
      armMat = particleMat(
        1.9,
        `
          uniform vec3 uA, uB, uC;
          varying float vSeed, vGlow;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            float core = smoothstep(0.5, 0.05, d);
            float hot = smoothstep(0.18, 0.0, d);
            vec3 col = mix(uA, uB, vSeed);
            col = mix(col, uC, smoothstep(0.72, 1.0, vSeed));
            col += hot * 0.35;
            gl_FragColor = vec4(col * vGlow, core * 0.95);
          }
        `,
      )
      arms = new THREE.Points(makeCloud(11000, 7.2, 1.6), armMat)
      dust = new THREE.Points(
        makeCloud(6000, 8.8, 2.4),
        particleMat(
          1.1,
          `
            uniform vec3 uA, uB, uC;
            varying float vSeed, vGlow;
            void main() {
              vec2 uv = gl_PointCoord - 0.5;
              float d = length(uv);
              if (d > 0.5) discard;
              vec3 col = mix(uB, uC, vSeed);
              gl_FragColor = vec4(col * vGlow * 0.9, smoothstep(0.5, 0.0, d) * 0.6);
            }
          `,
        ),
      )
      sparks = new THREE.Points(
        makeCloud(900, 6.4, 2.8),
        particleMat(
          2.8,
          `
            uniform vec3 uA, uB, uC;
            varying float vSeed, vGlow;
            void main() {
              vec2 uv = gl_PointCoord - 0.5;
              float d = length(uv);
              if (d > 0.5) discard;
              float spike = pow(max(0.0, 1.0 - abs(uv.x) * 8.0), 2.0) + pow(max(0.0, 1.0 - abs(uv.y) * 8.0), 2.0);
              vec3 col = mix(uC, uA, vSeed);
              col += smoothstep(0.12, 0.0, d) * 0.6;
              gl_FragColor = vec4(col * (0.8 + vGlow * 1.2), (smoothstep(0.45, 0.0, d) + spike * 0.45) * 0.95);
            }
          `,
        ),
      )
      const starCount = 1400
      const starPos = new Float32Array(starCount * 3)
      const starSeed = new Float32Array(starCount)
      for (let i = 0; i < starCount; i++) {
        const r = 22 + rng.next() * 36
        const th = rng.next() * Math.PI * 2
        const ph = Math.acos(2 * rng.next() - 1)
        starPos[i * 3] = r * Math.sin(ph) * Math.cos(th)
        starPos[i * 3 + 1] = r * Math.cos(ph)
        starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
        starSeed[i] = rng.next()
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1))
      starMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uA: { value: colorA },
          uC: { value: colorC },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uTime;
          varying float vSeed;
          varying float vTw;
          void main() {
            vSeed = aSeed;
            vTw = 0.7 + 0.3 * sin(uTime * (0.4 + aSeed * 1.2) + aSeed * 14.0);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (0.7 + aSeed * 1.3) * (16.0 / max(6.0, -mv.z));
          }
        `,
        fragmentShader: `
          uniform vec3 uA, uC;
          varying float vSeed, vTw;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            vec3 col = mix(vec3(0.85, 0.9, 1.0), mix(uA, uC, vSeed), 0.22);
            gl_FragColor = vec4(col * vTw, smoothstep(0.5, 0.0, d) * mix(0.15, 0.55, vSeed));
          }
        `,
      })
      stars = new THREE.Points(starGeo, starMat)

      group.add(stars, arms, dust, sparks)
      scene.add(group)
    },
    update(m, time, _dt, palette) {
      if (!group || !armMat) return
      colorFrom(palette.a, colorA)
      colorFrom(palette.b, colorB)
      colorFrom(palette.c, colorC)
      group.traverse((child) => {
        const mat = (child as THREE.Points).material as THREE.ShaderMaterial
        if (!mat?.uniforms) return
        mat.uniforms.uTime.value = time
        if (mat.uniforms.uBass) mat.uniforms.uBass.value = m.bass
        if (mat.uniforms.uEnergy) mat.uniforms.uEnergy.value = m.energy
      })
      if (starMat) starMat.uniforms.uTime.value = time
      group.rotation.y = time * 0.035
      group.rotation.x = 0.28 + Math.sin(time * 0.07) * 0.08
      if (stars) stars.rotation.y = -group.rotation.y * 0.85
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      group = null
      arms = null
      dust = null
      sparks = null
      stars = null
      armMat = null
      starMat = null
    },
  }
}

export function createDusk(): VisualStyle {
  let group: THREE.Group | null = null
  let cameraRef: THREE.PerspectiveCamera | null = null
  let buildings: THREE.InstancedMesh | null = null
  let traffic: THREE.Points | null = null
  let windows: ReturnType<typeof createCityWindows> | null = null
  const dummy = new THREE.Object3D()
  let trafficCount = 0

  return {
    id: 'dusk',
    label: 'Dusk',
    hint: 'Fixed city orbit',
    mount(scene, camera, palette) {
      cameraRef = camera
      camera.fov = 58
      camera.far = 280
      camera.updateProjectionMatrix()
      scene.fog = new THREE.FogExp2(0x140c18, 0.022)
      scene.background = new THREE.Color(0x100814)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)

      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uA: { value: new THREE.Color(0x1a0c22) },
          uB: { value: new THREE.Color(0xc45a2a) },
          uC: { value: new THREE.Color(0x6a2a88) },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uA, uB, uC;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(uB, uC, smoothstep(0.18, 0.55, h));
            col = mix(col, uA, smoothstep(0.45, 0.95, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      group.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), skyMat))

      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(2.4, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.9 }),
      )
      sun.position.set(-28, 6.5, -40)
      group.add(sun)

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x0a0810,
          roughness: 0.92,
          metalness: 0.1,
          emissive: 0x120818,
          emissiveIntensity: 0.25,
        }),
      )
      ground.rotation.x = -Math.PI / 2
      group.add(ground)

      const grid = new THREE.GridHelper(70, 50, 0x3a2048, 0x1a1028)
      grid.position.y = 0.02
      group.add(grid)

      windows = createCityWindows()
      windows.texture.repeat.set(1, 2)
      const buildMat = new THREE.MeshStandardMaterial({
        map: windows.texture,
        emissiveMap: windows.texture,
        color: 0x1a1824,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.4,
        roughness: 0.62,
        metalness: 0.22,
      })
      windows.paint(
        {
          bass: 0,
          mid: 0,
          treble: 0,
          energy: 0.12,
          beat: false,
          spectrum: new Float32Array(64),
          waveform: new Float32Array(128),
        },
        0,
        palette,
      )
      const box = new THREE.BoxGeometry(1, 1, 1)
      box.translate(0, 0.5, 0)
      buildings = new THREE.InstancedMesh(box, buildMat, 520)
      let count = 0
      for (let x = -13; x <= 13; x++) {
        for (let z = -13; z <= 13; z++) {
          const dist = Math.hypot(x, z)
          if (dist < 2.2 || count >= 520) continue
          if (rng.next() < 0.12) continue
          const h = 0.7 + Math.pow(rng.next(), 1.35) * (8 + (14 - dist) * 0.55)
          dummy.position.set(x * 1.28, 0, z * 1.28)
          dummy.scale.set(0.45 + rng.next() * 0.55, h, 0.45 + rng.next() * 0.55)
          dummy.rotation.set(0, rng.int(4) * Math.PI * 0.5, 0)
          dummy.updateMatrix()
          buildings.setMatrixAt(count, dummy.matrix)
          count++
        }
      }
      buildings.count = count
      group.add(buildings)

      trafficCount = 90
      const tpos = new Float32Array(trafficCount * 3)
      const tseed = new Float32Array(trafficCount)
      for (let i = 0; i < trafficCount; i++) {
        tpos[i * 3] = (rng.next() - 0.5) * 36
        tpos[i * 3 + 1] = 1.2 + rng.next() * 7
        tpos[i * 3 + 2] = (rng.next() - 0.5) * 36
        tseed[i] = rng.next()
      }
      const tgeo = new THREE.BufferGeometry()
      tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3))
      tgeo.setAttribute('aSeed', new THREE.BufferAttribute(tseed, 1))
      traffic = new THREE.Points(
        tgeo,
        new THREE.PointsMaterial({
          color: 0xffc56a,
          size: 0.12,
          transparent: true,
          opacity: 0.85,
        }),
      )
      group.add(traffic)

      const key = new THREE.PointLight(0xff6a2a, 18, 70)
      key.position.set(-20, 10, -16)
      key.name = 'style-light'
      const fill = new THREE.PointLight(0x5a3cff, 10, 50)
      fill.position.set(14, 8, 10)
      fill.name = 'style-light'
      group.add(key, fill)
      scene.add(group)
    },
    update(m, time, dt, palette) {
      if (!group || !cameraRef) return
      windows?.paint(m, time, palette)
      const buildMat = buildings?.material as THREE.MeshStandardMaterial | undefined
      if (buildMat) {
        buildMat.emissive.setRGB(1, 1, 1)
        buildMat.emissiveIntensity = 0.2 + m.energy * 1.45 + m.bass * 0.35
      }
      if (traffic) {
        const pos = traffic.geometry.getAttribute('position') as THREE.BufferAttribute
        const seeds = traffic.geometry.getAttribute('aSeed') as THREE.BufferAttribute
        const cruise = 2.4 * dt
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i) + cruise * (0.4 + seeds.getX(i))
          if (x > 20) x = -20
          pos.setX(i, x)
        }
        pos.needsUpdate = true
      }
      const orbit = time * 0.07
      cameraRef.position.set(Math.cos(orbit) * 17.2, 6.1, Math.sin(orbit) * 17.2)
      cameraRef.lookAt(0, 2.3, 0)
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      windows?.texture.dispose()
      clearNamed(scene, 'style-light')
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      buildings = null
      traffic = null
      windows = null
      cameraRef = null
    },
  }
}

export function createWarp(): VisualStyle {
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  const uA = new THREE.Color()
  const uB = new THREE.Color()
  const uC = new THREE.Color()
  let flare = 0

  return {
    id: 'warp',
    label: 'Warp',
    hint: 'Through the wormhole',
    bloom: { base: 0.32, pulse: 0.12 },
    mount(scene, camera) {
      camera.position.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      scene.fog = null
      scene.background = new THREE.Color(0x02010a)
      material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 1 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uMode: { value: 0 },
          uFlare: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uA: { value: uA },
          uB: { value: uB },
          uC: { value: uC },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime, uSpeed, uBass, uMid, uTreble, uEnergy, uMode, uFlare;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 4; i++) {
              v += amp * noise(p);
              p *= 2.03;
              amp *= 0.5;
            }
            return v;
          }

          vec3 tone(vec3 c) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            return c * (0.58 / max(luma, 0.05));
          }

          vec3 neon(vec3 c) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            vec3 sat = max(mix(vec3(luma), c, 2.4), vec3(0.0));
            float l2 = dot(sat, vec3(0.299, 0.587, 0.114));
            return sat * (0.62 / max(l2, 0.05));
          }

          void main() {
            vec2 uv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
            float spin = uTime * (0.14 + uSpeed * 0.32);
            float cs = cos(spin);
            float sn = sin(spin);
            uv = mat2(cs, -sn, sn, cs) * uv;

            float r = length(uv);
            float lens = 0.14 / (r + 0.18);
            vec2 luv = uv * (1.0 + lens * 0.1);
            float lr = length(luv);
            float la = atan(luv.y, luv.x);
            float depth = log(max(lr, 0.02));
            float spiral = la + depth * 5.4;

            vec3 ca = tone(uA);
            vec3 cb = tone(uB);
            vec3 cc = tone(uC);
            vec3 na = neon(uA);
            vec3 nc = neon(uC);

            float n = fbm(vec2(spiral * 0.82, depth * 2.2));
            float n2 = fbm(vec2(spiral * 1.55 + 4.0, depth * 3.0));
            float arms = 0.5 + 0.5 * sin(spiral * 6.0);
            float arms2 = 0.5 + 0.5 * sin(spiral * 3.0 + 1.15);

            vec3 wall = mix(ca, cb, n);
            wall = mix(wall, cc, n2 * 0.42);
            wall *= 0.3 + arms * 0.72 + arms2 * 0.22;
            float wallFade = smoothstep(0.012, 0.08, lr) * exp(-lr * 0.45);
            wall *= wallFade * (0.5 + uEnergy * 0.22);

            float core = exp(-lr * 16.0);
            float throat = exp(-lr * 6.4) * 0.16;
            vec3 exitCol = mix(cc, vec3(0.72, 0.8, 0.9), 0.22);
            float fringe = exp(-abs(lr - 0.09) * 14.0);
            vec3 chroma = vec3(ca.r, cb.g, cc.b) * fringe * (0.42 + uFlare * 0.5);

            // neon energy rings rushing toward the viewer
            float travel = uTime * (0.4 + uSpeed * 0.6);
            float ringPos = depth * 1.7 - travel;
            float ringF = fract(ringPos);
            float ringId = floor(ringPos);
            float ring = exp(-abs(ringF - 0.5) * 34.0);
            float ringOdd = step(0.5, fract(ringId * 0.5));
            vec3 ringCol = mix(na, nc, ringOdd);
            ring *= wallFade * (0.5 + arms * 0.5) * (0.42 + uEnergy * 0.6 + uBass * 0.5 + uFlare * 1.1);

            // twisted neon lattice on the tunnel walls
            float lonF = fract(la / 6.2831853 * 26.0 + depth * 1.4);
            float lon = exp(-abs(lonF - 0.5) * 26.0);
            float lattice = lon * wallFade * (0.08 + uMid * 0.4 + uFlare * 0.3);
            lattice += lon * exp(-abs(ringF - 0.5) * 18.0) * wallFade * (0.45 + uFlare * 0.9);

            // crackling neon filaments along the spiral arms
            float fil = fbm(vec2(spiral * 2.2 + uTime * 0.6, depth * 4.0 - travel * 0.5));
            float filament = exp(-abs(fil - 0.5) * 36.0) * wallFade * (0.14 + uMid * 0.7 + uTreble * 0.4 + uFlare * 0.6);

            float stars = 0.0;
            float starTint = 0.0;
            for (int i = 0; i < 2; i++) {
              float fi = float(i);
              float lanes = 18.0 + fi * 9.0;
              float laneF = (la / 6.2831853 + 0.5) * lanes;
              float lane = floor(laneF);
              for (int k = 0; k < 3; k++) {
                vec2 id = vec2(lane, fi + float(k) * 3.1 + uMode);
                float h = hash(id);
                float sr = 0.1 + h * 1.05;
                float d = abs(lr - sr);
                float streak = exp(-d * 28.0) * (0.35 + h * 0.55);
                float ad = abs(fract(laneF + hash(id + 2.7)) - 0.5);
                streak *= 1.0 - smoothstep(0.012, 0.07, ad);
                stars += streak;
                starTint += streak * step(0.5, hash(id + 5.3));
              }
            }
            stars *= 0.65 + uTreble * 0.4 + uFlare * 0.4;
            float tintMix = clamp(starTint / max(stars, 0.001), 0.0, 1.0);
            vec3 starCol = mix(mix(vec3(0.84, 0.91, 1.0), na, 0.7), mix(vec3(0.84, 0.91, 1.0), nc, 0.7), tintMix);

            float space = fbm(luv * 3.0) * smoothstep(0.55, 1.4, lr);
            vec3 col = vec3(0.008, 0.01, 0.028);
            col += wall;
            col += exitCol * (core * 0.55 + throat);
            col += chroma;
            col += ringCol * ring;
            col += na * lattice;
            col += nc * filament;
            col += starCol * stars;
            col += mix(ca, cb, 0.5) * space * 0.12;
            col *= smoothstep(1.48, 0.26, lr);
            gl_FragColor = vec4(min(col, vec3(0.92)), 1.0);
          }
        `,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      scene.add(mesh)
      material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight)
    },
    update(m, time, dt, palette, speed = 1) {
      if (!material) return
      flare = Math.max(flare * Math.exp(-dt * 6), m.beat ? 1 : 0)
      material.uniforms.uTime.value = speed > 0.001 ? time / speed : time
      material.uniforms.uSpeed.value = speed
      material.uniforms.uBass.value = m.bass
      material.uniforms.uMid.value = m.mid
      material.uniforms.uTreble.value = m.treble
      material.uniforms.uEnergy.value = m.energy
      material.uniforms.uFlare.value = flare
      material.uniforms.uMode.value = palette.seed % 3
      colorFrom(palette.a, material.uniforms.uA.value)
      colorFrom(palette.b, material.uniforms.uB.value)
      colorFrom(palette.c, material.uniforms.uC.value)
    },
    resize(w, h) {
      if (material) material.uniforms.uRes.value.set(w, h)
    },
    dispose(scene) {
      if (mesh) {
        scene.remove(mesh)
        disposeObject(mesh)
      }
      mesh = null
      material = null
    },
  }
}

export function createPrism(): VisualStyle {
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  const uA = new THREE.Color()
  const uB = new THREE.Color()
  const uC = new THREE.Color()

  return {
    id: 'prism',
    label: 'Prism',
    hint: 'Light through glass',
    mount(scene, camera) {
      camera.position.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      scene.fog = null
      scene.background = new THREE.Color(0x04040a)
      material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uSeed: { value: 0.4 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uA: { value: uA },
          uB: { value: uB },
          uC: { value: uC },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime, uBass, uMid, uTreble, uEnergy, uSeed;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          vec2 rot2(vec2 p, float a) {
            float c = cos(a);
            float s = sin(a);
            return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          }

          float sdLine(vec2 p, vec2 a, vec2 b) {
            vec2 pa = p - a;
            vec2 ba = b - a;
            float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
            return length(pa - ba * h);
          }

          float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
            vec2 e0 = b - a;
            vec2 e1 = c - b;
            vec2 e2 = a - c;
            vec2 v0 = p - a;
            vec2 v1 = p - b;
            vec2 v2 = p - c;
            vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / max(dot(e0, e0), 0.0001), 0.0, 1.0);
            vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / max(dot(e1, e1), 0.0001), 0.0, 1.0);
            vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / max(dot(e2, e2), 0.0001), 0.0, 1.0);
            float s = sign(e0.x * e2.y - e0.y * e2.x);
            vec2 d = min(min(
              vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
              vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
              vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
            return -sqrt(d.x) * sign(d.y);
          }

          vec3 rainbow(float t) {
            t = fract(t);
            vec3 r = clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return mix(r, mix(uA, mix(uB, uC, t), t), 0.32) * 0.58;
          }

          float starLayer(vec2 uv, float t, float scale, vec2 drift, float thresh) {
            vec2 p = (uv + drift * t) * scale;
            vec2 id = floor(p);
            vec2 gv = fract(p) - 0.5;
            float n = hash(id + uSeed);
            if (n < thresh) return 0.0;
            vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
            float d = length(gv - off * 0.38);
            float size = mix(0.012, 0.034, hash(id + 2.4));
            float tw = 0.45 + 0.55 * sin(t * (1.1 + n * 2.4) + n * 28.0);
            return (1.0 - smoothstep(0.0, size, d)) * tw * (0.4 + n * 0.6);
          }

          void main() {
            vec2 uv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
            float t = uTime;
            float hue = t * (0.18 + uEnergy * 0.22) + uMid * 0.35 + uSeed * 0.4;
            float tilt = -0.08 + sin(t * 0.42) * 0.14 + sin(t * 0.19) * 0.06 + uBass * 0.1;
            float s = 0.36 + uBass * 0.03 + sin(t * 0.5) * 0.012;
            vec2 o = vec2(sin(t * 0.28) * 0.05, cos(t * 0.23) * 0.035);
            vec2 p0 = o + rot2(vec2(0.0, s * 0.92), tilt);
            vec2 p1 = o + rot2(vec2(-s * 0.9, -s * 0.58), tilt);
            vec2 p2 = o + rot2(vec2(s * 0.9, -s * 0.58), tilt);
            float enterT = clamp(0.5 + 0.2 * sin(t * 0.62 + uBass * 1.4) + 0.08 * sin(t * 1.15), 0.3, 0.76);
            float exitT = clamp(0.5 + 0.2 * sin(t * 0.54 + 1.3) + uMid * 0.08, 0.3, 0.76);
            vec2 enter = mix(p0, p1, enterT);
            vec2 exitp = mix(p0, p2, exitT);

            float dTri = sdTriangle(uv, p0, p1, p2);
            float inside = smoothstep(0.003, -0.003, dTri);
            float edge = exp(-abs(dTri) * 95.0);
            edge *= 0.72 + 0.28 * sin(t * 2.4 + uv.x * 10.0 + uTreble * 3.0);

            vec2 src = vec2(-1.35, enter.y + sin(t * 0.85) * 0.03);
            vec2 inDir = enter - src;
            float inAlong = clamp(dot(uv - src, inDir) / max(dot(inDir, inDir), 0.0001), 0.0, 1.0);
            float inW = 64.0 - uBass * 16.0 - sin(t * 1.6) * 6.0;
            float incoming = exp(-pow(sdLine(uv, src, enter) * inW, 2.0));
            incoming *= smoothstep(enter.x + 0.03, enter.x - 0.02, uv.x);
            incoming *= 0.55 + 0.45 * sin(inAlong * 16.0 - t * (4.2 + uEnergy * 3.5));

            float innerAlong = clamp(dot(uv - enter, exitp - enter) / max(dot(exitp - enter, exitp - enter), 0.0001), 0.0, 1.0);
            float inner = exp(-pow(sdLine(uv, enter, exitp) * 70.0, 2.0)) * inside;
            inner *= 0.55 + 0.45 * sin(innerAlong * 18.0 - t * 5.0);

            vec2 q = uv - exitp;
            float ang = atan(q.y, q.x);
            float reach = length(q);
            float spread = 0.26 + uMid * 0.14 + 0.05 * sin(t * 0.9);
            float fanMask = smoothstep(spread, spread * 0.12, abs(ang))
              * smoothstep(0.0, 0.06, reach)
              * smoothstep(1.25, 0.35, reach)
              * (1.0 - inside * 0.85);
            float specT = (ang + spread * 0.5) / max(spread, 0.05);
            float bands = 0.62 + 0.38 * sin(reach * 11.0 - t * (2.8 + uEnergy * 2.2) + specT * 5.0);
            vec3 fan = rainbow(specT + hue) * fanMask * bands * (0.44 + uEnergy * 0.3);

            vec3 rays = vec3(0.0);
            for (int i = 0; i < 7; i++) {
              float ft = float(i) / 6.0;
              float a = mix(-spread * 0.88, spread * 0.88, ft) + 0.03 * sin(t * 1.3 + ft * 5.0);
              vec2 dir = vec2(cos(a), sin(a));
              float rd = sdLine(uv, exitp, exitp + dir * 1.35);
              float ray = exp(-pow(rd * (118.0 - uEnergy * 28.0), 2.0));
              ray *= (1.0 - inside * 0.8);
              ray *= 0.58 + 0.42 * sin(reach * 13.0 - t * (3.6 + uEnergy * 2.8) + ft * 4.0);
              rays += rainbow(ft + hue) * ray * 0.58;
            }

            vec3 glass = mix(mix(uA, uB, 0.5 + 0.5 * sin(t * 0.45)), vec3(0.42, 0.58, 0.72), 0.45);
            vec3 col = vec3(0.016, 0.018, 0.035);
            float stars = 0.0;
            stars += starLayer(uv, t, 20.0, vec2(0.016, 0.009), 0.962);
            stars += starLayer(uv, t, 34.0, vec2(-0.011, 0.014), 0.974) * 0.75;
            stars += starLayer(uv, t, 52.0, vec2(0.008, -0.018), 0.984) * 0.5;
            col += vec3(0.8, 0.86, 1.0) * stars * mix(0.7 + uTreble * 0.2, 0.18, inside);
            col += mix(vec3(0.82, 0.88, 1.0), uA, 0.15) * incoming * (0.4 + uEnergy * 0.24);
            col += glass * inside * (0.12 + 0.04 * sin(t * 1.1));
            col += vec3(0.88, 0.94, 1.0) * edge * 0.5;
            col += rainbow(innerAlong + hue) * inner * 0.38;
            col += mix(uA, uC, 0.5 + 0.5 * sin(t * 0.6)) * inside * exp(-length(uv - o) * 3.2) * 0.06;
            col += fan;
            col += rays;
            col += rainbow(uv.x * 0.8 + hue) * exp(-pow(uv.x - 0.55 - sin(t * 0.4) * 0.08, 2.0) * 7.0)
              * exp(-pow(uv.y + 0.36, 2.0) * 16.0) * 0.18;

            float dust = step(0.9968, hash(floor(uv * 78.0 + vec2(t * 1.6, t * 0.3) + uSeed)));
            col += vec3(dust) * (incoming + fanMask) * (0.2 + uTreble * 0.25);

            float vig = smoothstep(1.28, 0.28, length(uv * vec2(0.85, 1.0)));
            gl_FragColor = vec4(min(col * vig, vec3(0.6)), 1.0);
          }
        `,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      scene.add(mesh)
      material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight)
    },
    update(m, time, _dt, palette) {
      if (!material) return
      material.uniforms.uTime.value = time
      material.uniforms.uBass.value = m.bass
      material.uniforms.uMid.value = m.mid
      material.uniforms.uTreble.value = m.treble
      material.uniforms.uEnergy.value = m.energy
      material.uniforms.uSeed.value = (palette.seed % 1000) / 1000
      colorFrom(palette.a, material.uniforms.uA.value)
      colorFrom(palette.b, material.uniforms.uB.value)
      colorFrom(palette.c, material.uniforms.uC.value)
    },
    resize(w, h) {
      if (material) material.uniforms.uRes.value.set(w, h)
    },
    dispose(scene) {
      if (mesh) {
        scene.remove(mesh)
        disposeObject(mesh)
      }
      mesh = null
      material = null
    },
  }
}

export function createAurora(): VisualStyle {
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  const uA = new THREE.Color()
  const uB = new THREE.Color()
  const uC = new THREE.Color()

  return {
    id: 'aurora',
    label: 'Aurora',
    hint: 'Curtains of night light',
    bloom: { base: 0.26, pulse: 0 },
    mount(scene, camera) {
      camera.position.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      scene.fog = null
      scene.background = new THREE.Color(0x04060c)
      material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: 0 },
          uBeat: { value: 0 },
          uEnergy: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uA: { value: uA },
          uB: { value: uB },
          uC: { value: uC },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime, uSeed, uBeat, uEnergy;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.03;
              a *= 0.5;
            }
            return v;
          }

          vec3 keepDim(vec3 pal, vec3 hue) {
            vec3 c = mix(hue, pal, 0.62);
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            return c * (0.5 / max(luma, 0.06));
          }

          float curtain(float x, float y, float center, float width, float t, float phase) {
            float fall = y + t * 0.22 + phase * 0.07;
            float sway = sin(fall * 1.15 + phase) * 0.11;
            sway += sin(fall * 2.4 - t * 0.18 + phase * 1.7) * 0.035;
            sway += (fbm(vec2(x * 0.55 + phase, fall * 0.85)) - 0.5) * 0.1;
            float d = abs(x - (center + sway));
            float body = exp(-d * d / max(width * width, 0.004));
            float folds = 0.62 + 0.38 * fbm(vec2(x * 2.1 + phase, fall * 1.55));
            float hang = smoothstep(0.12, 0.38, y) * smoothstep(0.98, 0.48, y);
            return body * folds * hang;
          }

          float waveAccent(float x, float y, float t, float phase) {
            float fall = y + t * 0.22 + phase * 0.05;
            float crest = smoothstep(0.42, 0.93, 0.5 + 0.5 * sin(fall * 2.55 - t * 0.46 + x * 0.85 + phase));
            return crest * (0.7 + 0.3 * fbm(vec2(x * 1.7 + phase, fall * 1.85)));
          }

          float hillProfile(float x, float salt) {
            return noise(vec2(x * 1.45 + salt, 2.3 + salt)) * 0.034
              + noise(vec2(x * 3.4 + salt * 1.6, 6.2)) * 0.013
              + sin(x * 1.05 + salt) * 0.01;
          }

          float pineRow(float x, float y, float base, float scale, float salt, float hMul) {
            float id = floor(x * scale + salt);
            float f = fract(x * scale + salt);
            float n = hash(vec2(id, salt + 1.7));
            float height = mix(0.02, 0.074, n) * hMul;
            float width = mix(0.15, 0.4, hash(vec2(id, salt + 4.9)));
            float px = f - 0.5 - (hash(vec2(id, salt + 11.2)) - 0.5) * 0.3;
            float py = y - base;
            float ht = clamp(py / max(height, 0.001), 0.0, 1.15);
            float w = max(0.0, 1.0 - ht) * width;
            float cone = 1.0 - smoothstep(w * 0.42, w + 0.018, abs(px));
            cone *= smoothstep(-0.005, 0.012, py) * smoothstep(height * 1.06, height * 0.86, py);
            return cone * step(0.16, n);
          }

          float forestMask(float x, float y, float base, float nearness) {
            float hill = smoothstep(base, base - 0.014, y);
            float trees = pineRow(x, y, base, mix(20.0, 15.0, nearness), 0.2 + nearness, mix(0.7, 1.15, nearness));
            trees = max(trees, pineRow(x, y, base - 0.004, mix(31.0, 24.0, nearness), 3.8 + nearness, mix(0.55, 0.95, nearness)));
            return max(hill, trees);
          }

          float meteor(vec2 p, float time, float cycle, float salt) {
            float local = mod(time + salt, cycle);
            float live = 1.0 - step(0.8, local);
            vec2 n = vec2(hash(vec2(floor((time + salt) / cycle), salt)), hash(vec2(salt + 2.1, floor((time + salt) / cycle))));
            vec2 tip = vec2(mix(-1.1, 0.9, n.x) + local * 1.6, mix(0.08, 0.42, n.y) - local * 0.55);
            vec2 d = p - tip;
            float streak = exp(-length(d) * 85.0);
            streak += exp(-abs(d.x * 0.55 + d.y) * 36.0 - length(d) * 7.0) * 0.5;
            return streak * live * (1.0 - local * 1.15);
          }

          void main() {
            vec2 uv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
            float t = uTime * 0.18 + uSeed * 0.001;
            float h = uv.y * 0.5 + 0.5;
            float s1 = curtain(uv.x, h, -0.2 + sin(t * 0.19) * 0.07, 0.145, t, 0.2);
            float s2 = curtain(uv.x, h, 0.22 + sin(t * 0.15 + 1.1) * 0.09, 0.12, t * 0.86, 2.4);
            float s3 = curtain(uv.x, h, 0.0 + sin(t * 0.12) * 0.14, 0.18, t * 1.04, 4.1);
            float s4 = curtain(uv.x, h, -0.5 + sin(t * 0.1 + 2.0) * 0.05, 0.1, t * 0.72, 5.8);
            float veil = fbm(vec2(uv.x * 1.15 + t * 0.04, h * 1.7 + t * 0.2));
            veil *= smoothstep(0.16, 0.42, h) * smoothstep(0.96, 0.5, h);

            vec3 green = keepDim(uA, vec3(0.18, 0.9, 0.42));
            vec3 teal = keepDim(uB, vec3(0.1, 0.58, 0.8));
            vec3 rose = keepDim(uC, vec3(0.9, 0.24, 0.55));

            vec3 aurora = green * s1 * 0.82;
            aurora += teal * s2 * 0.62;
            aurora += mix(green, rose, smoothstep(0.38, 0.84, h)) * s3 * 0.7;
            aurora += rose * s4 * 0.4 * smoothstep(0.4, 0.82, h);
            aurora += mix(green, teal, 0.45) * veil * 0.18;

            float a1 = waveAccent(uv.x, h, t, 0.3);
            float a2 = waveAccent(uv.x, h, t * 0.88, 2.5);
            vec3 highlight = mix(mix(green, teal, 0.35), vec3(0.86, 0.96, 1.0), 0.32);
            aurora += highlight * (a1 * s1 * 0.38 + a2 * s2 * 0.3 + a1 * s3 * 0.26);

            float farBase = -0.365 + hillProfile(uv.x, 0.35);
            float nearBase = -0.428 + hillProfile(uv.x * 0.92, 2.15) * 0.95;
            float farForest = forestMask(uv.x, uv.y, farBase, 0.15);
            float nearForest = forestMask(uv.x, uv.y, nearBase, 1.0);

            float spin = uTime * 0.016;
            vec2 pole = uv - vec2(0.16, 0.94);
            float cs = cos(spin);
            float sn = sin(spin);
            vec2 sky = vec2(0.16, 0.94) + vec2(pole.x * cs - pole.y * sn, pole.x * sn + pole.y * cs);
            vec2 saltA = vec2(mod(uSeed, 97.0), 3.0);
            vec2 saltB = vec2(5.0, mod(uSeed * 0.37, 89.0));
            vec2 cellA = floor(sky * 64.0 + saltA);
            vec2 cellB = floor(sky * 100.0 + saltB);
            float stars = step(0.992, hash(cellA)) * 0.7;
            stars += step(0.9955, hash(cellB));
            float pick = hash(cellA + 2.7);
            float flick = hash(cellA + floor(uTime * 16.0));
            float beatMix = clamp(uBeat * 0.92 + uEnergy * 0.12, 0.0, 1.0);
            vec3 starCol = mix(vec3(0.9, 0.93, 1.0), mix(uA, uC, pick), beatMix);
            starCol *= 0.78 + 0.22 * mix(1.0, 0.45 + 0.7 * flick, beatMix);
            float showers = meteor(uv, uTime, 12.5, 0.4);
            showers += meteor(uv, uTime, 18.0, 4.2);
            float aboveTrees = smoothstep(farBase + 0.02, farBase + 0.12, uv.y);
            stars *= aboveTrees;
            showers *= aboveTrees;

            float woods = 0.78 + 0.22 * noise(vec2(uv.x * 22.0, uv.y * 16.0));
            vec3 farCol = vec3(0.018, 0.028, 0.03) * woods;
            vec3 nearCol = vec3(0.008, 0.014, 0.012) * woods;
            farCol += aurora * 0.12 * (1.0 - smoothstep(farBase + 0.07, farBase - 0.01, uv.y));

            vec3 col = vec3(0.016, 0.022, 0.045) + starCol * stars;
            col += aurora;
            col += vec3(0.93, 0.96, 1.0) * showers;
            col = mix(col, farCol, clamp(farForest, 0.0, 1.0));
            col = mix(col, nearCol, clamp(nearForest, 0.0, 1.0));
            gl_FragColor = vec4(min(col, vec3(0.7)), 1.0);
          }
        `,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      scene.add(mesh)
      material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight)
    },
    update(m, time, dt, palette) {
      if (!material) return
      const beat = material.uniforms.uBeat
      if (m.beat) beat.value = 1
      else beat.value = Math.max(0, beat.value - dt * 3.1)
      material.uniforms.uTime.value = time
      material.uniforms.uEnergy.value = m.energy
      material.uniforms.uSeed.value = palette.seed
      colorFrom(palette.a, material.uniforms.uA.value)
      colorFrom(palette.b, material.uniforms.uB.value)
      colorFrom(palette.c, material.uniforms.uC.value)
    },
    resize(w, h) {
      if (material) material.uniforms.uRes.value.set(w, h)
    },
    dispose(scene) {
      if (mesh) {
        scene.remove(mesh)
        disposeObject(mesh)
      }
      scene.background = new THREE.Color(0x030308)
      mesh = null
      material = null
    },
  }
}

export function createCycle(): VisualStyle {
  let group: THREE.Group | null = null
  let cameraRef: THREE.PerspectiveCamera | null = null
  let gridMat: THREE.ShaderMaterial | null = null
  let cityMat: THREE.ShaderMaterial | null = null
  let skyMat: THREE.ShaderMaterial | null = null
  let steelMat: THREE.ShaderMaterial | null = null
  let sunMat: THREE.MeshBasicMaterial | null = null
  let sunHaloMat: THREE.MeshBasicMaterial | null = null
  let sunLit: THREE.DirectionalLight | null = null
  let bike: THREE.Group | null = null
  const lamps: THREE.Group[] = []
  const gridBars: THREE.Mesh[] = []
  const streaks: THREE.Mesh[] = []
  const neonMats: THREE.MeshBasicMaterial[] = []
  const bikeMats: THREE.MeshStandardMaterial[] = []
  let travel = 0
  const lampSpacing = 11
  const lampCount = 14
  const lampLoop = lampSpacing * lampCount
  const gridCell = 2.7
  const gridBarCount = 42
  const gridLoop = gridCell * gridBarCount
  const clouds: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; speed: number; lit: number }[] = []
  let plane: THREE.Group | null = null
  let planeStrobe: THREE.Mesh | null = null
  let planeBeacon: THREE.Mesh | null = null
  let planeActive = false
  let planeDir = 1
  let planeSpeed = 12
  let planeTimer = 5
  let heli: THREE.Group | null = null
  let heliRotor: THREE.Group | null = null
  let heliTailRotor: THREE.Mesh | null = null
  let heliBeacon: THREE.Mesh | null = null
  let heliBeam: THREE.Mesh | null = null
  let heliActive = false
  let heliT = 0
  let heliDur = 22
  let heliTimer = 12
  const heliFrom = new THREE.Vector3()
  const heliTo = new THREE.Vector3()
  let driveRng: () => number = Math.random
  const scanSegments = 26
  const scanBarWidth = 1.62
  const scanSegs: THREE.MeshBasicMaterial[] = []
  let scanGlowMat: THREE.MeshBasicMaterial | null = null
  let scanPhase = 0

  return {
    id: 'drive',
    label: 'Night Drive',
    hint: 'Cybertruck into the city',
    bloom: { base: 0.42, pulse: 0.12 },
    mount(scene, camera, palette) {
      cameraRef = camera
      camera.fov = 70
      camera.near = 0.12
      camera.far = 240
      camera.position.set(2.45, 2.28, 8.7)
      camera.lookAt(-0.15, 0.58, -14)
      camera.updateProjectionMatrix()
      scene.fog = new THREE.Fog(0x070614, 70, 170)
      scene.background = new THREE.Color(0x05050e)

      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      const neon = new THREE.Color().setRGB(...palette.a)
      const accent = new THREE.Color().setRGB(...palette.c)

      skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uNight: { value: new THREE.Color(0x04050f) },
          uDusk: { value: new THREE.Color(0x4a1638) },
          uSun: { value: new THREE.Color(0xff6a2c) },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uNight, uDusk, uSun;
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            float h = dir.y;
            vec3 col = uNight;
            float band = exp(-pow((h - 0.015) * 14.0, 2.0));
            float glow = exp(-pow((h + 0.01) * 22.0, 2.0));
            col = mix(col, uDusk, band * 0.7);
            col += uSun * glow * 0.38;
            vec3 sunDir = normalize(vec3(0.0, 0.03, -1.0));
            float sun = smoothstep(0.085, 0.018, length(dir - sunDir));
            col += uSun * sun * 0.85;
            col += uSun * exp(-length(dir - sunDir) * 12.0) * 0.22;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const sky = new THREE.Mesh(new THREE.SphereGeometry(130, 32, 20), skyMat)
      sky.renderOrder = -2
      group.add(sky)

      const starCount = 160
      const starPos = new Float32Array(starCount * 3)
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (rng.next() - 0.5) * 110
        starPos[i * 3 + 1] = 8 + rng.next() * 40
        starPos[i * 3 + 2] = -20 - rng.next() * 80
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      group.add(
        new THREE.Points(
          starGeo,
          new THREE.PointsMaterial({
            color: 0xb8c4e0,
            size: 0.09,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            fog: false,
          }),
        ),
      )

      sunMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a })
      const sun = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 24), sunMat)
      sun.position.set(0, 2.6, -118)
      group.add(sun)
      sunHaloMat = new THREE.MeshBasicMaterial({
        color: 0xff5522,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      })
      const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(7.2, 16, 16), sunHaloMat)
      sunHalo.position.copy(sun.position)
      group.add(sunHalo)

      driveRng = () => rng.next()
      planeActive = false
      planeTimer = 5
      heliActive = false
      heliTimer = 12

      const cloudTex = (seed: number) => {
        const tex = canvasTexture(256, 128, (ctx) => {
          ctx.clearRect(0, 0, 256, 128)
          const r = styleRng(seed)
          for (let i = 0; i < 14; i++) {
            const cx = 36 + r.next() * 184
            const cy = 46 + r.next() * 36 + (i % 3) * 6
            const rad = 20 + r.next() * 30
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
            g.addColorStop(0, 'rgba(255,255,255,0.5)')
            g.addColorStop(0.55, 'rgba(255,255,255,0.2)')
            g.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = g
            ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
          }
        })
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        return tex
      }
      const cloudTextures = [cloudTex(palette.seed + 11), cloudTex(palette.seed + 47), cloudTex(palette.seed + 83)]
      const cloudGeo = new THREE.PlaneGeometry(1, 1)
      for (let i = 0; i < 16; i++) {
        const depth = rng.next()
        const mat = new THREE.MeshBasicMaterial({
          map: cloudTextures[i % 3],
          transparent: true,
          opacity: 0.35 + rng.next() * 0.3,
          depthWrite: false,
          fog: false,
          color: 0x14141e,
        })
        const mesh = new THREE.Mesh(cloudGeo, mat)
        const width = 14 + rng.next() * 18 + depth * 10
        mesh.scale.set(width, width * (0.28 + rng.next() * 0.14), 1)
        const y = 9 + rng.next() * 20
        mesh.position.set((rng.next() - 0.5) * 210, y, -52 - depth * 55)
        mesh.renderOrder = -1
        clouds.push({ mesh, mat, speed: 1.4 + (1 - depth) * 1.8 + rng.next() * 0.6, lit: 0.22 + (1 - (y - 9) / 20) * 0.5 })
        group.add(mesh)
      }

      const craftMat = new THREE.MeshStandardMaterial({
        color: 0x2a2e3a,
        metalness: 0.55,
        roughness: 0.45,
        emissive: 0x1a1c26,
        emissiveIntensity: 0.6,
      })
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a })
      const greenMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 })
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

      plane = new THREE.Group()
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 10), craftMat)
      fuselage.rotation.z = Math.PI / 2
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), craftMat)
      nose.rotation.z = -Math.PI / 2
      nose.position.x = 1.55
      const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10), craftMat)
      tailCone.rotation.z = Math.PI / 2
      tailCone.position.x = -1.65
      const wings = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 3.6), craftMat)
      wings.position.set(0.1, -0.05, 0)
      const hStab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 1.3), craftMat)
      hStab.position.set(-1.6, 0.05, 0)
      const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.05), craftMat)
      vFin.position.set(-1.62, 0.38, 0)
      const navLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), redMat)
      navLeft.position.set(0.15, -0.03, -1.8)
      const navRight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), greenMat)
      navRight.position.set(0.15, -0.03, 1.8)
      planeStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat)
      planeStrobe.position.set(-1.9, 0.05, 0)
      planeBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), redMat)
      planeBeacon.position.set(-0.2, -0.22, 0)
      const cabinLights = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.05, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.7 }),
      )
      cabinLights.position.set(0.1, 0.03, 0.165)
      const cabinLights2 = cabinLights.clone()
      cabinLights2.position.z = -0.165
      plane.add(fuselage, nose, tailCone, wings, hStab, vFin, navLeft, navRight, planeStrobe, planeBeacon, cabinLights, cabinLights2)
      plane.scale.setScalar(2.8)
      plane.visible = false
      group.add(plane)

      heli = new THREE.Group()
      const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), craftMat)
      cabin.scale.set(0.8, 0.7, 1.25)
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x081018, metalness: 0.5, roughness: 0.1 }),
      )
      canopy.scale.set(0.72, 0.6, 0.9)
      canopy.position.set(0, 0.08, 0.42)
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 2.2, 8), craftMat)
      boom.rotation.x = Math.PI / 2
      boom.position.set(0, 0.05, -1.5)
      const finV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.35), craftMat)
      finV.position.set(0, 0.3, -2.55)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), craftMat)
      mast.position.set(0, 0.55, 0)
      heliRotor = new THREE.Group()
      const bladeA = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.03, 0.16), craftMat)
      const bladeB = bladeA.clone()
      bladeB.rotation.y = Math.PI / 2
      const rotorDisc = new THREE.Mesh(
        new THREE.CircleGeometry(2.7, 28),
        new THREE.MeshBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
      )
      rotorDisc.rotation.x = -Math.PI / 2
      heliRotor.add(bladeA, bladeB, rotorDisc)
      heliRotor.position.set(0, 0.74, 0)
      heliTailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.1), craftMat)
      heliTailRotor.position.set(0.08, 0.3, -2.6)
      for (const s of [-1, 1]) {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.5), craftMat)
        skid.position.set(s * 0.42, -0.6, 0.1)
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), craftMat)
        strut.position.set(s * 0.4, -0.45, 0.1)
        heli.add(skid, strut)
      }
      heliBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), redMat)
      heliBeacon.position.set(0, 0.32, -2.3)
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), whiteMat)
      belly.position.set(0, -0.44, 0.2)
      const heliNav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), greenMat)
      heliNav.position.set(0.5, -0.1, 0.3)
      const heliNav2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), redMat)
      heliNav2.position.set(-0.5, -0.1, 0.3)
      heli.add(heliNav, heliNav2)
      const beamGeo = new THREE.ConeGeometry(1.6, 7, 18, 1, true)
      beamGeo.translate(0, -3.5, 0)
      heliBeam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xdfe8ff,
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      heliBeam.position.set(0, -0.4, 0.2)
      heliBeam.rotation.x = -0.4
      heli.add(cabin, canopy, boom, finV, mast, heliRotor, heliTailRotor, heliBeacon, belly, heliBeam)
      heli.scale.setScalar(1.5)
      heli.visible = false
      group.add(heli)

      gridMat = new THREE.ShaderMaterial({
        fog: false,
        uniforms: {
          uTravel: { value: 0 },
          uEnergy: { value: 0 },
          uNeon: { value: neon.clone() },
          uAccent: { value: accent.clone() },
          uFog: { value: new THREE.Color(0x070614) },
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: `
          uniform float uTravel, uEnergy;
          uniform vec3 uNeon, uAccent, uFog;
          varying vec3 vWorld;
          void main() {
            float ax = abs(vWorld.x);
            float road = 1.0 - smoothstep(5.4, 6.8, ax);
            float dash = step(0.42, fract((vWorld.z - uTravel) * 0.16));
            float mid = (1.0 - smoothstep(0.03, 0.1, ax)) * dash;
            float edge = 1.0 - smoothstep(0.05, 0.22, abs(ax - 5.5));
            float luma = max(dot(uNeon, vec3(0.299, 0.587, 0.114)), 0.05);
            vec3 glow = uNeon * (1.05 / luma);
            vec3 col = vec3(0.01, 0.012, 0.028);
            col += uAccent * mid * 1.05;
            col += glow * edge * road * 1.1;
            float fog = smoothstep(78.0, 160.0, length(vec2(vWorld.x * 0.4, vWorld.z + 6.0)));
            col = mix(col, uFog, fog);
            gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
          }
        `,
      })
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 260), gridMat)
      ground.rotation.x = -Math.PI / 2
      ground.position.set(0, 0, -50)
      group.add(ground)

      const railMat = new THREE.MeshBasicMaterial({ color: neon })
      neonMats.push(railMat)
      for (const x of [-5.55, 5.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 240), railMat)
        rail.position.set(x, 0.05, -50)
        group.add(rail)
      }
      for (const x of [-3.7, -1.85, 1.85, 3.7]) {
        const lane = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 240), railMat)
        lane.position.set(x, 0.03, -50)
        group.add(lane)
      }
      for (let i = 0; i < gridBarCount; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(11.15, 0.05, 0.09), railMat)
        bar.position.set(0, 0.035, 0)
        gridBars.push(bar)
        group.add(bar)
      }

      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x12121a,
        metalness: 0.78,
        roughness: 0.3,
      })
      const lampMat = new THREE.MeshBasicMaterial({ color: accent })
      const housingMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a24,
        metalness: 0.6,
        roughness: 0.35,
        emissive: accent,
        emissiveIntensity: 0.15,
      })
      neonMats.push(lampMat)
      bikeMats.push(housingMat)
      for (let i = 0; i < lampCount; i++) {
        for (const side of [-1, 1]) {
          const lamp = new THREE.Group()
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.8, 6), poleMat)
          pole.position.y = 1.9
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.04), poleMat)
          arm.position.set(side * -0.42, 3.78, 0)
          const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), housingMat)
          housing.position.set(side * -0.88, 3.7, 0)
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lampMat)
          bulb.position.set(side * -0.88, 3.62, 0)
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 12), lampMat)
          ring.position.set(side * -0.88, 3.62, 0)
          ring.rotation.x = Math.PI / 2
          lamp.add(pole, arm, housing, bulb, ring)
          lamp.position.set(side * 6.2, 0, 0)
          lamps.push(lamp)
          group.add(lamp)
        }
      }

      const dummy = new THREE.Object3D()
      cityMat = new THREE.ShaderMaterial({
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uA: { value: neon.clone() },
          uB: { value: new THREE.Color().setRGB(...palette.b) },
          uC: { value: accent.clone() },
          uSun: { value: new THREE.Color(0xff6a32) },
          uFog: { value: new THREE.Color(0x070614) },
        },
        vertexShader: `
          varying vec3 vWorld;
          varying vec3 vN;
          void main() {
            vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uA, uB, uC, uSun, uFog;
          varying vec3 vWorld;
          varying vec3 vN;
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          vec3 lift(vec3 c) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            return c * (0.72 / max(luma, 0.06));
          }
          void main() {
            vec3 n = normalize(vN);
            vec3 body = vec3(0.018, 0.016, 0.03);
            float idX = floor(vWorld.x * 1.7);
            float idY = floor(vWorld.y * 1.45);
            vec2 id = vec2(idX, idY);
            float lit = step(0.38, hash(id));
            float cellX = abs(fract(vWorld.x * 1.7) - 0.5);
            float cellY = abs(fract(vWorld.y * 1.45) - 0.5);
            float pane = smoothstep(0.46, 0.3, cellX) * smoothstep(0.46, 0.3, cellY);
            float win = lit * pane * step(1.15, vWorld.y);
            float pick = hash(id + 3.1);
            vec3 lamp = mix(lift(uA), lift(uC), pick);
            lamp = mix(lamp, lift(uB), step(0.72, hash(id + 8.4)) * 0.65);
            float steady = step(0.8, hash(id + 11.0));
            float flick = 0.7 + 0.3 * sin(uTime * (2.2 + hash(id + 1.7) * 3.4) + idY);
            lamp *= mix(flick, 1.0, steady);
            vec3 col = mix(body, lamp, win * 0.88);
            float back = max(0.0, -n.z);
            col += uSun * back * 0.2;
            vec3 view = normalize(cameraPosition - vWorld);
            float rim = pow(1.0 - abs(dot(n, view)), 2.4);
            col += uSun * rim * 0.32;
            float fog = smoothstep(88.0, 155.0, length(vec2(vWorld.x * 0.35, vWorld.z + 8.0)));
            col = mix(col, uFog, fog);
            gl_FragColor = vec4(min(col, vec3(0.85)), 1.0);
          }
        `,
      })
      const footprints: { x: number; z: number; w: number; d: number; h: number }[] = []
      const rows = [
        { z: -80, count: 17, spread: 46, hMul: 0.72 },
        { z: -86, count: 15, spread: 40, hMul: 1.0 },
        { z: -92, count: 11, spread: 32, hMul: 1.28 },
      ]
      for (const row of rows) {
        for (let i = 0; i < row.count; i++) {
          const t = row.count === 1 ? 0 : i / (row.count - 1)
          const x = (t - 0.5) * row.spread + (rng.next() - 0.5) * 0.7
          const center = 1 - Math.abs(t - 0.5) * 1.7
          const h = (4.5 + center * 16 * row.hMul + rng.next() * 3.2) * (0.85 + rng.next() * 0.25)
          footprints.push({
            x,
            z: row.z + (rng.next() - 0.5) * 1.2,
            w: 1.7 + rng.next() * 1.1,
            d: 1.8 + rng.next() * 0.9,
            h,
          })
        }
      }
      const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, footprints.length)
      footprints.forEach((b, i) => {
        dummy.position.set(b.x, b.h * 0.5, b.z)
        dummy.scale.set(b.w, b.h, b.d)
        dummy.updateMatrix()
        city.setMatrixAt(i, dummy.matrix)
      })
      city.instanceMatrix.needsUpdate = true
      group.add(city)

      const hillMat = new THREE.MeshBasicMaterial({ color: 0x06050c })
      for (const x of [-44, 42]) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(20, 6.5, 8), hillMat)
        hill.position.set(x, 2.1, -108)
        hill.scale.set(1.5, 1, 0.65)
        group.add(hill)
      }

      steelMat = new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: new THREE.Color(0xff6a32) },
          uFill: { value: new THREE.Color(0xc8d0d8) },
        },
        vertexShader: `
          varying vec3 vWorld;
          varying vec3 vN;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: `
          uniform vec3 uSun, uFill;
          varying vec3 vWorld;
          varying vec3 vN;
          void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(cameraPosition - vWorld);
            vec3 r = reflect(-v, n);
            float fres = pow(1.0 - max(dot(n, v), 0.0), 2.1);
            float key = pow(max(dot(n, normalize(vec3(0.45, 0.8, 0.5))), 0.0), 1.15);
            float sun = pow(max(dot(r, normalize(vec3(0.08, 0.22, -1.0))), 0.0), 20.0);
            float cam = pow(max(dot(n, normalize(vec3(-0.15, 0.35, 0.92))), 0.0), 6.0);
            vec3 steel = vec3(0.22, 0.24, 0.27);
            vec3 col = steel * (0.34 + key * 0.55);
            col += vec3(0.18, 0.2, 0.23) * fres * 0.35;
            col += uSun * sun * 0.18;
            col += vec3(0.42, 0.45, 0.48) * cam * 0.16;
            gl_FragColor = vec4(min(col, vec3(0.48)), 1.0);
          }
        `,
      })
      const darkMat = new THREE.MeshStandardMaterial({
        color: 0x14161a,
        metalness: 0.7,
        roughness: 0.38,
      })
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x0a1216,
        metalness: 0.45,
        roughness: 0.06,
        emissive: accent,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.5,
      })
      const stripMat = new THREE.MeshBasicMaterial({ color: neon })
      const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x0e0e12,
        metalness: 0.35,
        roughness: 0.6,
      })
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x3a3f45,
        metalness: 0.85,
        roughness: 0.28,
      })
      bikeMats.push(glassMat)
      neonMats.push(stripMat)

      bike = new THREE.Group()
      const profile = new THREE.Shape()
      profile.moveTo(1.22, 0.16)
      profile.lineTo(1.22, 0.7)
      profile.lineTo(0.9, 1.18)
      profile.lineTo(-0.08, 1.06)
      profile.lineTo(-1.42, 0.5)
      profile.lineTo(-1.56, 0.24)
      profile.lineTo(-1.44, 0.16)
      profile.closePath()
      const hullGeo = new THREE.ExtrudeGeometry(profile, {
        depth: 1.72,
        bevelEnabled: false,
        steps: 1,
      })
      hullGeo.translate(0, 0, -0.86)
      hullGeo.rotateY(-Math.PI / 2)
      const hull = new THREE.Mesh(hullGeo, steelMat)
      const folds = new THREE.LineSegments(
        new THREE.EdgesGeometry(hullGeo, 12),
        new THREE.LineBasicMaterial({ color: 0x5a6168 }),
      )
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.03, 1.22), glassMat)
      windshield.position.set(0, 0.82, -0.68)
      windshield.rotation.x = 0.4
      const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.36, 0.03), glassMat)
      rearGlass.position.set(0, 0.96, 1.02)
      rearGlass.rotation.x = 0.72
      const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 1.05), glassMat)
      sideGlassL.position.set(-0.87, 0.86, 0.18)
      const sideGlassR = sideGlassL.clone()
      sideGlassR.position.x = 0.87
      const lightBar = new THREE.Group()
      const barHousing = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.1, 0.04), darkMat)
      barHousing.position.set(0, 0.7, 1.235)
      lightBar.add(barHousing)
      const segGeo = new THREE.BoxGeometry(scanBarWidth / scanSegments - 0.008, 0.07, 0.05)
      scanSegs.length = 0
      for (let i = 0; i < scanSegments; i++) {
        const segMat = new THREE.MeshBasicMaterial({ color: 0x300308 })
        const seg = new THREE.Mesh(segGeo, segMat)
        seg.position.set(((i + 0.5) / scanSegments - 0.5) * scanBarWidth, 0.7, 1.25)
        scanSegs.push(segMat)
        lightBar.add(seg)
      }
      scanGlowMat = new THREE.MeshBasicMaterial({
        color: 0xff1a2a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
      const barGlow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.03), scanGlowMat)
      barGlow.position.set(0, 0.7, 1.28)
      barGlow.name = 'drive-scan-glow'
      const brakeMat = new THREE.MeshBasicMaterial({ color: 0xff1428 })
      const brakeGlowMat = new THREE.MeshBasicMaterial({
        color: 0xff2a3a,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
      const brakeL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.055), brakeMat)
      brakeL.position.set(-0.64, 0.54, 1.255)
      const brakeR = brakeL.clone()
      brakeR.position.x = 0.64
      const brakeGlowL = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.03), brakeGlowMat)
      brakeGlowL.position.set(-0.64, 0.54, 1.29)
      const brakeGlowR = brakeGlowL.clone()
      brakeGlowR.position.x = 0.64
      const frontBar = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.035, 0.04), stripMat)
      frontBar.position.set(0, 0.42, -1.5)
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.12, 0.16), darkMat)
      bumper.position.set(0, 0.24, 1.22)
      const nosePlate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.12), darkMat)
      nosePlate.position.set(0, 0.22, -1.5)
      const vault = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.05, 0.72), steelMat)
      vault.position.set(0, 0.72, 0.52)
      const seamL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.42, 1.15), darkMat)
      seamL.position.set(-0.87, 0.62, 0.12)
      const seamR = seamL.clone()
      seamR.position.x = 0.87
      const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 2.05), darkMat)
      skirtL.position.set(-0.78, 0.2, -0.08)
      const skirtR = skirtL.clone()
      skirtR.position.x = 0.78
      const glowStrip = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.02, 2.2),
        new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.22, depthWrite: false }),
      )
      glowStrip.position.set(0, 0.12, 0)
      neonMats.push(glowStrip.material as THREE.MeshBasicMaterial)
      const addMirror = (x: number) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), darkMat)
        arm.position.set(x, 0.92, 0.22)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.08), darkMat)
        cap.position.set(x + Math.sign(x) * 0.12, 0.94, 0.22)
        bike!.add(arm, cap)
      }
      addMirror(-0.88)
      addMirror(0.88)
      const placeWheel = (x: number, z: number) => {
        const well = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.7), darkMat)
        well.position.set(x * 0.78, 0.4, z)
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.34, 20), wheelMat)
        tire.rotation.z = Math.PI / 2
        tire.position.set(x, 0.4, z)
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12), rimMat)
        rim.rotation.z = Math.PI / 2
        rim.position.set(x, 0.4, z)
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 10), darkMat)
        hub.rotation.z = Math.PI / 2
        hub.position.set(x, 0.4, z)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 20), stripMat)
        ring.position.set(x, 0.4, z)
        ring.rotation.y = Math.PI / 2
        bike!.add(well, tire, rim, hub, ring)
      }
      placeWheel(-1.02, 0.78)
      placeWheel(1.02, 0.78)
      placeWheel(-1.02, -0.88)
      placeWheel(1.02, -0.88)
      bike.add(
        hull,
        folds,
        windshield,
        rearGlass,
        sideGlassL,
        sideGlassR,
        lightBar,
        barGlow,
        brakeL,
        brakeR,
        brakeGlowL,
        brakeGlowR,
        frontBar,
        bumper,
        nosePlate,
        vault,
        seamL,
        seamR,
        skirtL,
        skirtR,
        glowStrip,
      )
      bike.position.set(0, 0, 4.15)
      bike.scale.setScalar(1.08)
      group.add(bike)

      const streakMat = new THREE.MeshBasicMaterial({
        color: neon,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
      neonMats.push(streakMat)
      for (let i = 0; i < 28; i++) {
        const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.8 + rng.next() * 1.4), streakMat)
        streak.position.set((rng.next() - 0.5) * 10, 0.2 + rng.next() * 2.4, -rng.next() * 80)
        streaks.push(streak)
        group.add(streak)
      }

      const hemi = new THREE.HemisphereLight(0x3a2848, 0x08060c, 0.35)
      sunLit = new THREE.DirectionalLight(0xff6633, 0.55)
      sunLit.position.set(0, 10, -140)
      sunLit.target.position.set(0, 1, 8)
      group.add(sunLit.target)
      const fill = new THREE.PointLight(0xffd2b0, 5.4, 10)
      fill.position.set(2.6, 2.8, 6.8)
      const rim = new THREE.PointLight(0x89a8c8, 3.2, 8)
      rim.position.set(-2.1, 2.1, 5.4)
      const under = new THREE.PointLight(0x44ffff, 2.1, 5)
      under.position.set(0, 0.28, 4.15)
      under.name = 'drive-under'
      const brakeLit = new THREE.PointLight(0xff2030, 1.8, 4.2)
      brakeLit.position.set(0, 0.7, 5.45)
      brakeLit.name = 'drive-scan-light'
      group.add(hemi, sunLit, fill, rim, under, brakeLit)

      scene.add(group)
    },
    update(m, time, dt, palette) {
      if (!group || !cameraRef) return
      travel += (15 + m.energy * 9) * dt
      if (gridMat) {
        gridMat.uniforms.uTravel.value = travel
        gridMat.uniforms.uEnergy.value = m.energy
        colorFrom(palette.a, gridMat.uniforms.uNeon.value)
        colorFrom(palette.c, gridMat.uniforms.uAccent.value)
      }
      if (cityMat) {
        cityMat.uniforms.uTime.value = time
        colorFrom(palette.a, cityMat.uniforms.uA.value)
        colorFrom(palette.b, cityMat.uniforms.uB.value)
        colorFrom(palette.c, cityMat.uniforms.uC.value)
      }
      const neon = new THREE.Color().setRGB(...palette.a)
      const accent = new THREE.Color().setRGB(...palette.c)
      const sunCol = new THREE.Color().setRGB(...palette.b).lerp(accent, 0.28 + m.mid * 0.4)
      const duskCol = neon.clone().lerp(new THREE.Color().setRGB(...palette.b), 0.45)
      const lift = (c: THREE.Color, target: number) => {
        const luma = Math.max(c.r * 0.299 + c.g * 0.587 + c.b * 0.114, 0.05)
        return c.multiplyScalar(target / luma)
      }
      lift(sunCol, 0.8 + m.energy * 0.2 + m.bass * 0.08)
      lift(duskCol, 0.26 + m.bass * 0.14)
      if (skyMat) {
        skyMat.uniforms.uSun.value.copy(sunCol)
        skyMat.uniforms.uDusk.value.copy(duskCol)
      }
      if (cityMat) cityMat.uniforms.uSun.value.copy(sunCol)
      if (steelMat) steelMat.uniforms.uSun.value.copy(sunCol)
      if (sunMat) sunMat.color.copy(sunCol)
      if (sunHaloMat) {
        sunHaloMat.color.copy(sunCol)
        sunHaloMat.opacity = 0.1 + m.energy * 0.08
      }
      if (sunLit) {
        sunLit.color.copy(sunCol)
        sunLit.intensity = 0.5 + m.energy * 0.35
      }
      const lit = neon.clone().multiplyScalar(0.8 + m.energy * 0.35)
      for (let i = 0; i < neonMats.length; i++) {
        neonMats[i].color.copy(i % 2 ? accent : lit)
      }
      for (const mat of bikeMats) {
        mat.emissive.copy(neon)
        mat.emissiveIntensity = 0.1 + m.energy * 0.22 + m.bass * 0.1
      }
      for (let i = 0; i < lamps.length; i++) {
        const pair = Math.floor(i / 2)
        lamps[i].position.z = ((pair * lampSpacing + travel) % lampLoop) - lampLoop + 7
      }
      for (let i = 0; i < gridBars.length; i++) {
        gridBars[i].position.z = ((i * gridCell + travel) % gridLoop) - gridLoop + 10
      }
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i]
        s.position.z += (22 + m.energy * 14) * dt
        if (s.position.z > 8) {
          s.position.z = -90 - (i % 7) * 4
          s.position.x = ((i * 17) % 100) / 10 - 5
        }
      }
      if (bike) {
        bike.position.y = Math.sin(time * 8.5) * 0.012
        bike.rotation.z = Math.sin(time * 0.7) * 0.01
        bike.rotation.x = Math.sin(time * 1.1) * 0.006

        // KITT-style scanner: red pulse sweeping left to right and back with a fading trail
        scanPhase = (scanPhase + dt * (0.5 + m.energy * 0.25)) % 1
        const tri = 1 - Math.abs(scanPhase * 2 - 1)
        const eased = tri * tri * (3 - 2 * tri)
        const scanX = (eased - 0.5) * scanBarWidth
        const dir = scanPhase < 0.5 ? 1 : -1
        const hot = 1 + m.bass * 0.5
        for (let i = 0; i < scanSegs.length; i++) {
          const segX = ((i + 0.5) / scanSegments - 0.5) * scanBarWidth
          const d = segX - scanX
          const head = Math.exp(-(d * d) * 220)
          const behind = d * dir < 0 ? Math.exp(-Math.abs(d) * 7.5) * 0.55 : 0
          const level = Math.min(1, head + behind)
          scanSegs[i].color.setRGB(0.16 + level * 1.15 * hot, 0.01 + level * 0.06, 0.02 + level * 0.1)
        }
        const glow = bike.getObjectByName('drive-scan-glow')
        if (glow) glow.position.x = scanX
        if (scanGlowMat) scanGlowMat.opacity = 0.42 + m.bass * 0.25
        const scanLit = group.getObjectByName('drive-scan-light') as THREE.PointLight | undefined
        if (scanLit) {
          scanLit.position.x = scanX * bike.scale.x
          scanLit.intensity = 2.2 + m.bass * 1.6
        }
      }
      const under = group.getObjectByName('drive-under') as THREE.PointLight | undefined
      if (under) {
        under.color.copy(accent)
        under.intensity = 1.8 + m.energy * 1.4
      }

      const cloudBase = new THREE.Color(0.1, 0.1, 0.16)
      const cloudWarm = sunCol.clone().multiplyScalar(0.5)
      for (const c of clouds) {
        c.mesh.position.x += c.speed * dt
        if (c.mesh.position.x > 118) c.mesh.position.x = -118
        c.mat.color.copy(cloudBase).lerp(cloudWarm, c.lit)
      }

      if (plane) {
        planeTimer -= dt
        if (!planeActive && planeTimer <= 0) {
          planeActive = true
          planeDir = driveRng() > 0.5 ? 1 : -1
          planeSpeed = 10 + driveRng() * 5
          plane.position.set(-planeDir * 118, 17 + driveRng() * 9, -56 - driveRng() * 24)
          plane.rotation.y = planeDir > 0 ? 0 : Math.PI
          plane.visible = true
        }
        if (planeActive) {
          plane.position.x += planeDir * planeSpeed * dt
          if (Math.abs(plane.position.x) > 122) {
            planeActive = false
            plane.visible = false
            planeTimer = 14 + driveRng() * 16
          }
          if (planeStrobe) planeStrobe.visible = (time * 1.3) % 1 < 0.07
          if (planeBeacon) planeBeacon.visible = (time * 0.9 + 0.4) % 1 < 0.18
        }
      }

      if (heli) {
        heliTimer -= dt
        if (!heliActive && heliTimer <= 0) {
          heliActive = true
          heliT = 0
          heliDur = 20 + driveRng() * 6
          const side = driveRng() > 0.5 ? 1 : -1
          heliFrom.set(side * (9 + driveRng() * 5), 5.5 + driveRng() * 2.5, -12 - driveRng() * 4)
          heliTo.set(side * (1 + driveRng() * 4), 12 + driveRng() * 6, -86)
          heli.visible = true
        }
        if (heliActive) {
          heliT += dt / heliDur
          if (heliT >= 1) {
            heliActive = false
            heli.visible = false
            heliTimer = 18 + driveRng() * 20
          } else {
            const bob = Math.sin(time * 2.1) * 0.12
            heli.position.lerpVectors(heliFrom, heliTo, heliT)
            heli.position.y += bob
            heli.lookAt(heliTo.x, heliTo.y + bob, heliTo.z)
            heli.rotation.x += 0.08
            if (heliRotor) heliRotor.rotation.y += dt * 38
            if (heliTailRotor) heliTailRotor.rotation.x += dt * 52
            if (heliBeacon) heliBeacon.visible = (time * 1.1) % 1 < 0.2
            if (heliBeam) {
              const beamMat = heliBeam.material as THREE.MeshBasicMaterial
              beamMat.opacity = 0.05 + Math.sin(time * 0.8) * 0.015
            }
          }
        }
      }

      cameraRef.position.set(2.45 + Math.sin(time * 0.16) * 0.08, 2.28 + Math.sin(time * 1.05) * 0.02, 8.7)
      cameraRef.lookAt(-0.15, 0.58, -14)
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      cameraRef = null
      gridMat = null
      cityMat = null
      skyMat = null
      steelMat = null
      sunMat = null
      sunHaloMat = null
      sunLit = null
      bike = null
      plane = null
      planeStrobe = null
      planeBeacon = null
      heli = null
      heliRotor = null
      heliTailRotor = null
      heliBeacon = null
      heliBeam = null
      scanGlowMat = null
      scanSegs.length = 0
      clouds.length = 0
      lamps.length = 0
      gridBars.length = 0
      streaks.length = 0
      neonMats.length = 0
      bikeMats.length = 0
    },
  }
}

export function createStorm(): VisualStyle {
  let group: THREE.Group | null = null
  let rain: THREE.Points | null = null
  let clouds: THREE.Points | null = null
  let flash: THREE.Mesh | null = null
  let bolts: THREE.Line[] = []
  let flashLife = 0

  const makeBolt = (palette: Palette) => {
    const segs = 32
    const positions = new Float32Array(segs * 3)
    let x = (Math.random() - 0.5) * 10
    let y = 6.2
    let z = (Math.random() - 0.5) * 6
    for (let i = 0; i < segs; i++) {
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      x += (Math.random() - 0.5) * 0.85
      y -= 0.28 + Math.random() * 0.16
      z += (Math.random() - 0.5) * 0.45
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setRGB(palette.c[0], palette.c[1] * 0.7 + 0.3, palette.c[2]),
      transparent: true,
      opacity: 0.95,
    })
    return new THREE.Line(geo, mat)
  }

  return {
    id: 'storm',
    label: 'Storm',
    hint: 'Colored lightning weather',
    mount(scene, camera, palette) {
      camera.position.set(0, 1.6, 10)
      camera.lookAt(0, 1.2, 0)
      scene.fog = new THREE.FogExp2(0x07060c, 0.045)
      scene.background = new THREE.Color(0x07060c)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      const rainCount = 5000
      const rpos = new Float32Array(rainCount * 3)
      for (let i = 0; i < rainCount; i++) {
        rpos[i * 3] = (rng.next() - 0.5) * 22
        rpos[i * 3 + 1] = rng.next() * 10
        rpos[i * 3 + 2] = (rng.next() - 0.5) * 14
      }
      const rgeo = new THREE.BufferGeometry()
      rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3))
      rain = new THREE.Points(
        rgeo,
        new THREE.PointsMaterial({ color: 0xa8c4ff, size: 0.03, transparent: true, opacity: 0.45 }),
      )
      const cloudCount = 1800
      const cpos = new Float32Array(cloudCount * 3)
      for (let i = 0; i < cloudCount; i++) {
        cpos[i * 3] = (rng.next() - 0.5) * 20
        cpos[i * 3 + 1] = 4.2 + rng.next() * 2.8
        cpos[i * 3 + 2] = (rng.next() - 0.5) * 12
      }
      const cgeo = new THREE.BufferGeometry()
      cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3))
      clouds = new THREE.Points(
        cgeo,
        new THREE.PointsMaterial({ color: 0x2a2438, size: 0.55, transparent: true, opacity: 0.35 }),
      )
      flash = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      )
      flash.position.z = -6
      group.add(rain, clouds, flash)
      scene.add(group)
    },
    update(m, time, dt, palette) {
      if (!group || !rain || !clouds || !flash) return
      const pos = rain.geometry.getAttribute('position') as THREE.BufferAttribute
      const fall = (6 + m.energy * 16) * dt
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall * (0.45 + (i % 9) * 0.06)
        if (y < -2) y = 8.5
        pos.setY(i, y)
      }
      pos.needsUpdate = true
      ;(rain.material as THREE.PointsMaterial).color.setRGB(
        0.45 + palette.b[0] * 0.4,
        0.55 + palette.b[1] * 0.3,
        0.75,
      )
      clouds.rotation.y = time * 0.02
      ;(clouds.material as THREE.PointsMaterial).color.setRGB(palette.a[0] * 0.2, palette.a[1] * 0.16, palette.a[2] * 0.24)
      const strike = m.beat || (m.energy > 0.42 && Math.random() < 0.04)
      if (strike && bolts.length < 6) {
        const bolt = makeBolt(palette)
        group.add(bolt)
        bolts.push(bolt)
        flashLife = 0.18 + m.bass * 0.12
      }
      bolts = bolts.filter((bolt) => {
        const mat = bolt.material as THREE.LineBasicMaterial
        mat.opacity -= dt * 2.1
        mat.color.setRGB(palette.c[0], 0.45 + palette.c[1] * 0.4, 1)
        if (mat.opacity <= 0) {
          group!.remove(bolt)
          disposeObject(bolt)
          return false
        }
        return true
      })
      flashLife = Math.max(0, flashLife - dt)
      const flashMat = flash.material as THREE.MeshBasicMaterial
      flashMat.color.setRGB(palette.c[0], palette.c[1], 1)
      flashMat.opacity = flashLife * 0.22
      group.rotation.y = Math.sin(time * 0.04) * 0.06
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      rain = null
      clouds = null
      flash = null
      bolts = []
    },
  }
}

export function createHive(): VisualStyle {
  const R = 3.1
  const TRAIL = 30
  let group: THREE.Group | null = null
  let comb: THREE.InstancedMesh | null = null
  let honey: THREE.InstancedMesh | null = null
  let neonRings: THREE.InstancedMesh | null = null
  let core: THREE.Mesh | null = null
  let pollen: THREE.Points | null = null
  let cameraRef: THREE.PerspectiveCamera | null = null
  let keyLight: THREE.PointLight | null = null
  let coreLight: THREE.PointLight | null = null
  let haloGroup: THREE.Group | null = null
  let flash = 0
  let sampleAcc = 0
  const halos: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; bead: THREE.Mesh; rate: number; beadRate: number; tilt: number }[] = []
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const look = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()
  const side = new THREE.Vector3()
  const cells: {
    pos: THREE.Vector3
    normal: THREE.Vector3
    quat: THREE.Quaternion
    radius: number
    honey: number
    neon: number
    tint: number
  }[] = []
  type Bee = {
    root: THREE.Group
    left: THREE.Object3D
    right: THREE.Object3D
    glowMat: THREE.MeshStandardMaterial
    u: THREE.Vector3
    v: THREE.Vector3
    axis: THREE.Vector3
    radius: number
    pace: number
    phase: number
    wobble: number
    trail: THREE.Mesh
    trailMat: THREE.MeshBasicMaterial
    history: Float32Array
    accent: boolean
  }
  const bees: Bee[] = []

  const makeBee = () => {
    const root = new THREE.Group()
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      emissive: 0xf2c14e,
      emissiveIntensity: 0.3,
      roughness: 0.45,
    })
    const black = new THREE.MeshStandardMaterial({
      color: 0x1c140c,
      roughness: 0.55,
    })
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x101010,
      emissive: 0x44ffcc,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    })
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xf4f0d8,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.2,
      metalness: 0.05,
      depthWrite: false,
    })
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), yellow)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), black)
    head.position.set(0, 0.01, 0.11)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), glowMat)
    eyeL.position.set(-0.03, 0.025, 0.145)
    const eyeR = eyeL.clone()
    eyeR.position.x = 0.03
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), yellow)
    abdomen.scale.set(0.78, 0.78, 1.45)
    abdomen.position.set(0, -0.01, -0.14)
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 8), black)
    stripe.scale.set(0.86, 0.86, 0.28)
    stripe.position.set(0, -0.01, -0.12)
    const stripe2 = stripe.clone()
    stripe2.position.z = -0.18
    const sting = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), glowMat)
    sting.position.set(0, -0.01, -0.27)
    const wingGeo = new THREE.PlaneGeometry(0.18, 0.09)
    const left = new THREE.Mesh(wingGeo, wingMat)
    const right = new THREE.Mesh(wingGeo, wingMat)
    left.position.set(-0.04, 0.06, 0.02)
    right.position.set(0.04, 0.06, 0.02)
    left.rotation.y = 0.35
    right.rotation.y = -0.35
    root.add(thorax, head, eyeL, eyeR, abdomen, stripe, stripe2, sting, left, right)
    return { root, left, right, glowMat }
  }

  const makeTrail = () => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(TRAIL * 2 * 3)
    const col = new Float32Array(TRAIL * 2 * 3)
    const idx: number[] = []
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return { mesh, mat }
  }

  const beePos = (bee: Bee, t: number, out: THREE.Vector3) => {
    const r = bee.radius + Math.sin(t * 2.7 + bee.phase) * 0.3
    out
      .copy(bee.u)
      .multiplyScalar(Math.cos(t) * r)
      .addScaledVector(bee.v, Math.sin(t) * r)
      .addScaledVector(bee.axis, Math.sin(t * 1.7 + bee.phase * 0.5) * bee.wobble)
    return out
  }

  return {
    id: 'hive',
    label: 'Hive',
    hint: 'Neon honeycomb sphere',
    bloom: { base: 0.34, pulse: 0.16 },
    mount(scene, camera, palette) {
      cameraRef = camera
      camera.position.set(0, 1.2, 9.4)
      camera.lookAt(0, 0, 0)
      scene.fog = new THREE.FogExp2(0x0a0705, 0.03)
      scene.background = new THREE.Color(0x0a0705)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      flash = 0
      sampleAcc = 0

      const ico = new THREE.IcosahedronGeometry(R, 7)
      const pa = ico.getAttribute('position')
      const seen = new Map<string, THREE.Vector3>()
      for (let i = 0; i < pa.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pa, i)
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
        if (!seen.has(key)) seen.set(key, v)
      }
      ico.dispose()
      const verts = [...seen.values()]
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i]
        let nearest = verts[i === 0 ? 1 : 0]
        let best = Infinity
        for (let j = 0; j < verts.length; j++) {
          if (j === i) continue
          const d = v.distanceToSquared(verts[j])
          if (d < best) {
            best = d
            nearest = verts[j]
          }
        }
        const dist = Math.sqrt(best)
        const normal = v.clone().normalize()
        dummy.position.copy(v)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(1)
        dummy.lookAt(v.x * 2, v.y * 2, v.z * 2)
        tmp.set(1, 0, 0).applyQuaternion(dummy.quaternion)
        tmp2.set(0, 1, 0).applyQuaternion(dummy.quaternion)
        const d = nearest.clone().sub(v).projectOnPlane(normal).normalize()
        dummy.rotateZ(Math.atan2(d.dot(tmp2), d.dot(tmp)))
        cells.push({
          pos: v.clone(),
          normal,
          quat: dummy.quaternion.clone(),
          radius: (dist / Math.sqrt(3)) * 0.94,
          honey: rng.next() > 0.36 ? 0.4 + rng.next() * 0.6 : 0,
          neon: rng.next() < 0.2 ? 0.6 + rng.next() * 0.4 : 0,
          tint: rng.next(),
        })
      }

      const wax = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(0x7a4a14),
        emissiveIntensity: 0.16,
        metalness: 0.12,
        roughness: 0.58,
      })
      const nectar = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffb44a,
        emissiveIntensity: 0.7,
        metalness: 0.2,
        roughness: 0.28,
      })
      const neonMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const cellGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
      cellGeo.rotateX(Math.PI / 2)
      const honeyGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 6)
      honeyGeo.rotateX(Math.PI / 2)
      const ringGeo = new THREE.RingGeometry(0.74, 0.9, 6)
      ringGeo.rotateZ(Math.PI / 6)

      comb = new THREE.InstancedMesh(cellGeo, wax, cells.length)
      honey = new THREE.InstancedMesh(honeyGeo, nectar, cells.length)
      neonRings = new THREE.InstancedMesh(ringGeo, neonMat, cells.length)
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        dummy.position.copy(cell.pos)
        dummy.quaternion.copy(cell.quat)
        dummy.scale.set(cell.radius, cell.radius, 0.55)
        dummy.updateMatrix()
        comb.setMatrixAt(i, dummy.matrix)
        comb.setColorAt(i, color.setRGB(0.82, 0.56, 0.2))
        honey.setMatrixAt(i, dummy.matrix)
        honey.setColorAt(i, color.setRGB(1, 0.75, 0.35))
        neonRings.setMatrixAt(i, dummy.matrix)
        neonRings.setColorAt(i, color.setRGB(0, 0, 0))
      }
      group.add(comb, honey, neonRings)

      core = new THREE.Mesh(
        new THREE.SphereGeometry(R + 0.12, 64, 40),
        new THREE.MeshBasicMaterial({ color: 0x44ffcc }),
      )
      group.add(core)

      haloGroup = new THREE.Group()
      const beadGeo = new THREE.SphereGeometry(0.11, 10, 10)
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const radius = R + 1.7 + i * 0.35
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 8, 160), mat)
        const bead = new THREE.Mesh(beadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
        bead.position.set(radius, 0, 0)
        mesh.add(bead)
        const tilt = 0.5 + i * 0.75
        mesh.rotation.x = tilt
        mesh.rotation.y = i * 1.1
        halos.push({ mesh, mat, bead, rate: 0.22 + i * 0.09, beadRate: (i % 2 ? -1 : 1) * (0.9 + i * 0.25), tilt })
        haloGroup.add(mesh)
      }
      group.add(haloGroup)

      const pollenCount = 320
      const pp = new Float32Array(pollenCount * 3)
      for (let i = 0; i < pollenCount; i++) {
        const dir = new THREE.Vector3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5).normalize()
        const r = R + 0.45 + rng.next() * 3.4
        pp[i * 3] = dir.x * r
        pp[i * 3 + 1] = dir.y * r
        pp[i * 3 + 2] = dir.z * r
      }
      const pollenGeo = new THREE.BufferGeometry()
      pollenGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3))
      pollen = new THREE.Points(
        pollenGeo,
        new THREE.PointsMaterial({
          color: 0xffcc66,
          size: 0.055,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      group.add(pollen)

      const beeCount = 9
      for (let i = 0; i < beeCount; i++) {
        const parts = makeBee()
        const axis = new THREE.Vector3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5).normalize()
        const u = new THREE.Vector3(0, 1, 0)
        if (Math.abs(axis.y) > 0.9) u.set(1, 0, 0)
        u.cross(axis).normalize()
        const v = new THREE.Vector3().crossVectors(axis, u).normalize()
        const trail = makeTrail()
        const bee: Bee = {
          root: parts.root,
          left: parts.left,
          right: parts.right,
          glowMat: parts.glowMat,
          u,
          v,
          axis,
          radius: R + 0.95 + rng.next() * 1.1,
          pace: 0.45 + rng.next() * 0.4,
          phase: rng.next() * Math.PI * 2,
          wobble: 0.25 + rng.next() * 0.35,
          trail: trail.mesh,
          trailMat: trail.mat,
          history: new Float32Array(TRAIL * 3),
          accent: i % 2 === 1,
        }
        beePos(bee, bee.phase, tmp)
        for (let k = 0; k < TRAIL; k++) {
          bee.history[k * 3] = tmp.x
          bee.history[k * 3 + 1] = tmp.y
          bee.history[k * 3 + 2] = tmp.z
        }
        bees.push(bee)
        group.add(parts.root, trail.mesh)
      }

      keyLight = new THREE.PointLight(0xffc56a, 26, 30)
      keyLight.position.set(2.2, 3.4, 8)
      keyLight.name = 'style-light'
      coreLight = new THREE.PointLight(0x44ffcc, 6, 14)
      coreLight.position.set(0, 0, 0)
      coreLight.name = 'style-light'
      const fill = new THREE.PointLight(0x4a2a10, 6, 24)
      fill.position.set(-6, -2, -4)
      fill.name = 'style-light'
      group.add(keyLight, coreLight, fill)
      scene.add(group)
    },
    update(m, time, dt, palette, speed = 1) {
      if (!group || !comb || !honey || !neonRings || !cameraRef) return
      const neon = new THREE.Color().setRGB(...palette.a)
      const accent = new THREE.Color().setRGB(...palette.c)
      const lift = (c: THREE.Color, target: number) => {
        const luma = Math.max(c.r * 0.299 + c.g * 0.587 + c.b * 0.114, 0.05)
        return c.multiplyScalar(target / luma)
      }
      lift(neon, 0.75)
      lift(accent, 0.75)
      flash = Math.max(flash * Math.exp(-dt * 5), m.beat ? 1 : 0)

      const wax = comb.material as THREE.MeshStandardMaterial
      wax.emissive.copy(neon).multiplyScalar(0.35).add(new THREE.Color(0.3, 0.16, 0.03))
      wax.emissiveIntensity = 0.18 + m.energy * 0.2 + flash * 0.1
      const nectar = honey.material as THREE.MeshStandardMaterial
      nectar.emissive.copy(accent).lerp(new THREE.Color(1, 0.65, 0.25), 0.55)
      nectar.emissiveIntensity = 0.5 + m.energy * 0.5 + flash * 0.3
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        const spec = m.spectrum[(i * 7) % m.spectrum.length]
        color.setRGB(0.8, 0.54, 0.18).lerp(neon, 0.1 + cell.tint * 0.15)
        comb.setColorAt(i, color)
        const fill = cell.honey * (0.7 + spec * 0.55 + m.bass * 0.15)
        dummy.position.copy(cell.pos).addScaledVector(cell.normal, 0.2)
        dummy.quaternion.copy(cell.quat)
        const s = cell.honey > 0 ? cell.radius * (0.8 + fill * 0.35) : 0.001
        dummy.scale.set(s, s, 0.1)
        dummy.updateMatrix()
        honey.setMatrixAt(i, dummy.matrix)
        color.copy(accent).lerp(new THREE.Color(1, 0.72, 0.28), 0.7 - spec * 0.35)
        honey.setColorAt(i, color)
        dummy.position.copy(cell.pos).addScaledVector(cell.normal, 0.29)
        const ringOn = cell.neon > 0 ? cell.radius * (0.96 + spec * 0.1) : 0.001
        dummy.scale.set(ringOn, ringOn, 1)
        dummy.updateMatrix()
        neonRings.setMatrixAt(i, dummy.matrix)
        const pulse = cell.neon > 0 ? cell.neon * (0.35 + spec * 1.1 + m.treble * 0.5 + flash * 0.8) : 0
        const twinkle = 0.7 + Math.sin(time * 5.3 + cell.tint * 40) * 0.3
        color.copy(cell.tint > 0.5 ? neon : accent).multiplyScalar(pulse * twinkle)
        neonRings.setColorAt(i, color)
      }
      comb.instanceMatrix.needsUpdate = true
      honey.instanceMatrix.needsUpdate = true
      neonRings.instanceMatrix.needsUpdate = true
      if (comb.instanceColor) comb.instanceColor.needsUpdate = true
      if (honey.instanceColor) honey.instanceColor.needsUpdate = true
      if (neonRings.instanceColor) neonRings.instanceColor.needsUpdate = true

      if (core) {
        const coreMat = core.material as THREE.MeshBasicMaterial
        coreMat.color.copy(neon).multiplyScalar(1.1 + m.bass * 1.6 + flash * 1.2)
      }
      if (coreLight) {
        coreLight.color.copy(neon)
        coreLight.intensity = 4 + m.bass * 8 + flash * 6
      }

      if (haloGroup) {
        for (let i = 0; i < halos.length; i++) {
          const h = halos[i]
          h.mesh.rotation.y += dt * h.rate
          h.mesh.rotation.x = h.tilt + Math.sin(time * 0.3 + i) * 0.25
          const s = 1 + m.bass * 0.06 + flash * 0.04
          h.mesh.scale.setScalar(s)
          h.mat.color.copy(i % 2 ? accent : neon).multiplyScalar(0.6 + m.mid * 0.8 + flash * 0.6)
          h.mat.opacity = 0.55 + m.energy * 0.4
          const radius = R + 1.7 + i * 0.35
          const b = time * h.beadRate
          h.bead.position.set(Math.cos(b) * radius, Math.sin(b) * radius, 0)
          h.bead.scale.setScalar(1 + m.treble * 0.8 + flash * 0.6)
          ;(h.bead.material as THREE.MeshBasicMaterial).color.copy(i % 2 ? accent : neon).multiplyScalar(2.2)
        }
      }

      if (pollen) {
        pollen.rotation.y += dt * 0.12
        pollen.rotation.x = Math.sin(time * 0.11) * 0.3
        const pm = pollen.material as THREE.PointsMaterial
        pm.color.copy(accent).lerp(new THREE.Color(1, 0.8, 0.4), 0.35)
        pm.size = 0.05 + m.treble * 0.05 + flash * 0.03
        pm.opacity = 0.55 + m.energy * 0.4
      }

      sampleAcc += dt / speed
      const shift = sampleAcc >= 1 / 45
      if (shift) sampleAcc = 0
      const flap = time * (38 + speed * 10)
      const camPos = cameraRef.position
      for (let i = 0; i < bees.length; i++) {
        const bee = bees[i]
        const t = time * bee.pace + bee.phase
        beePos(bee, t, tmp)
        beePos(bee, t + 0.05, look)
        bee.root.position.copy(tmp)
        bee.root.lookAt(look)
        bee.left.rotation.x = Math.sin(flap + i) * 0.72
        bee.right.rotation.x = -Math.sin(flap + i + 0.4) * 0.72
        const beeCol = bee.accent ? accent : neon
        bee.glowMat.emissive.copy(beeCol)
        bee.glowMat.emissiveIntensity = 1.4 + m.energy * 1.6 + flash * 1.2

        const hist = bee.history
        if (shift) {
          for (let k = TRAIL - 1; k > 0; k--) {
            hist[k * 3] = hist[(k - 1) * 3]
            hist[k * 3 + 1] = hist[(k - 1) * 3 + 1]
            hist[k * 3 + 2] = hist[(k - 1) * 3 + 2]
          }
        }
        hist[0] = tmp.x
        hist[1] = tmp.y
        hist[2] = tmp.z
        const geo = bee.trail.geometry
        const pos = geo.getAttribute('position') as THREE.BufferAttribute
        const col = geo.getAttribute('color') as THREE.BufferAttribute
        const glow = 0.55 + m.energy * 0.8 + flash * 0.6
        for (let k = 0; k < TRAIL; k++) {
          const px = hist[k * 3]
          const py = hist[k * 3 + 1]
          const pz = hist[k * 3 + 2]
          const kp = Math.max(0, k - 1)
          const kn = Math.min(TRAIL - 1, k + 1)
          tmp2.set(hist[kp * 3] - hist[kn * 3], hist[kp * 3 + 1] - hist[kn * 3 + 1], hist[kp * 3 + 2] - hist[kn * 3 + 2])
          look.set(camPos.x - px, camPos.y - py, camPos.z - pz)
          side.crossVectors(tmp2, look)
          const len = side.length()
          if (len < 1e-6) side.set(0, 1, 0)
          else side.multiplyScalar(1 / len)
          const fade = 1 - k / (TRAIL - 1)
          const width = 0.03 + fade * 0.065
          pos.setXYZ(k * 2, px + side.x * width, py + side.y * width, pz + side.z * width)
          pos.setXYZ(k * 2 + 1, px - side.x * width, py - side.y * width, pz - side.z * width)
          const a = fade * fade * glow
          col.setXYZ(k * 2, beeCol.r * a, beeCol.g * a, beeCol.b * a)
          col.setXYZ(k * 2 + 1, beeCol.r * a, beeCol.g * a, beeCol.b * a)
        }
        pos.needsUpdate = true
        col.needsUpdate = true
      }

      const orbit = time * 0.21
      const camR = 10.8 + Math.sin(time * 0.17) * 0.6
      cameraRef.position.set(Math.cos(orbit) * camR, 1.1 + Math.sin(orbit * 0.43) * 2.1, Math.sin(orbit) * camR)
      cameraRef.lookAt(0, 0, 0)
      if (keyLight) {
        keyLight.position.copy(cameraRef.position).multiplyScalar(0.85)
        keyLight.position.y += 2.5
        keyLight.color.setRGB(1, 0.78, 0.45).lerp(neon, 0.2)
        keyLight.intensity = 24 + m.energy * 8
      }
      group.rotation.y += dt * 0.03
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      clearNamed(scene, 'style-light')
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      comb = null
      honey = null
      neonRings = null
      core = null
      pollen = null
      cameraRef = null
      keyLight = null
      coreLight = null
      haloGroup = null
      halos.length = 0
      cells.length = 0
      bees.length = 0
    },
  }
}

export function createVoid(): VisualStyle {
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  const uA = new THREE.Color()
  const uB = new THREE.Color()
  const uC = new THREE.Color()
  let sBass = 0
  let sMid = 0
  let sTreble = 0
  let sEnergy = 0
  let flare = 0

  return {
    id: 'void',
    label: 'Void',
    hint: 'Black hole in deep space',
    bloom: { base: 0.3, pulse: 0.18 },
    holeMask: { radius: 0.154, feather: 0.005 },
    mount(scene, camera) {
      camera.position.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      scene.fog = null
      scene.background = new THREE.Color(0x000000)
      material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uFlare: { value: 0 },
          uSeed: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uA: { value: uA },
          uB: { value: uB },
          uC: { value: uC },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime, uBass, uMid, uTreble, uEnergy, uFlare, uSeed;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          const float RS = 1.0;
          const float ISCO = 3.05;
          const float DISK_OUT = 14.5;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float hash13(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 4; i++) {
              v += amp * noise(p);
              p = p * 2.07 + vec2(1.7, 9.2);
              amp *= 0.5;
            }
            return v;
          }

          vec3 tone(vec3 c, float target) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            return c * (target / max(luma, 0.05));
          }

          vec3 blackbody(float t) {
            t = clamp(t, 0.0, 2.4);
            vec3 c = vec3(0.16, 0.03, 0.01);
            c = mix(c, vec3(0.82, 0.22, 0.05), smoothstep(0.04, 0.26, t));
            c = mix(c, vec3(1.0, 0.55, 0.16), smoothstep(0.2, 0.52, t));
            c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.48, 0.92, t));
            c = mix(c, vec3(0.78, 0.88, 1.0), smoothstep(0.88, 1.55, t));
            return c;
          }

          vec3 shadeDisk(vec3 hit, vec3 vel) {
            float r = length(hit);
            float xr = ISCO / max(r, ISCO);
            float temp = pow(xr, 0.75) * pow(max(0.001, 1.0 - sqrt(xr)), 0.25);
            temp *= sqrt(max(0.05, 1.0 - RS / max(r, RS * 1.02)));
            float phi = atan(hit.z, hit.x);
            float omega = 1.35 * pow(ISCO / max(r, 0.9), 1.5) + 0.45;
            float kep = phi - uTime * omega;
            vec2 q = vec2(cos(kep), sin(kep)) * 2.4 + vec2(log(r) * 5.2, uSeed * 0.01);
            float f1 = fbm(q);
            float f2 = fbm(q * vec2(2.4, 1.6) + 7.3 - vec2(uTime * 0.12, 0.0));
            float streak = 0.55 + 0.45 * sin(kep * 7.0 + f1 * 6.0 + r * 0.8);
            float turb = mix(0.5, 1.05, f1) * (0.6 + 0.4 * f2) * (0.7 + 0.3 * streak);
            float flutter = 1.0 + (0.06 + uTreble * 0.3) * sin(uTime * 9.0 + phi * 4.0 + r * 3.0 + f2 * 8.0);
            float dens = smoothstep(ISCO, ISCO + 0.55, r) * smoothstep(DISK_OUT, DISK_OUT - 4.5, r);
            dens *= turb * flutter;
            float orbSpeed = sqrt(0.5 * RS / max(r, ISCO));
            vec3 orbDir = normalize(vec3(-hit.z, 0.0, hit.x));
            float dop = max(0.22, 1.0 + 1.55 * dot(normalize(vel), orbDir) * orbSpeed);
            float boost = dop * dop * dop;
            float colorTemp = temp * pow(dop, 1.3) * (1.0 + uEnergy * 0.35 + uFlare * 0.25);
            vec3 col = blackbody(colorTemp);
            vec3 tint = tone(mix(uA, uC, smoothstep(4.0, 11.0, r)), 0.6);
            float tintAmt = clamp(0.2 + uEnergy * 0.42 + uMid * 0.2, 0.0, 0.85);
            col = mix(col, col * (0.4 + tint * 1.5), tintAmt);
            col = mix(col * vec3(1.15, 0.45, 0.2), col, clamp(dop * 0.55, 0.0, 1.0));
            return col * dens * boost * (0.85 + uBass * 0.45 + uFlare * 0.6);
          }

          vec3 sky(vec3 dir) {
            vec3 d = normalize(dir);
            float a = uTime * 0.02;
            float ca = cos(a);
            float sa = sin(a);
            d = vec3(ca * d.x + sa * d.z, d.y, -sa * d.x + ca * d.z);

            vec3 g = d * 90.0;
            vec3 cell = floor(g);
            vec3 f = fract(g) - 0.5;
            float n = hash13(cell + vec3(uSeed * 0.002));
            float pt = exp(-dot(f, f) * 26.0);
            vec3 starCol = mix(vec3(0.82, 0.86, 1.0), mix(uA, uC, hash13(cell + 2.0)), 0.35);
            vec3 stars = starCol * pow(n, 24.0) * pt * 3.2 * (1.0 + uTreble * 0.35);

            vec2 p = vec2(d.x + d.z * 0.7, d.y + d.z * 0.4) * 2.4;
            float n1 = fbm(p * 1.3 + uSeed * 0.01);
            float n2 = fbm(p * 2.7 + 4.0 - uTime * 0.01);
            float band = exp(-pow((d.y + 0.15 + 0.2 * sin(d.x * 1.5)) * 3.2, 2.0));
            vec3 dust = mix(tone(uB, 0.3), tone(uA, 0.3), n1) * pow(n1, 1.8) * 0.3;
            dust += tone(uC, 0.3) * pow(n2, 2.5) * 0.2;
            dust *= (0.6 + band * 0.9) * (0.8 + uEnergy * 0.55);
            return vec3(0.004, 0.005, 0.012) + dust + stars;
          }

          void main() {
            vec2 uv = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
            vec3 ro = vec3(0.0, 0.42, 18.8);
            vec3 ta = vec3(0.0, 0.0, 0.0);
            vec3 ww = normalize(ta - ro);
            vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
            vec3 vv = cross(uu, ww);
            vec3 vel = normalize(ww + uu * uv.x * 0.8 + vv * uv.y * 0.8);
            vec3 pos = ro;

            vec3 Lvec = cross(pos, vel);
            float L2 = dot(Lvec, Lvec);
            float gravCoeff = -1.5 * RS * L2;

            vec3 diskCol = vec3(0.0);
            float diskA = 0.0;
            bool absorbed = false;
            int crossings = 0;

            for (int i = 0; i < 72; i++) {
              float r = length(pos);
              if (r < RS * 1.02) { absorbed = true; break; }
              if (r > 30.0 && dot(pos, vel) > 0.0) break;

              float h = 0.17 * clamp(r - 0.38 * RS, 0.065, 2.7);
              float invR2 = 1.0 / max(r * r, 1e-5);
              float invR5 = invR2 * invR2 / max(r, 1e-5);
              vec3 acc = (gravCoeff * invR5) * pos;
              vec3 p1 = pos + vel * h + 0.5 * acc * h * h;
              float r1 = length(p1);
              float inv15 = 1.0 / max(r1 * r1 * r1 * r1 * r1, 1e-6);
              vec3 acc1 = (gravCoeff * inv15) * p1;
              vec3 v1 = vel + 0.5 * (acc + acc1) * h;

              if (pos.y * p1.y < 0.0 && diskA < 0.96 && crossings < 4) {
                float t = pos.y / (pos.y - p1.y);
                vec3 hit = mix(pos, p1, t);
                float hr = length(vec3(hit.x, 0.0, hit.z));
                if (hr > ISCO && hr < DISK_OUT) {
                  vec3 dc = shadeDisk(hit, vel);
                  float atten = crossings == 0 ? 0.72 : (crossings == 1 ? 1.0 : 0.32);
                  dc *= atten;
                  float dens = crossings == 0 ? 0.48 : (crossings == 1 ? 0.74 : 0.28);
                  diskCol += dc * dens * (1.0 - diskA);
                  diskA += dens * (1.0 - diskA);
                  crossings += 1;
                }
              }

              pos = p1;
              vel = v1;
            }

            float rad = length(uv);
            float ang = atan(uv.y, uv.x);
            float hole = smoothstep(0.154, 0.149, rad);
            float rim = smoothstep(0.152, 0.164, rad) * smoothstep(0.36, 0.17, rad);
            float shimmer = fbm(vec2(cos(ang + uTime * 0.3), sin(ang + uTime * 0.3)) * 2.2 + rad * 22.0 - uTime * 0.9);
            vec3 warm = vec3(1.0, 0.62, 0.22);
            vec3 rimCol = mix(warm, tone(uA, 0.7), clamp(0.25 + uEnergy * 0.45, 0.0, 0.8));
            vec3 rimGlow = rimCol * rim * (0.3 + shimmer * 0.7) * (0.6 + uEnergy * 0.55 + uFlare * 0.45);
            float haze = exp(-rad * 4.2) * (0.05 + uEnergy * 0.06);
            vec3 hazeCol = mix(warm, tone(uC, 0.6), 0.4) * haze;

            vec3 col = vec3(0.0);
            if (!absorbed && hole < 0.001) col += sky(vel);
            col += diskCol * (1.0 + uEnergy * 0.2) * (1.0 - hole);
            col += (rimGlow + hazeCol) * (1.0 - hole);
            col = mix(col, vec3(0.0), hole);

            float vig = smoothstep(1.45, 0.28, length(uv * vec2(0.82, 1.0)));
            gl_FragColor = vec4(min(col * vig, vec3(1.6)), 1.0);
          }
        `,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      scene.add(mesh)
      material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight)
    },
    update(m, time, _dt, palette) {
      if (!material) return
      sBass += (m.bass - sBass) * 0.09
      sMid += (m.mid - sMid) * 0.06
      sTreble += (m.treble - sTreble) * 0.16
      sEnergy += (m.energy - sEnergy) * 0.06
      flare = m.beat ? Math.max(flare, 1) : flare * 0.9
      material.uniforms.uTime.value = time
      material.uniforms.uBass.value = sBass
      material.uniforms.uMid.value = sMid
      material.uniforms.uTreble.value = sTreble
      material.uniforms.uEnergy.value = sEnergy
      material.uniforms.uFlare.value = flare
      material.uniforms.uSeed.value = palette.seed
      colorFrom(palette.a, uA)
      colorFrom(palette.b, uB)
      colorFrom(palette.c, uC)
    },
    resize(w, h) {
      if (material) material.uniforms.uRes.value.set(w, h)
    },
    dispose(scene) {
      if (mesh) {
        scene.remove(mesh)
        disposeObject(mesh)
      }
      scene.background = new THREE.Color(0x030308)
      mesh = null
      material = null
    },
  }
}

type TideFish = {
  group: THREE.Group
  body: THREE.Group
  mat: THREE.ShaderMaterial
  tint: number
  length: number
  peak: number
  wiggle: number
}

type TideJump = {
  fish: TideFish
  start: number
  dur: number
  x0: number
  z0: number
  dx: number
  dz: number
  ySub: number
  entryDone: boolean
  exitDone: boolean
}

type TideSplash = {
  ring: THREE.Mesh
  spray: THREE.Points
  age: number
  life: number
  x: number
  z: number
  active: boolean
}

export function createTide(): VisualStyle {
  let group: THREE.Group | null = null
  let oceanMat: THREE.ShaderMaterial | null = null
  let skyMat: THREE.ShaderMaterial | null = null
  let moonMat: THREE.MeshBasicMaterial | null = null
  let fishLight: THREE.PointLight | null = null
  let horizonMats: THREE.MeshBasicMaterial[] = []
  let planktonA: THREE.Points | null = null
  let planktonB: THREE.Points | null = null
  const fishes: TideFish[] = []
  const splashes: TideSplash[] = []
  let jump: TideJump | null = null
  let jumpIndex = 0
  let jumpTimer = 7
  let clock = 0
  let pulseAge = 10
  let lastBass = 0
  let rngNext = () => Math.random()
  const JUMP_INTERVAL = 10
  const uA = new THREE.Color()
  const uC = new THREE.Color()

  const waveY = (wx: number, wz: number, t: number, bass: number) => {
    const px = wx
    const pz = wz + 22
    const a1 = 0.62 + bass * 0.28
    const a2 = 0.36 + bass * 0.12
    const a3 = 0.14
    return (
      a1 * Math.sin(px * 0.21 + pz * 0.33 - t * 1.15) +
      a2 * Math.sin(px * 0.4 - pz * 0.19 - t * 1.65) +
      a3 * Math.sin(px * 0.78 + pz * 0.52 - t * 2.25)
    )
  }

  const startJump = () => {
    if (fishes.length === 0) return
    const fish = fishes[jumpIndex % fishes.length]
    jumpIndex += 1
    const dir = rngNext() > 0.5 ? 1 : -1
    const x0 = (rngNext() - 0.5) * 8 - dir * 7
    const z0 = -6 - rngNext() * 8
    jump = {
      fish,
      start: clock,
      dur: 3.4 + fish.length * 0.22,
      x0,
      z0,
      dx: dir * (10 + rngNext() * 5),
      dz: (rngNext() - 0.5) * 4,
      ySub: -fish.length * 0.55,
      entryDone: false,
      exitDone: false,
    }
    fish.group.visible = true
  }

  const fireSplash = (x: number, z: number, size: number) => {
    const s = splashes.find((sp) => !sp.active) ?? splashes[0]
    if (!s) return
    s.active = true
    s.age = 0
    s.life = 1.1 + size * 0.12
    s.x = x
    s.z = z
    s.ring.visible = true
    s.spray.visible = true
    s.ring.scale.setScalar(0.2 * size)
  }

  return {
    id: 'tide',
    label: 'Tide',
    hint: 'Neon tide with leaping fish',
    bloom: { base: 0.3, pulse: 0.16 },
    mount(scene, camera, palette) {
      camera.fov = 62
      camera.near = 0.1
      camera.far = 220
      camera.position.set(0, 2.8, 18)
      camera.lookAt(0, 1.15, -24)
      camera.updateProjectionMatrix()
      scene.fog = new THREE.Fog(0x071018, 36, 105)
      scene.background = new THREE.Color(0x071018)

      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      rngNext = () => rng.next()
      clock = 0
      jumpTimer = 7
      jumpIndex = 0
      jump = null
      pulseAge = 10

      skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(0x03060d) },
          uHorizon: { value: new THREE.Color(0x0a1824) },
          uNeon: { value: new THREE.Color(0x2affc8) },
          uGlow: { value: 0.3 },
        },
        vertexShader: `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTop, uHorizon, uNeon;
          uniform float uGlow;
          varying float vH;
          void main() {
            float h = clamp(vH * 1.1 + 0.05, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, smoothstep(0.02, 0.72, h));
            col += uNeon * exp(-max(vH, 0.0) * 14.0) * uGlow;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 20), skyMat)
      sky.renderOrder = -2
      group.add(sky)

      const starCount = 220
      const starPos = new Float32Array(starCount * 3)
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (rng.next() - 0.5) * 90
        starPos[i * 3 + 1] = 6 + rng.next() * 28
        starPos[i * 3 + 2] = -12 - rng.next() * 70
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xdce8ff,
          size: 0.11,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          fog: true,
        }),
      )
      group.add(stars)

      moonMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff })
      const moon = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 24), moonMat)
      moon.position.set(16, 13.5, -42)
      group.add(moon)
      const moonGlow = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0x9bb8d8,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        }),
      )
      moonGlow.position.copy(moon.position)
      group.add(moonGlow)

      const oceanGeo = new THREE.PlaneGeometry(120, 170, 160, 220)
      oceanGeo.rotateX(-Math.PI / 2)
      oceanMat = new THREE.ShaderMaterial({
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uEnergy: { value: 0 },
          uTreble: { value: 0 },
          uPulse: { value: 0 },
          uPulseR: { value: 0 },
          uA: { value: uA },
          uC: { value: uC },
          uMoon: { value: moon.position.clone() },
          uFogColor: { value: new THREE.Color(0x071018) },
        },
        vertexShader: `
          uniform float uTime, uBass;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vCrest;
          varying float vDist;

          void main() {
            vec3 p = position;
            float t = uTime;
            float a1 = 0.62 + uBass * 0.28;
            float a2 = 0.36 + uBass * 0.12;
            float a3 = 0.14;
            float s1 = sin(p.x * 0.21 + p.z * 0.33 - t * 1.15);
            float s2 = sin(p.x * 0.4 - p.z * 0.19 - t * 1.65);
            float s3 = sin(p.x * 0.78 + p.z * 0.52 - t * 2.25);
            float c1 = cos(p.x * 0.21 + p.z * 0.33 - t * 1.15);
            float c2 = cos(p.x * 0.4 - p.z * 0.19 - t * 1.65);
            float c3 = cos(p.x * 0.78 + p.z * 0.52 - t * 2.25);
            p.y = a1 * s1 + a2 * s2 + a3 * s3;
            float dhx = a1 * 0.21 * c1 + a2 * 0.4 * c2 + a3 * 0.78 * c3;
            float dhz = a1 * 0.33 * c1 - a2 * 0.19 * c2 + a3 * 0.52 * c3;
            vNormal = normalize(vec3(-dhx, 1.0, -dhz));
            vCrest = 0.5 + 0.5 * s1;
            vCrest *= 0.65 + 0.35 * (0.5 + 0.5 * s2);
            vec4 world = modelMatrix * vec4(p, 1.0);
            vWorld = world.xyz;
            vec4 mv = viewMatrix * world;
            vDist = length(mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform float uTime, uEnergy, uTreble, uPulse, uPulseR;
          uniform vec3 uA, uC, uMoon, uFogColor;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vCrest;
          varying float vDist;

          vec3 lift(vec3 c, float target) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            return c * (target / max(luma, 0.05));
          }

          void main() {
            vec3 n = normalize(vNormal);
            vec3 view = normalize(cameraPosition - vWorld);
            vec3 moonDir = normalize(uMoon - vWorld);
            float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.2);
            float spec = pow(max(dot(n, normalize(moonDir + view)), 0.0), 42.0);
            float crest = smoothstep(0.42, 0.88, vCrest);
            vec3 neonA = lift(uA, 0.5);
            vec3 neonC = lift(uC, 0.5);
            vec3 bio = mix(vec3(0.06, 0.72, 0.68), mix(neonA, neonC, 0.5), 0.55);
            vec3 deep = vec3(0.012, 0.035, 0.05);
            vec3 col = mix(deep, bio, crest * (0.3 + uEnergy * 0.5));
            col += bio * pow(max(vCrest, 0.0), 3.4) * (0.14 + uEnergy * 0.3);
            float streak = pow(0.5 + 0.5 * sin(vWorld.x * 1.3 + vWorld.z * 0.7 + uTime * 2.1), 9.0);
            streak *= pow(0.5 + 0.5 * sin(vWorld.x * 0.45 - vWorld.z * 1.1 - uTime * 1.4), 3.0);
            col += neonC * streak * crest * (0.5 + uTreble * 0.9);
            float ringD = abs(length(vWorld.xz - vec2(0.0, -20.0)) - uPulseR);
            float ring = exp(-ringD * 0.42) * uPulse;
            col += mix(neonA, neonC, 0.5) * ring * 0.85;
            col += mix(vec3(0.7, 0.84, 1.0), neonA, 0.25) * spec * 0.3;
            col += mix(vec3(0.12, 0.2, 0.28), neonA, 0.3) * fres * 0.3;
            float fog = smoothstep(34.0, 98.0, vDist);
            col = mix(col, uFogColor, fog);
            gl_FragColor = vec4(min(col, vec3(0.92)), 1.0);
          }
        `,
      })
      const ocean = new THREE.Mesh(oceanGeo, oceanMat)
      ocean.position.set(0, 0, -22)
      group.add(ocean)

      horizonMats = []
      const horizonLine = new THREE.Mesh(
        new THREE.BoxGeometry(220, 0.09, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x2affc8, fog: false }),
      )
      horizonLine.position.set(0, 0.55, -96)
      horizonMats.push(horizonLine.material as THREE.MeshBasicMaterial)
      group.add(horizonLine)

      const makePlankton = (count: number, color: number, size: number) => {
        const pos = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
          pos[i * 3] = (rng.next() - 0.5) * 80
          pos[i * 3 + 1] = 0.3 + Math.pow(rng.next(), 2.2) * 3.2
          pos[i * 3 + 2] = 8 - rng.next() * 70
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        return new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color,
            size,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            fog: true,
          }),
        )
      }
      planktonA = makePlankton(420, 0x2affc8, 0.11)
      planktonB = makePlankton(260, 0xff4fd8, 0.08)
      group.add(planktonA, planktonB)

      const makeFishMat = () =>
        new THREE.ShaderMaterial({
          side: THREE.DoubleSide,
          uniforms: {
            uNeon: { value: new THREE.Color(0x2affc8) },
            uGlow: { value: 0 },
          },
          vertexShader: `
            varying vec3 vW;
            varying vec3 vN;
            void main() {
              vec4 w = modelMatrix * vec4(position, 1.0);
              vW = w.xyz;
              vN = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `,
          fragmentShader: `
            uniform vec3 uNeon;
            uniform float uGlow;
            varying vec3 vW;
            varying vec3 vN;
            void main() {
              vec3 n = normalize(vN);
              vec3 v = normalize(cameraPosition - vW);
              float fres = pow(1.0 - abs(dot(n, v)), 1.6);
              float up = max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0);
              vec3 moonDir = normalize(vec3(0.35, 0.6, -0.7));
              float spec = pow(max(dot(n, normalize(moonDir + v)), 0.0), 30.0);
              vec3 dark = vec3(0.03, 0.07, 0.1);
              vec3 col = dark * (0.5 + up * 0.9);
              col += uNeon * fres * (1.7 + uGlow * 1.0);
              col += uNeon * (0.22 + uGlow * 0.2);
              col += vec3(0.7, 0.82, 1.0) * spec * 0.5;
              gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
            }
          `,
        })

      const lathe = (pts: [number, number][], seg = 22) => {
        const g = new THREE.LatheGeometry(
          pts.map(([r, y]) => new THREE.Vector2(r, y)),
          seg,
        )
        g.rotateX(Math.PI / 2)
        return g
      }
      const shape = (pts: [number, number][]) => {
        const s = new THREE.Shape()
        s.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
        s.closePath()
        return new THREE.ShapeGeometry(s)
      }
      // Fins drawn in (length, height) space: +x toward nose, +y up. Mapped to the Z axis.
      const sideFin = (pts: [number, number][]) => {
        const g = shape(pts)
        g.rotateY(-Math.PI / 2)
        return g
      }
      // Flukes drawn in (width, length) space with +y pointing toward the tail.
      const flatFin = (pts: [number, number][]) => {
        const g = shape(pts)
        g.rotateX(-Math.PI / 2)
        return g
      }

      const buildFish = (
        tint: number,
        length: number,
        peak: number,
        wiggle: number,
        build: (body: THREE.Group, mat: THREE.ShaderMaterial) => void,
      ) => {
        const mat = makeFishMat()
        const g = new THREE.Group()
        const body = new THREE.Group()
        build(body, mat)
        g.add(body)
        g.visible = false
        fishes.push({ group: g, body, mat, tint, length, peak, wiggle })
        group!.add(g)
      }

      // Shark: torpedo body, tall dorsal, vertical crescent tail.
      buildFish(0.15, 4.6, 4.6, 0.7, (body, mat) => {
        body.add(
          new THREE.Mesh(
            lathe([
              [0, -2.3], [0.12, -2.0], [0.3, -1.2], [0.5, -0.3], [0.52, 0.3], [0.42, 1.1], [0.22, 1.9], [0, 2.3],
            ]),
            mat,
          ),
        )
        body.add(new THREE.Mesh(sideFin([[0.5, 0.45], [-0.4, 1.55], [-0.75, 0.42]]), mat))
        body.add(new THREE.Mesh(sideFin([[-1.9, 0.15], [-2.7, 1.15], [-2.35, 0.05], [-2.65, -0.85], [-1.9, -0.1]]), mat))
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(sideFin([[0.9, 0], [0.05, -1.15], [-0.15, -0.1]]), mat)
          fin.position.set(s * 0.4, -0.12, 0.3)
          fin.rotation.z = s * 0.95
          body.add(fin)
        }
      })

      // Whale: heavy body, horizontal flukes, small hump.
      buildFish(0.5, 7.2, 4.2, 0.35, (body, mat) => {
        body.add(
          new THREE.Mesh(
            lathe([
              [0, -3.6], [0.2, -3.1], [0.45, -2.1], [0.95, -0.8], [1.12, 0.4], [1.02, 1.7], [0.72, 2.8], [0.3, 3.4], [0, 3.6],
            ], 26),
            mat,
          ),
        )
        body.add(new THREE.Mesh(sideFin([[-0.6, 1.0], [-1.25, 1.55], [-1.65, 0.85]]), mat))
        const fluke = new THREE.Mesh(
          flatFin([[0, 3.3], [1.9, 4.45], [1.0, 3.7], [0, 3.55], [-1.0, 3.7], [-1.9, 4.45]]),
          mat,
        )
        fluke.position.y = 0.05
        body.add(fluke)
        for (const s of [-1, 1]) {
          const flipper = new THREE.Mesh(sideFin([[0.8, 0], [-0.3, -1.4], [-0.9, -0.2]]), mat)
          flipper.position.set(s * 0.85, -0.35, 0.9)
          flipper.rotation.z = s * 1.1
          body.add(flipper)
        }
      })

      // Dolphin: slender, beak, curved dorsal, horizontal flukes, highest jumper.
      buildFish(0.3, 3.4, 6.4, 1.0, (body, mat) => {
        body.add(
          new THREE.Mesh(
            lathe([
              [0, -1.7], [0.08, -1.5], [0.22, -0.8], [0.36, 0.0], [0.38, 0.5], [0.3, 1.0], [0.16, 1.4], [0.06, 1.62], [0, 1.72],
            ]),
            mat,
          ),
        )
        body.add(new THREE.Mesh(sideFin([[0.35, 0.34], [-0.15, 0.98], [-0.35, 0.85], [-0.5, 0.32]]), mat))
        body.add(new THREE.Mesh(flatFin([[0, 1.55], [0.95, 2.1], [0.45, 1.75], [0, 1.7], [-0.45, 1.75], [-0.95, 2.1]]), mat))
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(sideFin([[0.5, 0], [-0.1, -0.7], [-0.35, -0.1]]), mat)
          fin.position.set(s * 0.3, -0.12, 0.55)
          fin.rotation.z = s * 1.0
          body.add(fin)
        }
      })

      // Tuna: football body, crescent tail, finlets along the back.
      buildFish(0.85, 3.0, 4.0, 1.2, (body, mat) => {
        body.add(
          new THREE.Mesh(
            lathe([[0, -1.5], [0.08, -1.3], [0.3, -0.7], [0.5, 0.0], [0.48, 0.6], [0.3, 1.1], [0.1, 1.42], [0, 1.5]]),
            mat,
          ),
        )
        body.add(new THREE.Mesh(sideFin([[0.45, 0.42], [0.1, 1.05], [-0.15, 0.4]]), mat))
        body.add(new THREE.Mesh(sideFin([[-1.28, 0.1], [-1.95, 0.95], [-1.62, 0.0], [-1.95, -0.95], [-1.28, -0.1]]), mat))
        for (let i = 0; i < 4; i++) {
          const z = -0.35 - i * 0.22
          body.add(new THREE.Mesh(sideFin([[z + 0.08, 0.36 - i * 0.05], [z, 0.55 - i * 0.05], [z - 0.06, 0.34 - i * 0.05]]), mat))
        }
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(sideFin([[0.6, 0], [-0.1, -0.75], [-0.25, -0.05]]), mat)
          fin.position.set(s * 0.38, -0.05, 0.35)
          fin.rotation.z = s * 1.05
          body.add(fin)
        }
      })

      // Swordfish: long bill, tall sail dorsal, crescent tail.
      buildFish(0.65, 4.8, 5.4, 0.8, (body, mat) => {
        body.add(
          new THREE.Mesh(
            lathe([[0, -1.6], [0.08, -1.4], [0.3, -0.6], [0.42, 0.2], [0.36, 0.9], [0.18, 1.5], [0, 1.65]]),
            mat,
          ),
        )
        const sword = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 1.7, 8), mat)
        sword.rotation.x = Math.PI / 2
        sword.position.z = 2.45
        body.add(sword)
        body.add(new THREE.Mesh(sideFin([[0.75, 0.36], [0.3, 1.4], [-0.35, 1.05], [-0.95, 0.3]]), mat))
        body.add(new THREE.Mesh(sideFin([[-1.4, 0.1], [-2.15, 1.05], [-1.78, 0.0], [-2.15, -1.05], [-1.4, -0.1]]), mat))
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(sideFin([[0.5, 0], [-0.5, -0.9], [-0.55, -0.05]]), mat)
          fin.position.set(s * 0.32, -0.08, 0.45)
          fin.rotation.z = s * 1.0
          body.add(fin)
        }
      })

      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.12, 8, 40),
          new THREE.MeshBasicMaterial({
            color: 0x2affc8,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
          }),
        )
        ring.rotation.x = Math.PI / 2
        ring.visible = false
        const sprayPos = new Float32Array(18 * 3)
        const sprayGeo = new THREE.BufferGeometry()
        sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3))
        const spray = new THREE.Points(
          sprayGeo,
          new THREE.PointsMaterial({
            color: 0xdffcff,
            size: 0.16,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        )
        spray.visible = false
        group.add(ring, spray)
        splashes.push({ ring, spray, age: 0, life: 1, x: 0, z: 0, active: false })
      }

      fishLight = new THREE.PointLight(0x2affc8, 0, 16)
      group.add(fishLight)

      scene.add(group)
      colorFrom(palette.a, uA)
      colorFrom(palette.c, uC)
    },
    update(m, time, dt, palette, speed = 1) {
      if (!oceanMat || !group) return
      clock += dt
      const realDt = speed > 0.001 ? dt / speed : dt
      const neonA = new THREE.Color().setRGB(...palette.a)
      const neonC = new THREE.Color().setRGB(...palette.c)
      const lift = (c: THREE.Color, target: number) => {
        const luma = Math.max(c.r * 0.299 + c.g * 0.587 + c.b * 0.114, 0.05)
        return c.multiplyScalar(target / luma)
      }
      lift(neonA, 0.62)
      lift(neonC, 0.62)

      const bassJump = m.bass - lastBass
      lastBass += (m.bass - lastBass) * 0.25
      pulseAge += dt
      if ((m.beat || bassJump > 0.22) && pulseAge > 0.45) pulseAge = 0
      oceanMat.uniforms.uTime.value = time
      oceanMat.uniforms.uBass.value = m.bass
      oceanMat.uniforms.uEnergy.value = m.energy
      oceanMat.uniforms.uTreble.value = m.treble
      oceanMat.uniforms.uPulse.value = Math.exp(-pulseAge * 1.4) * (0.5 + m.energy * 0.6)
      oceanMat.uniforms.uPulseR.value = pulseAge * 16
      colorFrom(palette.a, oceanMat.uniforms.uA.value)
      colorFrom(palette.c, oceanMat.uniforms.uC.value)
      if (moonMat) moonMat.color.setRGB(0.9 + m.energy * 0.08, 0.93, 1)
      if (skyMat) {
        skyMat.uniforms.uNeon.value.copy(neonA)
        skyMat.uniforms.uGlow.value = 0.3 + m.energy * 0.4
      }
      for (const hm of horizonMats) hm.color.copy(neonC)
      if (planktonA) {
        planktonA.position.x = ((planktonA.position.x + dt * 0.35 + 40) % 80) - 40
        const mat = planktonA.material as THREE.PointsMaterial
        mat.color.copy(neonA)
        mat.opacity = 0.55 + m.treble * 0.45
      }
      if (planktonB) {
        planktonB.position.x = ((planktonB.position.x - dt * 0.22 + 40) % 80) - 40
        const mat = planktonB.material as THREE.PointsMaterial
        mat.color.copy(neonC)
        mat.opacity = 0.45 + m.mid * 0.5
      }

      jumpTimer += realDt
      if (!jump && jumpTimer >= JUMP_INTERVAL) {
        jumpTimer -= JUMP_INTERVAL
        startJump()
      }
      for (const f of fishes) {
        f.mat.uniforms.uNeon.value.copy(neonA).lerp(neonC, f.tint)
        f.mat.uniforms.uGlow.value = m.energy
      }
      if (jump) {
        const t = (clock - jump.start) / jump.dur
        if (t >= 1) {
          jump.fish.group.visible = false
          jump = null
          if (fishLight) fishLight.intensity = 0
        } else {
          const f = jump.fish
          const arc = (u: number) => jump!.ySub + (f.peak - jump!.ySub) * Math.sin(Math.PI * u)
          const x = jump.x0 + jump.dx * t
          const z = jump.z0 + jump.dz * t
          const y = arc(t)
          const t2 = Math.min(t + 0.02, 1)
          const nx = jump.x0 + jump.dx * t2
          const nz = jump.z0 + jump.dz * t2
          const ny = arc(t2)
          f.group.position.set(x, y, z)
          f.group.lookAt(nx, ny, nz)
          f.body.rotation.z = Math.sin(t * Math.PI * 3.2) * 0.14 * f.wiggle
          f.body.rotation.x = Math.sin(t * Math.PI * 2) * 0.05 * f.wiggle
          const surfaceT = Math.asin(Math.min(1, -jump.ySub / (f.peak - jump.ySub))) / Math.PI
          if (!jump.entryDone && t >= surfaceT) {
            jump.entryDone = true
            fireSplash(x, z, f.length)
          }
          if (!jump.exitDone && t >= 1 - surfaceT) {
            jump.exitDone = true
            fireSplash(x, z, f.length)
          }
          if (fishLight) {
            fishLight.position.set(x, Math.max(y, 0.4) + 0.4, z)
            fishLight.color.copy(neonA).lerp(neonC, f.tint)
            fishLight.intensity = (y > 0 ? 6 : 1.5) + m.energy * 3
          }
        }
      }

      for (const s of splashes) {
        if (!s.active) continue
        s.age += dt
        const k = s.age / s.life
        if (k >= 1) {
          s.active = false
          s.ring.visible = false
          s.spray.visible = false
          continue
        }
        const surface = waveY(s.x, s.z, time, m.bass)
        s.ring.position.set(s.x, surface + 0.12, s.z)
        s.ring.scale.setScalar(0.4 + k * 4.2)
        const ringMat = s.ring.material as THREE.MeshBasicMaterial
        ringMat.color.copy(neonA)
        ringMat.opacity = (1 - k) * 0.85
        const pos = s.spray.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const ang = (i / pos.count) * Math.PI * 2 + i * 0.7
          const spd = 1.6 + ((i * 37) % 11) * 0.12
          const rise = 3.4 + ((i * 13) % 7) * 0.35
          pos.setXYZ(
            i,
            s.x + Math.cos(ang) * spd * s.age,
            surface + rise * s.age - 4.2 * s.age * s.age,
            s.z + Math.sin(ang) * spd * s.age,
          )
        }
        pos.needsUpdate = true
        const sprayMat = s.spray.material as THREE.PointsMaterial
        sprayMat.color.copy(neonC).lerp(new THREE.Color(0xdffcff), 0.5)
        sprayMat.opacity = (1 - k) * 0.9
      }
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      oceanMat = null
      skyMat = null
      moonMat = null
      fishLight = null
      planktonA = null
      planktonB = null
      horizonMats = []
      fishes.length = 0
      splashes.length = 0
      jump = null
    },
  }
}

export function createAbyss(): VisualStyle {
  let group: THREE.Group | null = null
  let cameraRef: THREE.PerspectiveCamera | null = null
  let snow: THREE.Points | null = null
  let school: THREE.Points | null = null
  let angler: THREE.Group | null = null
  let anglerJaw: THREE.Group | null = null
  let anglerLure: THREE.Mesh | null = null
  let anglerLureMat: THREE.MeshBasicMaterial | null = null
  let anglerLight: THREE.PointLight | null = null
  let anglerEye: THREE.MeshBasicMaterial | null = null
  let anglerTail: THREE.Mesh | null = null
  let anglerFins: THREE.Mesh[] = []
  let flash = 0
  let clock = 0
  let frame = 0
  let wavePos = 0
  let waveAmp = 0
  let schoolTimer = 16
  let schoolActive = false
  let schoolT = 0
  let schoolY = 0
  let schoolZ = -8
  let schoolDir = 1
  let giantTimer = 30
  let giantActive = false
  let giantT = 0
  let anglerTimer = 12
  let anglerActive = false
  let anglerT = 0
  let anglerDir = 1
  let anglerY = 0
  let anglerZ = -6
  let anglerDur = 26
  let lureGlow = 0
  const TENT_PTS = 16
  type Tentacle = { len: number; angle: number; radius: number; phase: number; arm: boolean }
  type Jelly = {
    root: THREE.Group
    bellMat: THREE.ShaderMaterial
    innerMat: THREE.ShaderMaterial
    tentacles: Tentacle[]
    lines: THREE.LineSegments
    base: THREE.Vector3
    drift: THREE.Vector3
    phase: number
    rate: number
    band: number
    size: number
    accent: boolean
    flash: number
    giant: boolean
  }
  const jellies: Jelly[] = []
  const colA = new THREE.Color()
  const colC = new THREE.Color()
  const white = new THREE.Color(1, 1, 1)
  const warm = new THREE.Color(1, 0.9, 0.55)
  const innerCol = new THREE.Color()
  const schoolCol = new THREE.Color()
  const lureCol = new THREE.Color()

  const bellShader = (inner: boolean) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0x44ccff) },
        uGlow: { value: 0.3 },
        uPulse: { value: 0 },
        uFlash: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        uniform float uPulse;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float rim = smoothstep(1.0, 0.42, uv.y);
          p.xz *= 1.0 - uPulse * 0.2 * rim;
          p.y *= 1.0 + uPulse * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uGlow, uFlash, uTime;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec2 vUv;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), ${inner ? '1.6' : '2.4'});
          float ribs = 0.5 + 0.5 * sin(vUv.x * 6.2831853 * 8.0 + uTime * 0.5);
          float rim = smoothstep(0.55, 0.42, vUv.y);
          float body = ${inner ? '0.18' : '0.05'} + fres * ${inner ? '1.0' : '1.25'} + ribs * 0.05 + rim * 0.28;
          vec3 col = uColor * body * (0.7 + uGlow * 0.9) + uColor * uFlash * 1.2 + vec3(uFlash * 0.4);
          float alpha = clamp(${inner ? '0.3' : '0.12'} + fres * 0.7 + rim * 0.3, 0.0, 1.0);
          gl_FragColor = vec4(col * alpha, alpha);
        }
      `,
    })

  const makeJelly = (rng: ReturnType<typeof styleRng>, size: number, giant: boolean, accent: boolean): Jelly => {
    const root = new THREE.Group()
    const bellGeo = new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2 + 0.3)
    const bellMat = bellShader(false)
    const bell = new THREE.Mesh(bellGeo, bellMat)
    bell.scale.set(1, 0.78, 1)
    bell.frustumCulled = false
    const innerMat = bellShader(true)
    const inner = new THREE.Mesh(bellGeo, innerMat)
    inner.scale.set(0.62, 0.5, 0.62)
    inner.position.y = -0.05
    inner.frustumCulled = false
    root.add(bell, inner)
    const tentacles: Tentacle[] = []
    const tentCount = giant ? 26 : 18
    const armCount = 6
    for (let i = 0; i < tentCount + armCount; i++) {
      const arm = i >= tentCount
      const angle = arm ? ((i - tentCount) / armCount) * Math.PI * 2 + 0.4 : (i / tentCount) * Math.PI * 2 + rng.next() * 0.12
      tentacles.push({
        len: arm ? 2.2 + rng.next() * 0.9 : 3.0 + rng.next() * 2.6,
        angle,
        radius: arm ? 0.28 + rng.next() * 0.1 : 0.8 + rng.next() * 0.16,
        phase: rng.next() * Math.PI * 2,
        arm,
      })
    }
    const segCount = tentacles.length * (TENT_PTS - 1)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segCount * 6), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segCount * 6), 3))
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.8,
      }),
    )
    lines.frustumCulled = false
    root.add(lines)
    root.scale.setScalar(size)
    return {
      root,
      bellMat,
      innerMat,
      tentacles,
      lines,
      base: new THREE.Vector3(),
      drift: new THREE.Vector3((rng.next() - 0.5) * 0.3, 0.05 + rng.next() * 0.1, (rng.next() - 0.5) * 0.2),
      phase: rng.next() * Math.PI * 2,
      rate: giant ? 0.5 : 0.9 + rng.next() * 0.8,
      band: Math.floor(rng.next() * 40),
      size,
      accent,
      flash: 0,
      giant,
    }
  }

  const buildAngler = () => {
    const fish = new THREE.Group()
    const skin = new THREE.MeshStandardMaterial({ color: 0x1c2531, roughness: 0.8, metalness: 0.08, emissive: 0x060a10 })
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), skin)
    body.scale.set(1.35, 0.95, 0.8)
    fish.add(body)
    // upper snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), skin)
    snout.scale.set(1.1, 0.55, 0.9)
    snout.position.set(1.15, 0.22, 0)
    fish.add(snout)
    // lower jaw pivot
    const jaw = new THREE.Group()
    jaw.position.set(0.55, -0.25, 0)
    jaw.rotation.z = -0.34 // fixed gape, no chewing
    const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(0.66, 18, 12), skin)
    jawMesh.scale.set(1.25, 0.42, 0.95)
    jawMesh.position.set(0.55, -0.15, 0)
    jaw.add(jawMesh)
    const toothGeo = new THREE.ConeGeometry(0.045, 0.3, 6)
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.4, emissive: 0x334455, emissiveIntensity: 0.3 })
    for (let i = 0; i < 9; i++) {
      const t = i / 8
      const ang = (t - 0.5) * Math.PI * 0.9
      // lower teeth (point up)
      const lower = new THREE.Mesh(toothGeo, toothMat)
      lower.position.set(0.55 + Math.cos(ang) * 0.72, 0.02, Math.sin(ang) * 0.62)
      lower.rotation.z = -0.15
      jaw.add(lower)
      // upper teeth (point down)
      const upper = new THREE.Mesh(toothGeo, toothMat)
      upper.position.set(1.1 + Math.cos(ang) * 0.7, -0.02, Math.sin(ang) * 0.58)
      upper.rotation.x = Math.PI
      upper.rotation.z = 0.12
      fish.add(upper)
    }
    fish.add(jaw)
    // eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9ad8ff })
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), eyeMat)
      eye.position.set(0.95, 0.42, s * 0.55)
      fish.add(eye)
    }
    // tail
    const tailShape = new THREE.Shape()
    tailShape.moveTo(0, 0)
    tailShape.lineTo(-0.9, 0.75)
    tailShape.lineTo(-0.7, 0)
    tailShape.lineTo(-0.9, -0.75)
    tailShape.closePath()
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), finMat)
    tail.position.set(-1.25, 0, 0)
    fish.add(tail)
    // fins
    const finShape = new THREE.Shape()
    finShape.moveTo(0, 0)
    finShape.lineTo(-0.7, 0.35)
    finShape.lineTo(-0.55, -0.15)
    finShape.closePath()
    const fins: THREE.Mesh[] = []
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape), finMat)
      fin.position.set(0.2, -0.3, s * 0.75)
      fin.rotation.y = s * 0.6
      fish.add(fin)
      fins.push(fin)
    }
    const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(finShape), finMat)
    dorsal.position.set(-0.2, 0.9, 0)
    dorsal.rotation.x = Math.PI / 2
    dorsal.rotation.z = 0.4
    fish.add(dorsal)
    // lure stalk
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.7, 0.85, 0),
      new THREE.Vector3(1.0, 1.7, 0),
      new THREE.Vector3(1.7, 2.1, 0),
      new THREE.Vector3(2.3, 1.75, 0),
    ])
    const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.03, 6, false), skin)
    fish.add(stalk)
    const lureMat = new THREE.MeshBasicMaterial({ color: 0x9ff2ff })
    const lure = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), lureMat)
    lure.position.set(2.3, 1.75, 0)
    fish.add(lure)
    const light = new THREE.PointLight(0x9ff2ff, 14, 20, 1.5)
    light.position.copy(lure.position)
    fish.add(light)
    fish.traverse((o) => {
      o.frustumCulled = false
    })
    return { fish, jaw, lure, lureMat, light, eyeMat, tail, fins }
  }

  return {
    id: 'abyss',
    label: 'Abyss',
    hint: 'Deep-sea jellyfish swarm',
    bloom: { base: 0.5, pulse: 0.2 },
    mount(scene, camera, palette) {
      cameraRef = camera
      camera.position.set(0, 0.5, 6)
      camera.lookAt(0, 0, -8)
      scene.fog = new THREE.FogExp2(0x010409, 0.05)
      scene.background = new THREE.Color(0x010409)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      clock = 0
      frame = 0
      flash = 0
      schoolTimer = 16
      schoolActive = false
      giantTimer = 30
      giantActive = false
      anglerTimer = 10
      anglerActive = false
      lureGlow = 0

      for (let i = 0; i < 13; i++) {
        const jelly = makeJelly(rng, 0.45 + rng.next() * 0.85, false, i % 2 === 1)
        jelly.base.set((rng.next() - 0.5) * 20, (rng.next() - 0.5) * 12, -4 - rng.next() * 17)
        jelly.root.position.copy(jelly.base)
        jellies.push(jelly)
        group.add(jelly.root)
      }
      const giant = makeJelly(rng, 3.6, true, false)
      giant.base.set(2, -22, -20)
      giant.root.position.copy(giant.base)
      jellies.push(giant)
      group.add(giant.root)

      const snowCount = 1800
      const sp = new Float32Array(snowCount * 3)
      for (let i = 0; i < snowCount; i++) {
        sp[i * 3] = (rng.next() - 0.5) * 34
        sp[i * 3 + 1] = (rng.next() - 0.5) * 24
        sp[i * 3 + 2] = -rng.next() * 26 + 2
      }
      const snowGeo = new THREE.BufferGeometry()
      snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      snow = new THREE.Points(
        snowGeo,
        new THREE.PointsMaterial({
          color: 0x9fb8d8,
          size: 0.045,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      )
      snow.frustumCulled = false
      group.add(snow)

      const schoolCount = 90
      const fp = new Float32Array(schoolCount * 3)
      for (let i = 0; i < schoolCount; i++) {
        fp[i * 3] = (rng.next() - 0.5) * 5
        fp[i * 3 + 1] = (rng.next() - 0.5) * 1.6
        fp[i * 3 + 2] = (rng.next() - 0.5) * 2
      }
      const schoolGeo = new THREE.BufferGeometry()
      schoolGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3))
      schoolGeo.setAttribute('aBase', new THREE.BufferAttribute(fp.slice(), 3))
      school = new THREE.Points(
        schoolGeo,
        new THREE.PointsMaterial({
          color: 0xffe08a,
          size: 0.11,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )
      school.frustumCulled = false
      school.position.set(0, -60, -10)
      group.add(school)

      const a = buildAngler()
      angler = a.fish
      anglerJaw = a.jaw
      anglerLure = a.lure
      anglerLureMat = a.lureMat
      anglerLight = a.light
      anglerEye = a.eyeMat
      anglerTail = a.tail
      anglerFins = a.fins
      angler.position.set(0, -60, -8)
      group.add(angler)
      group.add(new THREE.HemisphereLight(0x2a4a6c, 0x000000, 0.9))

      // everything is visible on the first frame so shaders compile up front; event actors hide after that
      scene.add(group)
    },
    update(m, time, dt, palette) {
      if (!group || !cameraRef) return
      frame++
      if (frame === 2) {
        const g = jellies[jellies.length - 1]
        if (!giantActive) g.root.visible = false
        if (school && !schoolActive) school.visible = false
        if (angler && !anglerActive) angler.visible = false
      }
      clock += dt
      flash = Math.max(flash * Math.exp(-dt * 6), 0)
      colorFrom(palette.a, colA)
      colorFrom(palette.c, colC)
      const lift = (c: THREE.Color, target: number) => {
        const luma = Math.max(c.r * 0.299 + c.g * 0.587 + c.b * 0.114, 0.05)
        return c.multiplyScalar(target / luma)
      }
      lift(colA, 0.7)
      lift(colC, 0.7)

      waveAmp += (m.bass - waveAmp) * Math.min(1, dt * 8)
      wavePos = (wavePos + dt * 1.1) % 1.3

      if (m.beat) {
        let best: Jelly | null = null
        let bestD = Infinity
        for (const j of jellies) {
          if (!j.root.visible) continue
          const d = j.root.position.distanceTo(cameraRef.position)
          if (d < bestD) {
            bestD = d
            best = j
          }
        }
        if (best) best.flash = 1
        flash = 1
      }

      for (const j of jellies) {
        if (!j.root.visible) continue
        const spec = m.spectrum[j.band % m.spectrum.length]
        j.phase += dt * j.rate * (0.8 + spec * 2.2 + m.energy * 0.6)
        const pulse = 0.5 + 0.5 * Math.sin(j.phase)
        const kick = Math.max(0, Math.sin(j.phase))
        j.flash = Math.max(j.flash * Math.exp(-dt * 5), 0)

        if (j.giant) {
          if (giantActive) {
            giantT += dt / 46
            j.root.position.set(j.base.x + Math.sin(clock * 0.2) * 1.2, -22 + giantT * 40, j.base.z)
            if (giantT >= 1) {
              giantActive = false
              j.root.visible = false
              giantTimer = 60 + Math.random() * 30
            }
          }
        } else {
          // soft boundaries: the drift eases back toward the swarm instead of teleporting,
          // so the scene never "cuts" - it is one continuous loop
          if (j.base.x > 9) j.drift.x -= dt * 0.06
          else if (j.base.x < -9) j.drift.x += dt * 0.06
          if (j.base.z > -4) j.drift.z -= dt * 0.05
          else if (j.base.z < -20) j.drift.z += dt * 0.05
          j.drift.x = Math.max(-0.22, Math.min(0.22, j.drift.x))
          j.drift.z = Math.max(-0.16, Math.min(0.16, j.drift.z))
          j.base.x += j.drift.x * dt
          j.base.y += (j.drift.y * kick * 0.6 - 0.02 - j.base.y * 0.012) * dt
          j.base.z += j.drift.z * dt
          j.root.position.copy(j.base)
          j.root.position.y += Math.sin(clock * 0.6 + j.phase * 0.2) * 0.2
        }
        j.root.rotation.z = j.drift.x * 0.9 + Math.sin(clock * 0.4 + j.phase) * 0.08
        j.root.rotation.x = -j.drift.z * 0.9

        const col = j.accent ? colC : colA
        j.bellMat.uniforms.uColor.value.copy(col)
        j.bellMat.uniforms.uGlow.value = 0.25 + spec * 1.3 + m.energy * 0.4
        j.bellMat.uniforms.uPulse.value = pulse
        j.bellMat.uniforms.uFlash.value = j.flash
        j.bellMat.uniforms.uTime.value = time
        innerCol.copy(col).lerp(white, 0.25)
        j.innerMat.uniforms.uColor.value.copy(innerCol)
        j.innerMat.uniforms.uGlow.value = 0.4 + spec * 1.6
        j.innerMat.uniforms.uPulse.value = pulse
        j.innerMat.uniforms.uFlash.value = j.flash
        j.innerMat.uniforms.uTime.value = time

        const pos = j.lines.geometry.getAttribute('position') as THREE.BufferAttribute
        const cols = j.lines.geometry.getAttribute('color') as THREE.BufferAttribute
        const pa = pos.array as Float32Array
        const ca = cols.array as Float32Array
        let v = 0
        let px = 0
        let py = 0
        let pz = 0
        let pr = 0
        let pg = 0
        let pb = 0
        for (const t of j.tentacles) {
          const x0 = Math.cos(t.angle) * t.radius * (1 - pulse * 0.2)
          const z0 = Math.sin(t.angle) * t.radius * (1 - pulse * 0.2)
          const len = t.len * (1 + kick * 0.12)
          for (let k = 0; k < TENT_PTS; k++) {
            const s = k / (TENT_PTS - 1)
            const sway = Math.sin(clock * 1.3 + t.phase + s * 3.2) * 0.32 * s * s + Math.sin(clock * 0.7 + t.phase * 1.7 + s * 5.0) * 0.12 * s
            const drag = -j.drift.x * s * s * 2.5
            const x = x0 + sway + drag
            const y = -0.05 - s * len
            const z = z0 + Math.cos(clock * 1.1 + t.phase + s * 2.6) * 0.28 * s * s
            const wave = Math.exp(-Math.pow((s - wavePos) * 6, 2)) * waveAmp * 1.4
            const fade = Math.pow(1 - s, t.arm ? 0.8 : 1.3)
            const glow = (t.arm ? 0.6 : 0.4) * fade * (0.5 + spec * 1.2) + wave + j.flash * fade
            const r = col.r * glow + wave * 0.3
            const g = col.g * glow + wave * 0.3
            const b = col.b * glow + wave * 0.3
            if (k > 0) {
              pa[v] = px
              pa[v + 1] = py
              pa[v + 2] = pz
              pa[v + 3] = x
              pa[v + 4] = y
              pa[v + 5] = z
              ca[v] = pr
              ca[v + 1] = pg
              ca[v + 2] = pb
              ca[v + 3] = r
              ca[v + 4] = g
              ca[v + 5] = b
              v += 6
            }
            px = x
            py = y
            pz = z
            pr = r
            pg = g
            pb = b
          }
        }
        pos.needsUpdate = true
        cols.needsUpdate = true
      }

      if (!giantActive) {
        giantTimer -= dt
        if (giantTimer <= 0) {
          giantActive = true
          giantT = 0
          jellies[jellies.length - 1].root.visible = true
        }
      }

      if (snow) {
        const pos = snow.geometry.getAttribute('position') as THREE.BufferAttribute
        const arr = pos.array as Float32Array
        const fall = (0.18 + m.energy * 0.15) * dt
        for (let i = 0; i < pos.count; i++) {
          const ix = i * 3
          let y = arr[ix + 1] - fall * (0.6 + ((i * 7) % 5) * 0.2)
          let x = arr[ix] + Math.sin(clock * 0.3 + i) * 0.002
          if (y < -12) {
            y = 12
            x = (Math.random() - 0.5) * 34
          }
          arr[ix] = x
          arr[ix + 1] = y
        }
        pos.needsUpdate = true
        const sm = snow.material as THREE.PointsMaterial
        sm.opacity = 0.35 + m.treble * 0.3 + flash * 0.2
      }

      if (school) {
        if (!schoolActive) {
          schoolTimer -= dt
          if (schoolTimer <= 0) {
            schoolActive = true
            schoolT = 0
            schoolDir = Math.random() > 0.5 ? 1 : -1
            schoolY = (Math.random() - 0.5) * 8
            schoolZ = -5 - Math.random() * 12
            school.position.set(0, 0, 0)
            school.visible = true
          }
        } else {
          schoolT += dt / 11
          const pos = school.geometry.getAttribute('position') as THREE.BufferAttribute
          const base = school.geometry.getAttribute('aBase') as THREE.BufferAttribute
          const cx = (schoolT * 2 - 1) * -schoolDir * 20
          for (let i = 0; i < pos.count; i++) {
            const wig = Math.sin(clock * 6 + i * 0.7) * 0.15
            pos.setXYZ(
              i,
              cx + base.getX(i) * (1 + Math.sin(clock * 0.8 + i) * 0.15),
              schoolY + base.getY(i) + Math.sin(clock * 1.4 + base.getX(i)) * 0.5 + wig,
              schoolZ + base.getZ(i),
            )
          }
          pos.needsUpdate = true
          const sm = school.material as THREE.PointsMaterial
          schoolCol.copy(colC).lerp(warm, 0.5)
          sm.color.copy(schoolCol)
          sm.size = 0.1 + m.treble * 0.05
          if (schoolT >= 1) {
            schoolActive = false
            school.visible = false
            schoolTimer = 24 + Math.random() * 20
          }
        }
      }

      if (angler && anglerJaw && anglerLure && anglerLureMat && anglerLight && anglerEye && anglerTail) {
        if (!anglerActive) {
          anglerTimer -= dt
          if (anglerTimer <= 0) {
            anglerActive = true
            anglerT = 0
            anglerDir = Math.random() > 0.5 ? 1 : -1
            anglerY = (Math.random() - 0.5) * 5 - 0.5
            anglerZ = -4.5 - Math.random() * 6
            anglerDur = 24 + Math.random() * 10
            angler.visible = true
          }
        } else {
          anglerT += dt / anglerDur
          const x = (anglerT * 2 - 1) * -anglerDir * 17
          const y = anglerY + Math.sin(clock * 0.5) * 0.6
          angler.position.set(x, y, anglerZ)
          angler.rotation.y = anglerDir > 0 ? Math.PI : 0
          angler.rotation.z = Math.sin(clock * 0.8) * 0.06
          angler.scale.setScalar(1.15)
          // slow tail beat, fins ripple
          anglerTail.rotation.y = Math.sin(clock * 2.6) * 0.45
          for (let i = 0; i < anglerFins.length; i++) anglerFins[i].rotation.y = (i === 0 ? -0.6 : 0.6) + Math.sin(clock * 3 + i) * 0.25
          // lure: bioluminescent trap that pulses with the music (jaw stays fixed)
          lureGlow += (0.35 + m.bass * 1.2 + m.treble * 0.5 + (m.beat ? 1.2 : 0) - lureGlow) * Math.min(1, dt * 10)
          lureCol.copy(colC).lerp(white, 0.35)
          anglerLureMat.color.copy(lureCol).multiplyScalar(0.6 + lureGlow * 1.6)
          anglerLight.color.copy(lureCol)
          anglerLight.intensity = 12 + lureGlow * 40
          anglerLure.position.y = 1.75 + Math.sin(clock * 1.7) * 0.08
          anglerLight.position.copy(anglerLure.position)
          anglerEye.color.copy(lureCol).multiplyScalar(0.4 + lureGlow * 0.4)
          if (anglerT >= 1) {
            anglerActive = false
            angler.visible = false
            anglerTimer = 22 + Math.random() * 18
          }
        }
      }

      cameraRef.position.set(Math.sin(time * 0.05) * 1.2, 0.5 + Math.sin(time * 0.08) * 0.6, 6)
      cameraRef.lookAt(Math.sin(time * 0.04) * 2.5, Math.sin(time * 0.06) * 1.2, -8)
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      cameraRef = null
      snow = null
      school = null
      angler = null
      anglerJaw = null
      anglerLure = null
      anglerLureMat = null
      anglerLight = null
      anglerEye = null
      anglerTail = null
      anglerFins = []
      jellies.length = 0
    },
  }
}

export function createCaldera(): VisualStyle {
  let group: THREE.Group | null = null
  let cameraRef: THREE.PerspectiveCamera | null = null
  let seaMat: THREE.ShaderMaterial | null = null
  let skyMat: THREE.ShaderMaterial | null = null
  let rockMat: THREE.MeshStandardMaterial | null = null
  const lavaMats: THREE.ShaderMaterial[] = []
  const lava = new THREE.Color(0xff6a1a)
  const bolt = new THREE.Color(0x9ad0ff)
  const emberTint = new THREE.Color(1, 0.85, 0.5)
  const steamBase = new THREE.Color(0.35, 0.36, 0.4)
  const whiteC = new THREE.Color(1, 1, 1)
  const scratch = new THREE.Color()
  const tmpV = new THREE.Vector3()
  const upZ = new THREE.Vector3(0, 0, 1)
  const rockUniforms = { uTime: { value: 0 }, uHot: { value: 0 }, uLava: { value: lava } }
  let skyFlash = 0
  type Volcano = { group: THREE.Group; update: (m: AudioMetrics, time: number, dt: number, sens: number) => number }
  const volcanoes: Volcano[] = []
  const TRAIL = 12
  const H = 13
  const RS = 16
  const SPARKS = 26

  const slope = (r: number) => {
    if (r <= 1.8) return H
    if (r >= RS) return -(r - RS) * 0.7
    return H * Math.pow(1 - (r - 1.8) / (RS - 1.8), 1.35)
  }
  const bump = (theta: number, r: number) => {
    const ridge = Math.min(1, Math.max(0, (r - 1.9) / 1.6)) * Math.min(1, Math.max(0, (RS - r) / 3))
    return (
      (0.42 * Math.sin(theta * 5 + r * 0.8) +
        0.28 * Math.sin(theta * 11 - r * 1.7) +
        0.16 * Math.sin(theta * 23 + r * 3.1) +
        0.1 * Math.sin(theta * 37 + r * 5)) *
      ridge
    )
  }
  const rock = (theta: number, r: number) => slope(r) + bump(theta, r)
  const rockAt = (x: number, z: number) => rock(Math.atan2(z, x), Math.hypot(x, z))
  const rockNormal = (x: number, z: number, out: THREE.Vector3) => {
    const e = 0.2
    const hx = rockAt(x + e, z) - rockAt(x - e, z)
    const hz = rockAt(x, z + e) - rockAt(x, z - e)
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize()
  }

  const noiseGLSL = `
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 4; i++) {
        v += amp * noise(p);
        p *= 2.03;
        amp *= 0.5;
      }
      return v;
    }
  `

  const lavaMaterial = (lake: boolean) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uHot: { value: 0 },
        uFlow: { value: 1 },
        uLava: { value: lava },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime, uHot, uFlow;
        uniform vec3 uLava;
        varying vec2 vUv;
        ${noiseGLSL}
        void main() {
          ${
            lake
              ? `
          vec2 q = (vUv - 0.5) * 2.0;
          float rr = length(q);
          float n = fbm(q * 2.4 + vec2(uTime * 0.12, -uTime * 0.07));
          float n2 = noise(q * 7.0 - uTime * 0.25);
          float hot = smoothstep(0.25, 0.62, n + n2 * 0.2) + (1.0 - smoothstep(0.0, 0.55, rr)) * 0.6;
          float edge = smoothstep(1.0, 0.85, rr);
          `
              : `
          float n = fbm(vec2(vUv.x * 3.0, vUv.y * 16.0 - uTime * uFlow));
          float n2 = noise(vec2(vUv.x * 9.0 + 3.0, vUv.y * 40.0 - uTime * uFlow * 1.6));
          float hot = smoothstep(0.3 + vUv.y * 0.22 - uHot * 0.12, 0.72, n + n2 * 0.25);
          float edge = smoothstep(0.5, 0.22, abs(vUv.x - 0.5));
          `
          }
          vec3 crust = vec3(0.07, 0.025, 0.01);
          vec3 col = mix(crust, uLava * (1.1 + uHot * 1.1), clamp(hot, 0.0, 1.0));
          col += uLava * 0.12;
          gl_FragColor = vec4(col * edge, edge);
        }
      `,
    })
    lavaMats.push(mat)
    return mat
  }

  const makeRockMaterial = () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4044, roughness: 0.92, metalness: 0.02, flatShading: true })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = rockUniforms.uTime
      shader.uniforms.uHot = rockUniforms.uHot
      shader.uniforms.uLava = rockUniforms.uLava
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vLocalPos;
          uniform float uTime, uHot;
          uniform vec3 uLava;
          float vhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = vhash(i);
            float b = vhash(i + vec2(1.0, 0.0));
            float c = vhash(i + vec2(0.0, 1.0));
            float d = vhash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // solid basalt: ash-grey mottling and slope-band variation so the cone reads as rock mass
            vec2 q = vLocalPos.xz;
            float mottle = vnoise(q * 0.55 + vec2(9.0, 4.0)) * 0.6 + vnoise(q * 1.9) * 0.4;
            float bands = 0.85 + 0.15 * sin(vLocalPos.y * 2.3 + vnoise(q * 0.3) * 4.0);
            diffuseColor.rgb *= (0.55 + mottle * 0.9) * bands;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.43), smoothstep(0.35, 0.75, mottle) * 0.35);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float r = length(vLocalPos.xz);
            vec2 q = vLocalPos.xz;
            // warm underglow from the lava lights the rock faintly, hiding the black-hole look
            float heightGlow = smoothstep(2.0, ${H.toFixed(1)}, vLocalPos.y);
            totalEmissiveRadiance += uLava * (0.012 + heightGlow * 0.035) * (1.0 + uHot * 0.6);
            float n1 = vnoise(q * 0.36 + vec2(3.1, 1.7)) + vnoise(q * 0.9) * 0.25;
            float vein1 = 1.0 - smoothstep(0.0, 0.028 + uHot * 0.012, abs(n1 - 0.62));
            float n2 = vnoise(q * 0.95 + vec2(7.7, 2.2)) + vnoise(q * 2.4) * 0.2;
            float vein2 = 1.0 - smoothstep(0.0, 0.02, abs(n2 - 0.6));
            float fall = smoothstep(${RS.toFixed(1)}, 4.0, r) * 0.75 + 0.25;
            float shore = smoothstep(${(RS + 0.5).toFixed(1)}, ${(RS - 1.5).toFixed(1)}, r);
            float pulse = 0.6 + 0.4 * sin(uTime * 1.6 - r * 0.9 + n1 * 4.0);
            float veins = (vein1 * 0.9 + vein2 * 0.35) * fall * shore * step(2.0, r);
            totalEmissiveRadiance += uLava * veins * (0.5 + uHot * 1.1) * pulse;
          }`,
        )
    }
    return mat
  }

  const softTexture = () =>
    canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.4, 'rgba(255,255,255,0.35)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 64, 64)
    })

  type Bomb = { mesh: THREE.Mesh; trail: THREE.Line; pos: THREE.Vector3; vel: THREE.Vector3; active: boolean; hist: Float32Array }
  type Splash = { points: THREE.Points; vel: Float32Array; age: number; life: number; active: boolean; watery: boolean }
  type Burn = { mesh: THREE.Mesh; age: number; life: number; active: boolean; size: number }

  const buildVolcano = (
    rng: ReturnType<typeof styleRng>,
    softTex: THREE.Texture,
    opts: { scale: number; rivers: number; ashPer: number; embers: number; bombs: number; bolts: number; main: boolean },
  ): Volcano => {
    const g = new THREE.Group()
    g.scale.setScalar(opts.scale)

    // cone
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0, H - 1.6),
      new THREE.Vector2(1.2, H - 1.6),
      new THREE.Vector2(1.5, H - 0.7),
      new THREE.Vector2(1.8, H),
    ]
    for (let i = 0; i <= 44; i++) {
      const r = 2.1 + (i / 44) * (RS + 2.5 - 2.1)
      profile.push(new THREE.Vector2(r, slope(r)))
    }
    // LatheGeometry winds its faces outward only when the profile runs bottom-to-top; ours was
    // authored crater-first (top-to-bottom), which flipped every face inward: the near side of the
    // cone was back-face culled and you saw the inside of the far wall - the "see-through" mountain.
    profile.reverse()
    const coneGeo = new THREE.LatheGeometry(profile, opts.main ? 110 : 72)
    const cp = coneGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i)
      const z = cp.getZ(i)
      const r = Math.hypot(x, z)
      if (r > 1.95) cp.setY(i, rock(Math.atan2(z, x), r))
    }
    coneGeo.computeVertexNormals()
    g.add(new THREE.Mesh(coneGeo, rockMat!))

    // crater lake
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), lavaMaterial(true))
    lake.rotation.x = -Math.PI / 2
    lake.position.y = H - 1.54
    g.add(lake)

    // rivers + shoreline steam
    const steams: THREE.Points[] = []
    const riverLights: THREE.PointLight[] = []
    for (let n = 0; n < opts.rivers; n++) {
      const theta0 = (n / opts.rivers) * Math.PI * 2 + rng.next() * 0.6 + 0.2
      const long = rng.next() > 0.3
      const samples = 46
      const verts = new Float32Array(samples * 2 * 3)
      const uvs = new Float32Array(samples * 2 * 2)
      const idx: number[] = []
      let endX = 0
      let endZ = 0
      const reach = long ? RS - 1.5 : 5 + rng.next() * 6
      for (let i = 0; i < samples; i++) {
        const s = i / (samples - 1)
        const r = 1.75 + s * reach
        const theta = theta0 + Math.sin(s * 4.5 + theta0) * 0.22 + s * 0.18
        const y = rock(theta, r) + 0.07
        const w = (0.2 + s * (long ? 0.55 : 0.3)) * 0.5
        const cx = Math.cos(theta) * r
        const cz = Math.sin(theta) * r
        const px = -Math.sin(theta) * w
        const pz = Math.cos(theta) * w
        verts.set([cx + px, y, cz + pz, cx - px, y, cz - pz], i * 6)
        uvs.set([0, s, 1, s], i * 4)
        if (i < samples - 1) {
          const a = i * 2
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
        if (i === samples - 1) {
          endX = cx
          endZ = cz
        }
        if (opts.main && long && i === Math.floor(samples * 0.5)) {
          const l = new THREE.PointLight(lava, 7, 10)
          l.position.set(cx, y + 0.8, cz)
          riverLights.push(l)
          g.add(l)
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      geo.setIndex(idx)
      const river = new THREE.Mesh(geo, lavaMaterial(false))
      river.renderOrder = 1
      g.add(river)

      if (long) {
        const steamCount = 36
        const stp = new Float32Array(steamCount * 3)
        for (let i = 0; i < steamCount; i++) {
          stp[i * 3] = endX + (rng.next() - 0.5) * 2.5
          stp[i * 3 + 1] = rng.next() * 4
          stp[i * 3 + 2] = endZ + (rng.next() - 0.5) * 2.5
        }
        const stGeo = new THREE.BufferGeometry()
        stGeo.setAttribute('position', new THREE.BufferAttribute(stp, 3))
        const steam = new THREE.Points(
          stGeo,
          new THREE.PointsMaterial({ map: softTex, color: 0x8890a0, size: 2.6, transparent: true, opacity: 0.16, depthWrite: false, sizeAttenuation: true }),
        )
        steam.frustumCulled = false
        steams.push(steam)
        g.add(steam)
      }
    }

    // ash column (two size classes)
    const ashState: { angle: number; h: number; speed: number; wob: number }[] = []
    const makeAsh = (count: number, size: number) => {
      const pos = new Float32Array(count * 3)
      const col = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        ashState.push({ angle: rng.next() * Math.PI * 2, h: rng.next(), speed: 0.6 + rng.next() * 0.8, wob: rng.next() })
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: softTex, vertexColors: true, size, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true }),
      )
      pts.frustumCulled = false
      return pts
    }
    const ashFar = makeAsh(opts.ashPer, 4.6)
    const ashNear = makeAsh(opts.ashPer, 7.2)
    g.add(ashFar, ashNear)

    // lightning inside the cloud
    const bolts: { line: THREE.Line; life: number }[] = []
    for (let i = 0; i < opts.bolts; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      line.frustumCulled = false
      bolts.push({ line, life: 0 })
      g.add(line)
    }

    // embers
    const emberState: { x: number; y: number; z: number; vy: number; vx: number; life: number }[] = []
    for (let i = 0; i < opts.embers; i++) emberState.push({ x: 0, y: -10, z: 0, vy: 0, vx: 0, life: rng.next() * 6 })
    const emberGeo = new THREE.BufferGeometry()
    emberGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(opts.embers * 3), 3))
    const embers = new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({ color: lava, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    )
    embers.frustumCulled = false
    g.add(embers)

    // lava bombs
    const bombGeo = new THREE.SphereGeometry(0.24, 10, 8)
    const bombs: Bomb[] = []
    for (let i = 0; i < opts.bombs; i++) {
      const mesh = new THREE.Mesh(bombGeo, new THREE.MeshBasicMaterial({ color: lava }))
      mesh.frustumCulled = false
      const tGeo = new THREE.BufferGeometry()
      tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3))
      tGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3))
      const trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      trail.frustumCulled = false
      mesh.position.y = -50
      bombs.push({ mesh, trail, pos: new THREE.Vector3(), vel: new THREE.Vector3(), active: false, hist: new Float32Array(TRAIL * 3) })
      g.add(mesh, trail)
    }

    // impact splashes (spark bursts) and residual burns
    const splashes: Splash[] = []
    for (let i = 0; i < Math.max(4, Math.floor(opts.bombs * 0.6)); i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
      const points = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: softTex, color: lava, size: 0.22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
      )
      points.frustumCulled = false
      points.position.y = -50
      splashes.push({ points, vel: new Float32Array(SPARKS * 3), age: 0, life: 1, active: false, watery: false })
      g.add(points)
    }
    const burns: Burn[] = []
    const burnGeo = new THREE.CircleGeometry(1, 18)
    for (let i = 0; i < Math.max(6, opts.bombs); i++) {
      const mesh = new THREE.Mesh(
        burnGeo,
        new THREE.MeshBasicMaterial({ color: lava, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      mesh.frustumCulled = false
      mesh.position.y = -50
      burns.push({ mesh, age: 0, life: 1, active: false, size: 0.5 })
      g.add(mesh)
    }

    const craterLight = new THREE.PointLight(lava, 30, 45)
    craterLight.position.set(0, H + 1.5, 0)
    g.add(craterLight)

    // pressure-wave rings: fired on eruption onset and on heavy beats
    type Ring = { mesh: THREE.Mesh; age: number; life: number; reach: number; active: boolean }
    const rings: Ring[] = []
    const ringGeo = new THREE.RingGeometry(0.86, 1, 96)
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: lava, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = H + 0.7
      mesh.frustumCulled = false
      rings.push({ mesh, age: 0, life: 1, reach: 20, active: false })
      g.add(mesh)
    }
    const fireRing = (reach: number, life: number) => {
      const r = rings.find((rr) => !rr.active)
      if (!r) return
      r.active = true
      r.age = 0
      r.life = life
      r.reach = reach
    }

    // long volcanic lightning: forks from the top of the ash cloud down to the crater
    const skyBolts: { line: THREE.Line; life: number }[] = []
    for (let i = 0; i < (opts.main ? 2 : 1); i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      line.frustumCulled = false
      skyBolts.push({ line, life: 0 })
      g.add(line)
    }
    let skyCooldown = 4 + rng.next() * 4

    let eruptionTimer = opts.main ? 22 : 30 + rng.next() * 50
    let eruptionAge = -1
    let eruption = 0
    let bombTimer = 1 + rng.next()
    let boltCooldown = 0
    let craterFlash = 0
    let localClock = 0

    const fireSplash = (x: number, y: number, z: number, watery: boolean, launch: boolean, power = 1) => {
      const s = splashes.find((sp) => !sp.active)
      if (!s) return
      s.active = true
      s.watery = watery
      s.age = 0
      s.life = watery ? 1.4 : launch ? 0.9 + power * 0.25 : 1.1
      const pos = s.points.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < SPARKS; i++) {
        const ang = Math.random() * Math.PI * 2
        const spd = (watery ? 0.6 + Math.random() * 1.4 : 1.5 + Math.random() * 3.5) * power
        pos.setXYZ(i, x, y, z)
        s.vel[i * 3] = Math.cos(ang) * spd * (launch ? 0.6 : 1)
        s.vel[i * 3 + 1] = watery ? 1.2 + Math.random() * 2 : ((launch ? 4 : 1.5) + Math.random() * 4.5) * power
        s.vel[i * 3 + 2] = Math.sin(ang) * spd * (launch ? 0.6 : 1)
      }
      pos.needsUpdate = true
      s.points.position.set(0, 0, 0)
    }
    const leaveBurn = (x: number, y: number, z: number) => {
      const b = burns.find((bb) => !bb.active) ?? burns[0]
      b.active = true
      b.age = 0
      b.life = 7 + Math.random() * 6
      rockNormal(x, z, tmpV)
      b.mesh.position.set(x + tmpV.x * 0.06, y + tmpV.y * 0.06, z + tmpV.z * 0.06)
      b.mesh.quaternion.setFromUnitVectors(upZ, tmpV)
      b.size = 0.35 + Math.random() * 0.3
      b.mesh.scale.setScalar(b.size)
    }

    const update = (m: AudioMetrics, time: number, dt: number, sens: number) => {
      localClock += dt
      // eruption schedule
      if (eruptionAge < 0) {
        eruptionTimer -= dt * (0.7 + sens * 0.3)
        if (eruptionTimer <= 0) {
          // onset: blinding crater flash, pressure ring racing outward, sky lit up
          eruptionAge = 0
          craterFlash = 1.4
          fireRing(30, 1.9)
          fireSplash(0, H - 0.4, 0, false, true, 2.2)
          skyFlash = Math.max(skyFlash, 1.2)
        }
        eruption = Math.max(0, eruption - dt * 0.5)
      } else {
        eruptionAge += dt
        if (eruptionAge < 1.5) eruption = eruptionAge / 1.5
        else if (eruptionAge < 9) eruption = 1
        else if (eruptionAge < 12) eruption = 1 - (eruptionAge - 9) / 3
        else {
          eruption = 0
          eruptionAge = -1
          eruptionTimer = (opts.main ? 45 : 70) + Math.random() * 40
        }
      }
      craterFlash = Math.max(0, craterFlash - dt * 2.2)
      const hot = m.bass + eruption * 0.8 + craterFlash * 0.4
      craterLight.color.copy(lava)
      craterLight.intensity = 26 + m.bass * 30 + eruption * 60 + craterFlash * 60 + (m.beat ? 12 : 0)
      for (const l of riverLights) {
        l.color.copy(lava)
        l.intensity = 6 + m.bass * 6 + eruption * 4
      }

      // ash column
      let si = 0
      for (const pts of [ashFar, ashNear]) {
        const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute
        const col = pts.geometry.getAttribute('color') as THREE.BufferAttribute
        const pa = pos.array as Float32Array
        const ca = col.array as Float32Array
        for (let i = 0; i < pos.count; i++, si++) {
          const a = ashState[si]
          a.h += dt * a.speed * (0.04 + eruption * 0.05)
          if (a.h > 1) a.h -= 1
          const radius = (1.1 + a.h * 7.5) * (0.7 + a.wob * 0.6)
          const ang = a.angle + a.h * 2.2 + time * 0.12
          const ix = i * 3
          pa[ix] = Math.cos(ang) * radius + a.h * a.h * 8
          pa[ix + 1] = H + 0.4 + a.h * 26
          pa[ix + 2] = Math.sin(ang) * radius
          const lit = Math.pow(1 - a.h, 2.6) * (0.35 + eruption * 0.6 + m.bass * 0.3 + craterFlash * 0.5)
          const grey = 0.018 + a.wob * 0.012
          ca[ix] = lava.r * lit + grey
          ca[ix + 1] = lava.g * lit + grey
          ca[ix + 2] = lava.b * lit + grey
        }
        pos.needsUpdate = true
        col.needsUpdate = true
        ;(pts.material as THREE.PointsMaterial).opacity = 0.48 + eruption * 0.22
      }

      // lightning in the cloud
      boltCooldown -= dt
      for (const b of bolts) {
        if (b.life > 0) {
          b.life -= dt
          const mat = b.line.material as THREE.LineBasicMaterial
          mat.opacity = Math.max(0, b.life / 0.22) * (0.6 + Math.random() * 0.4)
          mat.color.copy(bolt)
        } else if (boltCooldown <= 0 && (m.treble > 0.45 - eruption * 0.2 || Math.random() < eruption * 0.02)) {
          boltCooldown = 0.35 + Math.random() * 0.8 - eruption * 0.2
          b.life = 0.22
          const pos = b.line.geometry.getAttribute('position') as THREE.BufferAttribute
          let x = (Math.random() - 0.5) * 6 + 3
          let y = H + 4 + Math.random() * 10
          let z = (Math.random() - 0.5) * 6
          for (let k = 0; k < pos.count; k++) {
            pos.setXYZ(k, x, y, z)
            x += (Math.random() - 0.5) * 1.6
            y -= 0.5 + Math.random() * 0.7
            z += (Math.random() - 0.5) * 1.6
          }
          pos.needsUpdate = true
          break
        } else {
          ;(b.line.material as THREE.LineBasicMaterial).opacity = 0
        }
      }

      // embers
      {
        const pos = embers.geometry.getAttribute('position') as THREE.BufferAttribute
        const pa = pos.array as Float32Array
        for (let i = 0; i < pos.count; i++) {
          const e = emberState[i]
          e.life -= dt
          if (e.life <= 0) {
            e.x = (Math.random() - 0.5) * 1.6
            e.z = (Math.random() - 0.5) * 1.6
            e.y = H - 0.2
            e.vy = 1.5 + Math.random() * 2.5 + eruption * 3 + craterFlash * 3
            e.vx = 0.4 + Math.random() * 0.8
            e.life = 3 + Math.random() * 4
          }
          e.y += e.vy * dt
          e.x += (e.vx + Math.sin(localClock * 2 + i) * 0.5) * dt
          e.z += Math.cos(localClock * 1.7 + i * 0.3) * 0.5 * dt
          e.vy *= 1 - dt * 0.25
          pa[i * 3] = e.x
          pa[i * 3 + 1] = e.y
          pa[i * 3 + 2] = e.z
        }
        pos.needsUpdate = true
        const em = embers.material as THREE.PointsMaterial
        em.color.copy(lava).lerp(emberTint, 0.3)
        em.opacity = 0.4 + m.energy * 0.6
        em.size = 0.14 + m.treble * 0.08
      }

      // lava bombs: rate scales with the Sensitivity slider
      bombTimer -= dt
      let spawn = 0
      if (m.beat) spawn += 1 + Math.floor(m.bass * 2 * sens)
      if (Math.random() < dt * m.energy * sens * (opts.main ? 0.9 : 0.4)) spawn++
      if (bombTimer <= 0) {
        spawn += 1
        bombTimer = (eruption > 0.3 ? 0.13 : (opts.main ? 2.2 : 5) + Math.random() * 2) / Math.max(0.4, sens)
      }
      if (spawn > 0) {
        craterFlash = Math.min(1.4, craterFlash + 0.3 * spawn)
        // beats fire a lava fountain whose height follows the bass; heavy hits ring the crater
        const power = m.beat ? 1 + m.bass * 1.6 * sens + eruption * 0.5 : 1
        fireSplash(0, H - 0.6, 0, false, true, power)
        if (m.beat && m.bass > 0.5) {
          fireSplash(0, H - 0.4, 0, false, true, power * 1.2)
          fireRing(12 + m.bass * 14, 0.9)
        }
      }

      // pressure rings
      for (const r of rings) {
        if (!r.active) continue
        r.age += dt
        const k = r.age / r.life
        const mat = r.mesh.material as THREE.MeshBasicMaterial
        if (k >= 1) {
          r.active = false
          mat.opacity = 0
          r.mesh.scale.setScalar(0.01)
          continue
        }
        r.mesh.scale.setScalar(0.6 + Math.pow(k, 0.55) * r.reach)
        mat.color.copy(lava).lerp(whiteC, 0.35).multiplyScalar(1.6)
        mat.opacity = (1 - k) * (1 - k) * 0.75
      }

      // sky lightning
      skyCooldown -= dt
      for (const b of skyBolts) {
        const mat = b.line.material as THREE.LineBasicMaterial
        if (b.life > 0) {
          b.life -= dt
          mat.opacity = Math.max(0, b.life / 0.32) * (0.65 + Math.random() * 0.35)
          mat.color.copy(bolt).lerp(whiteC, 0.5)
        } else if (skyCooldown <= 0 && (Math.random() < dt * (eruption * 1.6 + 0.015) || (m.beat && m.treble > 0.5 && Math.random() < 0.4))) {
          skyCooldown = Math.max(0.4, 1.4 + Math.random() * 3.5 - eruption * 1.2)
          b.life = 0.32
          skyFlash = Math.max(skyFlash, 0.7 + eruption * 0.5)
          craterFlash = Math.min(1.4, craterFlash + 0.45)
          const pos = b.line.geometry.getAttribute('position') as THREE.BufferAttribute
          const n = pos.count
          const x0 = (Math.random() - 0.5) * 12 + 4
          const z0 = (Math.random() - 0.5) * 12
          const y0 = H + 15 + Math.random() * 10
          const x1 = (Math.random() - 0.5) * 3
          const z1 = (Math.random() - 0.5) * 3
          let jx = 0
          let jz = 0
          for (let k = 0; k < n; k++) {
            const s = k / (n - 1)
            jx += (Math.random() - 0.5) * 2.6
            jz += (Math.random() - 0.5) * 2.6
            const w = Math.sin(s * Math.PI) * 0.55
            pos.setXYZ(k, x0 + (x1 - x0) * s + jx * w, y0 + (H + 0.3 - y0) * s, z0 + (z1 - z0) * s + jz * w)
          }
          pos.needsUpdate = true
          break
        } else {
          mat.opacity = 0
        }
      }
      for (const b of bombs) {
        if (spawn > 0 && !b.active) {
          spawn--
          b.active = true
          const ang = Math.random() * Math.PI * 2
          const spd = 1.5 + Math.random() * 4 + eruption * 2
          b.pos.set((Math.random() - 0.5) * 0.8, H + 0.1, (Math.random() - 0.5) * 0.8)
          b.vel.set(Math.cos(ang) * spd, 8 + Math.random() * 6 + eruption * 5 + (m.beat ? m.bass * 5 : 0), Math.sin(ang) * spd)
          for (let k = 0; k < TRAIL; k++) b.hist.set([b.pos.x, b.pos.y, b.pos.z], k * 3)
        }
        if (!b.active) continue
        b.vel.y -= 9.8 * dt
        b.pos.addScaledVector(b.vel, dt)
        const r = Math.hypot(b.pos.x, b.pos.z)
        const ground = r < RS ? rock(Math.atan2(b.pos.z, b.pos.x), r) : 0
        if (b.pos.y < ground) {
          b.active = false
          b.mesh.position.y = -50
          const watery = r >= RS - 0.3
          fireSplash(b.pos.x, ground + 0.1, b.pos.z, watery, false)
          if (!watery) leaveBurn(b.pos.x, ground, b.pos.z)
          const tp = b.trail.geometry.getAttribute('position') as THREE.BufferAttribute
          for (let k = 0; k < TRAIL; k++) tp.setXYZ(k, 0, -50, 0)
          tp.needsUpdate = true
          continue
        }
        b.mesh.position.copy(b.pos)
        ;(b.mesh.material as THREE.MeshBasicMaterial).color.copy(lava).multiplyScalar(1.9)
        for (let k = TRAIL - 1; k > 0; k--) {
          b.hist[k * 3] = b.hist[(k - 1) * 3]
          b.hist[k * 3 + 1] = b.hist[(k - 1) * 3 + 1]
          b.hist[k * 3 + 2] = b.hist[(k - 1) * 3 + 2]
        }
        b.hist.set([b.pos.x, b.pos.y, b.pos.z], 0)
        const tp = b.trail.geometry.getAttribute('position') as THREE.BufferAttribute
        const tc = b.trail.geometry.getAttribute('color') as THREE.BufferAttribute
        for (let k = 0; k < TRAIL; k++) {
          tp.setXYZ(k, b.hist[k * 3], b.hist[k * 3 + 1], b.hist[k * 3 + 2])
          const f = Math.pow(1 - k / (TRAIL - 1), 1.5) * 1.6
          tc.setXYZ(k, lava.r * f, lava.g * f, lava.b * f)
        }
        tp.needsUpdate = true
        tc.needsUpdate = true
      }

      // splashes
      for (const s of splashes) {
        if (!s.active) continue
        s.age += dt
        const k = s.age / s.life
        const mat = s.points.material as THREE.PointsMaterial
        if (k >= 1) {
          s.active = false
          mat.opacity = 0
          s.points.position.y = -50
          continue
        }
        const pos = s.points.geometry.getAttribute('position') as THREE.BufferAttribute
        const pa = pos.array as Float32Array
        const grav = s.watery ? 2.5 : 9.8
        for (let i = 0; i < SPARKS; i++) {
          const ix = i * 3
          s.vel[ix + 1] -= grav * dt
          pa[ix] += s.vel[ix] * dt
          pa[ix + 1] += s.vel[ix + 1] * dt
          pa[ix + 2] += s.vel[ix + 2] * dt
        }
        pos.needsUpdate = true
        if (s.watery) {
          mat.color.copy(steamBase).multiplyScalar(1.3)
          mat.size = 0.6 + k * 1.8
          mat.opacity = (1 - k) * 0.4
        } else {
          mat.color.copy(lava).multiplyScalar(2.2)
          mat.size = 0.42 - k * 0.15
          mat.opacity = 1 - k * k
        }
      }

      // residual burns cool down slowly
      for (const b of burns) {
        if (!b.active) continue
        b.age += dt
        const k = b.age / b.life
        const mat = b.mesh.material as THREE.MeshBasicMaterial
        if (k >= 1) {
          b.active = false
          mat.opacity = 0
          b.mesh.position.y = -50
          continue
        }
        const glow = Math.pow(1 - k, 1.6)
        mat.color.copy(lava).multiplyScalar(0.6 + glow * 1.2 + m.bass * 0.4)
        mat.opacity = 0.08 + glow * 0.5
        b.mesh.scale.setScalar(b.size * (1 + k * 0.8))
      }

      for (const pts of steams) {
        const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute
        const pa = pos.array as Float32Array
        for (let k = 0; k < pos.count; k++) {
          const ix = k * 3
          let y = pa[ix + 1] + dt * (0.5 + (k % 3) * 0.2)
          let x = pa[ix] + dt * 0.3
          if (y > 4.5) {
            y = 0
            x -= 1.4
          }
          pa[ix] = x
          pa[ix + 1] = y
        }
        pos.needsUpdate = true
        const sm = pts.material as THREE.PointsMaterial
        sm.color.copy(lava).multiplyScalar(0.25).add(steamBase)
        sm.opacity = 0.12 + m.bass * 0.08
      }
      return eruption
    }

    return { group: g, update }
  }

  return {
    id: 'caldera',
    label: 'Caldera',
    hint: 'Erupting volcano at night',
    bloom: { base: 0.42, pulse: 0.18 },
    mount(scene, camera, palette) {
      cameraRef = camera
      camera.position.set(0, 6.5, 40)
      camera.lookAt(0, 8.5, 0)
      scene.fog = new THREE.FogExp2(0x040308, 0.0065)
      scene.background = new THREE.Color(0x040308)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      lavaMats.length = 0
      volcanoes.length = 0
      rockMat = makeRockMaterial()

      // sky dome
      skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uLava: { value: lava }, uGlow: { value: 0 }, uFlash: { value: 0 }, uCamDir: { value: new THREE.Vector2(0, 1) } },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uLava;
          uniform float uGlow, uFlash;
          uniform vec2 uCamDir;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            vec3 top = vec3(0.006, 0.008, 0.02);
            vec3 hor = vec3(0.035, 0.025, 0.055);
            vec3 col = mix(hor, top, smoothstep(0.0, 0.55, d.y));
            float along = dot(d.xz, uCamDir);
            float side = d.x * uCamDir.y - d.z * uCamDir.x;
            float glow = exp(-pow(side * 2.6, 2.0)) * exp(-max(d.y, 0.0) * 6.0) * smoothstep(0.1, -0.3, along);
            col += uLava * glow * (0.12 + uGlow * 0.25);
            col += uLava * exp(-max(d.y, 0.0) * 9.0) * 0.03;
            // volcanic lightning lights the whole cloud deck for a frame or two
            col += mix(vec3(0.55, 0.65, 1.0), uLava, 0.35) * uFlash * 0.2 * (0.35 + 0.65 * exp(-max(d.y, 0.0) * 2.5));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const sky = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 16), skyMat)
      sky.renderOrder = -3
      sky.frustumCulled = false
      group.add(sky)

      const starCount = 1100
      const sp = new Float32Array(starCount * 3)
      for (let i = 0; i < starCount; i++) {
        const th = rng.next() * Math.PI * 2
        const ph = Math.acos(rng.next() * 0.9 + 0.05)
        sp[i * 3] = 200 * Math.sin(ph) * Math.cos(th)
        sp[i * 3 + 1] = 200 * Math.cos(ph)
        sp[i * 3 + 2] = 200 * Math.sin(ph) * Math.sin(th)
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc8d4ee, size: 0.6, transparent: true, opacity: 0.7, depthWrite: false, fog: false })))

      // volcanoes: the main caldera plus distant neighbours around the map
      const layout = [
        { x: 0, z: 0, scale: 1, rivers: 7, ashPer: 300, embers: 560, bombs: 26, bolts: 3, main: true },
        { x: -82, z: -58, scale: 0.72, rivers: 4, ashPer: 120, embers: 160, bombs: 10, bolts: 1, main: false },
        { x: 78, z: -92, scale: 0.9, rivers: 5, ashPer: 140, embers: 180, bombs: 12, bolts: 1, main: false },
        { x: 96, z: 44, scale: 0.6, rivers: 3, ashPer: 100, embers: 120, bombs: 8, bolts: 1, main: false },
        { x: -60, z: 96, scale: 0.68, rivers: 4, ashPer: 110, embers: 140, bombs: 8, bolts: 1, main: false },
      ]
      const softTex = softTexture()
      for (const l of layout) {
        const v = buildVolcano(rng, softTex, l)
        v.group.position.set(l.x, 0, l.z)
        volcanoes.push(v)
        group.add(v.group)
      }

      // sea
      seaMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uGlow: { value: 0 },
          uFlash: { value: 0 },
          uLava: { value: lava },
          uCam: { value: new THREE.Vector2(0, 1) },
          uVolc: { value: layout.map((l) => new THREE.Vector3(l.x, l.z, l.scale)) },
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: `
          uniform float uTime, uGlow, uFlash;
          uniform vec3 uLava;
          uniform vec2 uCam;
          uniform vec3 uVolc[${layout.length}];
          varying vec3 vWorld;
          ${noiseGLSL}
          void main() {
            vec2 p = vWorld.xz;
            float r = length(p);
            float ripple = fbm(p * 0.35 + vec2(uTime * 0.15, uTime * 0.08));
            vec2 perp = vec2(-uCam.y, uCam.x);
            float along = dot(p, uCam);
            float across = dot(p, perp);
            float streak = fbm(vec2(across * 0.9, along * 0.12 + uTime * 0.3));
            vec3 water = vec3(0.004, 0.008, 0.02) * (0.5 + ripple * 0.9);
            float islandGlow = 0.0;
            for (int i = 0; i < ${layout.length}; i++) {
              float d = length(p - uVolc[i].xy);
              islandGlow += exp(-max(d - ${RS.toFixed(1)} * uVolc[i].z, 0.0) / (7.0 * uVolc[i].z)) * uVolc[i].z;
            }
            float craterRefl = exp(-abs(across) / 4.5) * smoothstep(70.0, 16.0, along) * step(14.0, along);
            float sparkle = smoothstep(0.62, 0.9, streak);
            vec3 col = water + uLava * (islandGlow * 0.035 + craterRefl * (0.06 + uGlow * 0.14)) * (0.3 + streak * 0.7 + sparkle * 1.5);
            col *= smoothstep(220.0, 60.0, r) * 0.85 + 0.15;
            col += vec3(0.45, 0.55, 0.9) * uFlash * 0.045 * (0.4 + streak + sparkle);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), seaMat)
      sea.rotation.x = -Math.PI / 2
      sea.frustumCulled = false
      group.add(sea)

      group.add(new THREE.HemisphereLight(0x33476a, 0x14090a, 1.15))
      // cool moonlight key so the cone's flat-shaded facets read as a solid mountain
      const moon = new THREE.DirectionalLight(0x8fa3d0, 0.85)
      moon.position.set(60, 90, 40)
      group.add(moon)
      const fill = new THREE.DirectionalLight(0x4a4f70, 0.35)
      fill.position.set(-70, 40, -50)
      group.add(fill)
      scene.add(group)
    },
    update(m, time, dt, palette, _speed, sensitivity) {
      if (!group || !cameraRef) return
      const sens = sensitivity ?? 1

      const lift = (c: THREE.Color, target: number) => {
        const luma = Math.max(c.r * 0.299 + c.g * 0.587 + c.b * 0.114, 0.05)
        return c.multiplyScalar(target / luma)
      }
      lava.setRGB(...palette.a).lerp(scratch.setRGB(1, 0.42, 0.08), 0.45)
      const hsl = { h: 0, s: 0, l: 0 }
      lava.getHSL(hsl)
      lava.setHSL(hsl.h, Math.max(hsl.s, 0.92), 0.5)
      lift(lava, 0.42)
      bolt.setRGB(...palette.c).lerp(scratch.setRGB(1, 1, 1), 0.4)
      lift(bolt, 0.9)

      skyFlash = Math.max(0, skyFlash - dt * 3.2)
      let maxEruption = 0
      for (const v of volcanoes) maxEruption = Math.max(maxEruption, v.update(m, time, dt, sens))

      const hot = m.bass + maxEruption * 0.8
      for (const mat of lavaMats) {
        mat.uniforms.uTime.value = time
        mat.uniforms.uHot.value = hot
        mat.uniforms.uFlow.value = 0.8 + m.bass * 1.6 + maxEruption * 1.2
      }
      rockUniforms.uTime.value = time
      rockUniforms.uHot.value = m.bass * 0.8 + maxEruption * 0.6

      // camera orbits the main caldera; the Speed slider sets the orbit rate (time is speed-scaled)
      const orbit = time * 0.05
      const shake = maxEruption * 0.14
      const radius = 41 + Math.sin(time * 0.09) * 3
      cameraRef.position.set(
        Math.sin(orbit) * radius + (Math.random() - 0.5) * shake,
        6.8 + Math.sin(time * 0.11) * 0.9 + (Math.random() - 0.5) * shake,
        Math.cos(orbit) * radius,
      )
      cameraRef.lookAt(0, 8.5, 0)
      const cx = cameraRef.position.x
      const cz = cameraRef.position.z
      const cl = Math.hypot(cx, cz) || 1
      if (seaMat) {
        seaMat.uniforms.uTime.value = time
        seaMat.uniforms.uGlow.value = m.bass * 0.8 + maxEruption
        seaMat.uniforms.uFlash.value = skyFlash
        seaMat.uniforms.uCam.value.set(cx / cl, cz / cl)
      }
      if (skyMat) {
        skyMat.uniforms.uGlow.value = m.energy + maxEruption * 1.5
        skyMat.uniforms.uFlash.value = skyFlash
        skyMat.uniforms.uCamDir.value.set(cx / cl, cz / cl)
      }
    },
    dispose(scene) {
      if (group) {
        scene.remove(group)
        disposeObject(group)
      }
      scene.fog = new THREE.FogExp2(0x030308, 0.028)
      scene.background = new THREE.Color(0x030308)
      group = null
      cameraRef = null
      seaMat = null
      skyMat = null
      rockMat = null
      lavaMats.length = 0
      volcanoes.length = 0
    },
  }
}

export function createRainWindow(): VisualStyle {
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  const uA = new THREE.Color()
  const uB = new THREE.Color()
  const uC = new THREE.Color()
  let flare = 0
  let beatId = 0

  return {
    id: 'rain',
    label: 'Rain Window',
    hint: 'Neon city through wet glass',
    bloom: { base: 0.3, pulse: 0.14 },
    mount(scene, camera) {
      camera.position.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      scene.fog = null
      scene.background = new THREE.Color(0x03030a)
      flare = 0
      beatId = 0
      material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uEnergy: { value: 0 },
          uFlare: { value: 0 },
          uBeatId: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uA: { value: uA },
          uB: { value: uB },
          uC: { value: uC },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime, uBass, uMid, uTreble, uEnergy, uFlare, uBeatId;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }
          vec3 neon(vec3 c) {
            float luma = dot(c, vec3(0.299, 0.587, 0.114));
            vec3 sat = max(mix(vec3(luma), c, 2.2), vec3(0.0));
            float l2 = dot(sat, vec3(0.299, 0.587, 0.114));
            return sat * (0.7 / max(l2, 0.05));
          }
          float box(vec2 p, vec2 center, vec2 hs, float b) {
            vec2 d = abs(p - center) - hs;
            float m = max(d.x, d.y);
            return 1.0 - smoothstep(-b, b, m);
          }
          float glowDot(vec2 p, vec2 c, float r) {
            float d = length(p - c);
            return exp(-d * d / (r * r));
          }

          vec3 signs(vec2 p, float b, float k) {
            vec3 col = vec3(0.0);
            for (int i = 0; i < 7; i++) {
              float fi = float(i);
              vec2 sc = vec2(-0.85 + fi * 0.27 + hash1(fi + 1.0) * 0.12, -0.16 + hash1(fi + 9.0) * 0.3);
              vec2 sh = vec2(0.035 + hash1(fi + 2.0) * 0.07, 0.014 + hash1(fi + 5.0) * 0.03);
              float pick = mod(fi, 3.0);
              vec3 scol = pick < 0.5 ? neon(uA) : (pick < 1.5 ? neon(uC) : neon(uB));
              float flick = 0.7 + 0.3 * sin(uTime * (2.0 + hash1(fi) * 6.0) + fi * 3.0);
              flick = mix(flick, 1.0, 0.4) * (0.75 + uMid * 0.6);
              float mine = step(abs(mod(uBeatId, 7.0) - fi), 0.5);
              float fl = uFlare * mine;
              float body = box(p, sc, sh, b * 1.4);
              vec2 dd = max(abs(p - sc) - sh, 0.0);
              float halo = exp(-length(dd) * 22.0) * 0.55;
              // lettering bands so the sign is not a flat block
              float letters = 0.55 + 0.45 * step(0.45, fract((p.x - sc.x) * 90.0 + hash1(fi) * 3.0));
              letters = mix(letters, 1.0, clamp(b * 40.0, 0.0, 1.0));
              col += scol * (body * letters * (1.1 + fl * 1.6) * flick + halo * (0.6 + fl * 1.2) * flick) * k;
            }
            return col;
          }

          vec3 traffic(vec2 p, float b, float k, float aspect) {
            vec3 col = vec3(0.0);
            float span = aspect + 0.5;
            float r = 0.008 + b * 0.8;
            for (int i = 0; i < 5; i++) {
              float fi = float(i);
              float spd = 0.09 + hash1(fi + 21.0) * 0.08;
              float x = mod(uTime * spd + hash1(fi + 30.0) * span, span) - span * 0.5;
              float y = -0.33 + hash1(fi + 40.0) * 0.012;
              float hl = glowDot(p, vec2(x, y), r) + glowDot(p, vec2(x + 0.028, y), r);
              col += vec3(1.0, 0.95, 0.85) * hl * 0.9 * k;
              float x2 = span * 0.5 - mod(uTime * spd * 0.9 + hash1(fi + 50.0) * span, span);
              float y2 = -0.355 + hash1(fi + 60.0) * 0.012;
              float tl = glowDot(p, vec2(x2, y2), r * 0.9) + glowDot(p, vec2(x2 + 0.022, y2), r * 0.9);
              col += vec3(1.0, 0.12, 0.1) * tl * 0.8 * k;
            }
            return col;
          }

          vec3 train(vec2 p, float b, float k, float aspect) {
            float cyc = 41.0;
            float phase = fract(uTime / cyc);
            float on = step(phase, 0.26);
            float x0 = mix(-aspect * 0.5 - 1.1, aspect * 0.5 + 0.2, phase / 0.26);
            float len = 1.0;
            float y = 0.07;
            float inside = step(x0, p.x) * step(p.x, x0 + len);
            float band = 1.0 - smoothstep(0.014, 0.014 + b * 2.0, abs(p.y - y));
            float win = step(0.35, fract((p.x - x0) * 46.0));
            win = mix(win, 0.8, clamp(b * 40.0, 0.0, 1.0));
            vec3 col = vec3(1.0, 0.9, 0.7) * band * inside * win * 0.85;
            col += vec3(0.9, 0.95, 1.0) * glowDot(p, vec2(x0 + len + 0.01, y), 0.012 + b) * 1.2;
            // dark body silhouette over the city
            return col * on * k;
          }

          float trainMask(vec2 p, float aspect) {
            float cyc = 41.0;
            float phase = fract(uTime / cyc);
            float on = step(phase, 0.26);
            float x0 = mix(-aspect * 0.5 - 1.1, aspect * 0.5 + 0.2, phase / 0.26);
            float inside = step(x0, p.x) * step(p.x, x0 + 1.0);
            return on * inside * (1.0 - smoothstep(0.024, 0.03, abs(p.y - 0.07)));
          }

          float lightning() {
            float cyc = 19.0;
            float cell = floor(uTime / cyc);
            float phase = fract(uTime / cyc);
            float h = hash1(cell + 7.0);
            float on = step(0.4, h) * step(phase, 0.09);
            float f = exp(-phase * 45.0) + 0.6 * exp(-abs(phase - 0.045) * 80.0);
            return on * f;
          }

          vec3 drone(vec2 p, float b, float k) {
            float cyc = 53.0;
            float phase = fract(uTime / cyc);
            float on = step(phase, 0.32);
            vec2 pos = vec2(mix(-0.55, 0.65, phase / 0.32), 0.24 + sin(uTime * 0.7) * 0.05);
            float blinkR = step(0.5, fract(uTime * 1.5));
            float blinkG = step(0.5, fract(uTime * 1.5 + 0.5));
            vec3 col = vec3(1.0, 0.1, 0.1) * glowDot(p, pos + vec2(-0.012, 0.0), 0.006 + b) * blinkR;
            col += vec3(0.1, 1.0, 0.3) * glowDot(p, pos + vec2(0.012, 0.0), 0.006 + b) * blinkG;
            float below = step(p.y, pos.y);
            float spread = 0.01 + (pos.y - p.y) * 0.32;
            float cone = (1.0 - smoothstep(spread * 0.6, spread, abs(p.x - pos.x))) * below * exp(-(pos.y - p.y) * 5.0);
            col += vec3(0.75, 0.82, 1.0) * cone * 0.22;
            return col * on * k;
          }

          // rotating searchlights sweeping the clouds from street level, swing speed follows the mids
          vec3 beams(vec2 p) {
            vec3 col = vec3(0.0);
            for (int i = 0; i < 2; i++) {
              float fi = float(i);
              vec2 o = vec2(-0.32 + fi * 0.7, -0.22);
              float ang = 1.5708 + sin(uTime * (0.22 + uMid * 0.25) + fi * 2.4) * 0.75;
              vec2 dir = vec2(cos(ang), sin(ang));
              vec2 rel = p - o;
              float along = dot(rel, dir);
              float perp = dot(rel, vec2(-dir.y, dir.x));
              float width = 0.012 + along * 0.09;
              float beam = exp(-perp * perp / (width * width)) * step(0.0, along) * exp(-along * 1.4);
              vec3 bc = i == 0 ? neon(uB) : neon(uA);
              col += mix(vec3(0.75, 0.8, 1.0), bc, 0.35) * beam * (0.24 + uMid * 0.28 + uFlare * 0.1);
            }
            return col * smoothstep(-0.32, -0.05, p.y);
          }

          // giant animated billboard: scrolling colour bands that slam to white on beats
          vec3 billboard(vec2 p, float b) {
            vec2 c = vec2(0.5, 0.37);
            vec2 hs = vec2(0.15, 0.062);
            float body = box(p, c, hs, b * 1.2);
            vec2 q = (p - c) / hs;
            float bands = 0.5 + 0.5 * sin(q.x * 9.0 - uTime * 2.4 + sin(q.y * 3.0 + uTime) * 0.8);
            bands = smoothstep(0.3, 0.7, bands);
            float cyc = 0.5 + 0.5 * sin(uTime * 0.35);
            vec3 ca = mix(neon(uA), neon(uC), cyc);
            vec3 cb = mix(neon(uC), neon(uB), cyc);
            vec3 pic = mix(ca, cb, bands) * (0.55 + uBass * 0.9);
            // frame + logo dot
            float frame = box(p, c, hs + 0.006, b) - body;
            pic += vec3(1.0) * uFlare * 0.9 * step(abs(mod(uBeatId, 3.0)), 0.5);
            pic += vec3(1.0, 0.95, 0.9) * glowDot(p, c + vec2(-0.1, 0.0), 0.02 + b) * (0.6 + uTreble);
            vec2 dd = max(abs(p - c) - hs, 0.0);
            float halo = exp(-length(dd) * 16.0) * 0.5;
            return pic * body * 1.1 + mix(ca, cb, 0.5) * halo * (0.5 + uBass * 0.6) + vec3(0.02) * clamp(frame, 0.0, 1.0);
          }

          vec3 city(vec2 p, float b, float aspect) {
            vec3 col = mix(vec3(0.018, 0.012, 0.045), vec3(0.07, 0.03, 0.1), smoothstep(0.5, -0.15, p.y));
            col += mix(neon(uA), neon(uC), 0.5) * 0.07 * exp(-max(p.y + 0.12, 0.0) * 6.0);
            float flash = lightning();
            col += vec3(0.55, 0.6, 0.85) * flash * smoothstep(-0.3, 0.4, p.y) * 0.8;
            col += beams(p);

            float covered = 0.0;
            for (int layer = 0; layer < 2; layer++) {
              float fl = float(layer);
              float cw = layer == 0 ? 0.085 : 0.15;
              float shift = fl * 13.7;
              float cellId = floor(p.x / cw + shift);
              float h = hash(vec2(cellId, fl * 7.3 + 1.0));
              float height = layer == 0 ? -0.02 + h * 0.36 : -0.2 + h * 0.32;
              float xin = fract(p.x / cw + shift);
              float gap = 1.0 - smoothstep(0.93 - b * 2.0, 0.96 + b * 2.0, xin);
              float inside = (1.0 - smoothstep(-b * 3.0, b * 3.0, p.y - height)) * gap;
              vec3 bcol = layer == 0 ? vec3(0.035, 0.028, 0.06) : vec3(0.012, 0.01, 0.022);
              bcol += vec3(0.2, 0.22, 0.3) * flash * 0.4;
              vec2 wc = vec2(p.x / (cw * 0.11), (p.y - height) / 0.018);
              vec2 wid = floor(wc);
              vec2 wf = fract(wc);
              float wh = hash(wid + vec2(cellId * 31.0, fl));
              float lit = step(0.66, wh);
              float flick = 0.75 + 0.25 * sin(uTime * (0.8 + wh * 3.0) + wh * 20.0);
              float win = box(wf, vec2(0.5), vec2(0.24, 0.28), b * 40.0) * lit * flick;
              vec3 wcol = mix(vec3(1.0, 0.85, 0.6), mix(uA, uC, hash(wid + 3.0)), 0.4);
              // a quarter of the lit windows are neon-colored and pulse with the music
              float cpick = hash(wid + vec2(17.0 + cellId, fl * 5.0 + 2.0));
              float colorful = step(cpick, 0.25);
              float bandPick = hash(wid + vec2(fl + 41.0, cellId));
              float band = bandPick < 0.33 ? uBass : (bandPick < 0.66 ? uMid : uTreble);
              vec3 ncol = bandPick < 0.33 ? neon(uA) : (bandPick < 0.66 ? neon(uC) : neon(uB));
              float mine = step(abs(mod(uBeatId + floor(cpick * 40.0), 5.0)), 0.5);
              float pulse = 0.35 + band * 1.6 + uFlare * mine * 1.8;
              wcol = mix(wcol, ncol * pulse * 1.6, colorful);
              col = mix(col, bcol, inside);
              col += wcol * win * inside * (layer == 0 ? 0.28 : 0.5) * (0.8 + uEnergy * 0.4);
              covered = max(covered, inside);
            }

            // elevated train silhouette + lit windows
            float tm = trainMask(p, aspect);
            col = mix(col, vec3(0.01, 0.01, 0.02), tm);
            col += train(p, b, 1.0, aspect);

            // street level: wet pavement reflecting the neon
            float street = smoothstep(-0.27, -0.29, p.y);
            vec3 pave = vec3(0.012, 0.012, 0.02);
            vec2 mp = vec2(p.x + noise(vec2(p.x * 30.0, p.y * 40.0 + uTime * 0.5)) * 0.01, -0.58 - p.y);
            vec3 refl = signs(mp, b * 2.5, 0.35) * (0.6 + noise(vec2(p.x * 60.0, p.y * 80.0 - uTime)) * 0.6);
            col = mix(col, pave + refl, street);

            col += signs(p, b, 1.0) * (1.0 - street);
            col += billboard(p, b) * (1.0 - street);
            col += traffic(p, b, 1.0, aspect);
            col += drone(p, b, 1.0);

            // rain falling outside (two layers: far drizzle and near heavier streaks)
            float streak = noise(vec2(p.x * 90.0, p.y * 3.0 + uTime * 7.0));
            col += vec3(0.05, 0.06, 0.09) * smoothstep(0.7, 0.86, streak) * (0.4 + uEnergy * 0.8);
            float streak2 = noise(vec2(p.x * 160.0 + 40.0, p.y * 2.2 + uTime * 11.0));
            col += mix(vec3(0.06, 0.07, 0.1), neon(uA) * 0.08, 0.3) * smoothstep(0.76, 0.9, streak2) * (0.3 + uEnergy * 1.0);
            return col;
          }

          void main() {
            float aspect = uRes.x / max(uRes.y, 1.0);
            vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
            float t = uTime;

            vec2 normal = vec2(0.0);
            float dropMask = 0.0;
            float trailMask = 0.0;
            float spec = 0.0;
            float rim = 0.0;
            vec2 rimDir = vec2(0.0);

            for (int l = 0; l < 2; l++) {
              float fl = float(l);
              float scale = 9.0 + fl * 7.0;
              vec2 gp = p * scale + vec2(fl * 3.7, fl * 1.9);
              vec2 id = floor(gp);
              vec2 f = fract(gp) - 0.5;
              float h = hash(id + fl * 11.0);
              // stationary drops are a fixed set - they never pop in or out with the music
              float exists = step(h, 0.5);
              vec2 center = (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.55;
              float r = 0.11 + hash(id + 4.1) * 0.15;
              vec2 d = f - center;
              float dist = length(d);
              float mask = (1.0 - smoothstep(r * 0.82, r, dist)) * exists;
              normal += (d / r) * mask * (0.7 + fl * 0.3);
              dropMask = max(dropMask, mask);
              rim += smoothstep(r * 0.55, r * 0.92, dist) * mask;
              rimDir += (d / r) * smoothstep(r * 0.55, r * 0.92, dist) * mask;
              spec += (1.0 - smoothstep(0.0, r * 0.32, length(d - vec2(-r * 0.36, r * 0.36)))) * mask;
            }

            // running drops with trails
            {
              float cols = 15.0;
              float cw = aspect / cols;
              float id = floor((p.x + aspect * 0.5) / cw);
              float hid = hash1(id + 3.0);
              float spd = 0.14 + hash1(id + 4.0) * 0.22;
              float cycle = t * spd + hid;
              float yh = 0.55 - fract(cycle) * 1.15;
              // which columns run is decided once per cycle (no music dependence), and the drop
              // fades out as it runs off the bottom edge instead of vanishing on reset
              float exists = step(hash1(id + floor(cycle) * 7.0), 0.7) * smoothstep(1.0, 0.86, fract(cycle));
              float xc = (id + 0.5) * cw - aspect * 0.5 + sin(p.y * 9.0 + id) * 0.006 + (hash1(id + 8.0) - 0.5) * cw * 0.5;
              vec2 d = vec2((p.x - xc) * 1.6, (p.y - yh) * 1.25);
              float r = 0.026;
              float head = (1.0 - smoothstep(r * 0.8, r, length(d))) * exists;
              normal += (d / r) * head * 1.2;
              dropMask = max(dropMask, head);
              rim += smoothstep(r * 0.5, r * 0.9, length(d)) * head;
              rimDir += (d / r) * smoothstep(r * 0.5, r * 0.9, length(d)) * head;
              spec += (1.0 - smoothstep(0.0, r * 0.3, length(d - vec2(-r * 0.35, r * 0.35)))) * head;
              float above = step(yh, p.y) * (1.0 - smoothstep(0.0, 0.4, p.y - yh));
              float trail = above * (1.0 - smoothstep(0.004, 0.009, abs(p.x - xc))) * exists;
              trailMask = max(trailMask, trail);
              vec2 sd = vec2((p.x - xc) * 1.6, (fract(p.y * 34.0 + id) - 0.5) / 34.0 * 1.4);
              float small = (1.0 - smoothstep(0.004, 0.007, length(sd))) * above * exists * step(0.4, hash1(id + floor(p.y * 34.0 + id)));
              normal += (sd / 0.007) * small * 0.6;
              dropMask = max(dropMask, small);
            }

            float clear = clamp(dropMask + trailMask, 0.0, 1.0);
            float blur = mix(0.022, 0.0035, clear);
            vec2 refr = normal * 0.055 * dropMask;
            vec3 col = city(p + refr, blur, aspect);
            col += vec3(0.9, 0.95, 1.0) * spec * 0.4;
            // neon refraction fringe: drop edges split the city light into palette colours
            {
              float ang = atan(rimDir.y, rimDir.x + 0.0001);
              float sel = 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.4);
              vec3 fringe = mix(neon(uA), neon(uC), sel);
              fringe = mix(fringe, neon(uB), 0.5 + 0.5 * sin(ang * 3.0 - uTime * 0.3));
              col += fringe * clamp(rim, 0.0, 1.0) * (0.09 + uEnergy * 0.14 + uFlare * 0.1);
            }
            // fogged glass tint where no drops have cleared it
            col = mix(col * 0.8 + vec3(0.012, 0.014, 0.025), col, 0.55 + clear * 0.45);
            col *= smoothstep(0.85, 0.3, length(p * vec2(0.65, 1.0)));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      scene.add(mesh)
      material.uniforms.uRes.value.set(window.innerWidth, window.innerHeight)
    },
    update(m, time, dt, palette) {
      if (!material) return
      flare = Math.max(flare * Math.exp(-dt * 4), m.beat ? 1 : 0)
      if (m.beat) beatId++
      material.uniforms.uTime.value = time
      material.uniforms.uBass.value = m.bass
      material.uniforms.uMid.value = m.mid
      material.uniforms.uTreble.value = m.treble
      material.uniforms.uEnergy.value = m.energy
      material.uniforms.uFlare.value = flare
      material.uniforms.uBeatId.value = beatId
      colorFrom(palette.a, material.uniforms.uA.value)
      colorFrom(palette.b, material.uniforms.uB.value)
      colorFrom(palette.c, material.uniforms.uC.value)
    },
    resize(w, h) {
      if (material) material.uniforms.uRes.value.set(w, h)
    },
    dispose(scene) {
      if (mesh) {
        scene.remove(mesh)
        disposeObject(mesh)
      }
      scene.background = new THREE.Color(0x030308)
      mesh = null
      material = null
    },
  }
}

export const STYLE_CATALOG = [
  { id: 'nebula', label: 'Nebula', hint: 'Spiral dust and embers' },
  { id: 'dusk', label: 'Dusk', hint: 'Fixed city orbit' },
  { id: 'warp', label: 'Warp', hint: 'Through the wormhole' },
  { id: 'prism', label: 'Prism', hint: 'Light through glass' },
  { id: 'aurora', label: 'Aurora', hint: 'Curtains of night light' },
  { id: 'drive', label: 'Night Drive', hint: 'Cybertruck into the city' },
  { id: 'storm', label: 'Storm', hint: 'Colored lightning weather' },
  { id: 'hive', label: 'Hive', hint: 'Honeycomb and bees' },
  { id: 'void', label: 'Void', hint: 'Black hole in deep space' },
  { id: 'tide', label: 'Tide', hint: 'Neon tide with leaping fish' },
  { id: 'abyss', label: 'Abyss', hint: 'Deep-sea jellyfish swarm' },
  { id: 'caldera', label: 'Caldera', hint: 'Erupting volcano at night' },
  { id: 'rain', label: 'Rain Window', hint: 'Neon city through wet glass' },
] as const

export const STYLE_FACTORIES = [
  createNebula,
  createDusk,
  createWarp,
  createPrism,
  createAurora,
  createCycle,
  createStorm,
  createHive,
  createVoid,
  createTide,
  createAbyss,
  createCaldera,
  createRainWindow,
]

export function createAllStyles(): VisualStyle[] {
  return STYLE_FACTORIES.map((factory) => factory())
}
