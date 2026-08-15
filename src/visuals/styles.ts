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
  let meteors: THREE.LineSegments | null = null
  let armMat: THREE.ShaderMaterial | null = null
  let starMat: THREE.ShaderMaterial | null = null
  const colorA = new THREE.Color()
  const colorB = new THREE.Color()
  const colorC = new THREE.Color()
  const meteorSeeds: { a: number; b: number; speed: number; delay: number }[] = []

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
          vGlow = 0.16 + uEnergy * 0.28 + aSeed * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (uSize + uBass * 2.4 + aSeed * 1.8) * (6.2 / max(1.3, -mv.z));
        }
      `,
      fragmentShader: glow,
    })

  return {
    id: 'nebula',
    label: 'Nebula',
    hint: 'Spiral dust and embers',
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
        1.35,
        `
          uniform vec3 uA, uB, uC;
          varying float vSeed, vGlow;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            float core = smoothstep(0.5, 0.08, d);
            vec3 col = mix(uA, uB, vSeed);
            col = mix(col, uC, smoothstep(0.72, 1.0, vSeed));
            col = min(col, vec3(0.85));
            gl_FragColor = vec4(col * vGlow, core * 0.7);
          }
        `,
      )
      arms = new THREE.Points(makeCloud(9000, 7.2, 1.6), armMat)
      dust = new THREE.Points(
        makeCloud(5000, 8.8, 2.4),
        particleMat(
          0.7,
          `
            uniform vec3 uA, uB, uC;
            varying float vSeed, vGlow;
            void main() {
              vec2 uv = gl_PointCoord - 0.5;
              float d = length(uv);
              if (d > 0.5) discard;
              vec3 col = mix(uB, uC, vSeed);
              gl_FragColor = vec4(col * vGlow * 0.55, smoothstep(0.5, 0.0, d) * 0.35);
            }
          `,
        ),
      )
      sparks = new THREE.Points(
        makeCloud(700, 6.4, 2.8),
        particleMat(
          2.1,
          `
            uniform vec3 uA, uB, uC;
            varying float vSeed, vGlow;
            void main() {
              vec2 uv = gl_PointCoord - 0.5;
              float d = length(uv);
              if (d > 0.5) discard;
              float spike = pow(max(0.0, 1.0 - abs(uv.x) * 8.0), 2.0) + pow(max(0.0, 1.0 - abs(uv.y) * 8.0), 2.0);
              vec3 col = mix(uC, uA, vSeed);
              gl_FragColor = vec4(col * (0.4 + vGlow), (smoothstep(0.45, 0.0, d) + spike * 0.35) * 0.8);
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

      const meteorCount = 5
      const meteorPos = new Float32Array(meteorCount * 6)
      for (let i = 0; i < meteorCount; i++) {
        meteorSeeds.push({
          a: rng.next() * Math.PI * 2,
          b: (rng.next() - 0.5) * 1.4,
          speed: 0.18 + rng.next() * 0.22,
          delay: rng.next() * 8,
        })
      }
      const meteorGeo = new THREE.BufferGeometry()
      meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPos, 3))
      meteors = new THREE.LineSegments(
        meteorGeo,
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )

      group.add(stars, arms, dust, sparks, meteors)
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
      if (meteors) {
        const pos = meteors.geometry.getAttribute('position') as THREE.BufferAttribute
        const mat = meteors.material as THREE.LineBasicMaterial
        mat.color.setRGB(palette.c[0] * 0.4 + 0.7, palette.c[1] * 0.3 + 0.75, palette.c[2] * 0.2 + 0.85)
        mat.opacity = 0.25 + m.energy * 0.35
        for (let i = 0; i < meteorSeeds.length; i++) {
          const s = meteorSeeds[i]
          const life = ((time * s.speed + s.delay) % 6.5) / 6.5
          const r = 9.5 - life * 11
          const a = s.a + life * 0.35
          const x = Math.cos(a) * r
          const y = s.b + life * 0.4
          const z = Math.sin(a) * r
          const x2 = Math.cos(a + 0.04) * (r + 0.85)
          const z2 = Math.sin(a + 0.04) * (r + 0.85)
          pos.setXYZ(i * 2, x, y, z)
          pos.setXYZ(i * 2 + 1, x2, y + 0.08, z2)
        }
        pos.needsUpdate = true
      }
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
      meteors = null
      armMat = null
      starMat = null
      meteorSeeds.length = 0
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

  return {
    id: 'warp',
    label: 'Warp',
    hint: 'Through the wormhole',
    bloom: { base: 0.34, pulse: 0.06 },
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
          uniform float uTime, uSpeed, uBass, uMid, uTreble, uEnergy, uMode;
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

            float n = fbm(vec2(spiral * 0.82, depth * 2.2));
            float n2 = fbm(vec2(spiral * 1.55 + 4.0, depth * 3.0));
            float arms = 0.5 + 0.5 * sin(spiral * 6.0);
            float arms2 = 0.5 + 0.5 * sin(spiral * 3.0 + 1.15);

            vec3 wall = mix(ca, cb, n);
            wall = mix(wall, cc, n2 * 0.42);
            wall *= 0.3 + arms * 0.72 + arms2 * 0.22;
            float wallFade = smoothstep(0.012, 0.08, lr) * exp(-lr * 0.45);
            wall *= wallFade * (0.88 + uEnergy * 0.16);

            float core = exp(-lr * 16.0);
            float throat = exp(-lr * 6.4) * 0.16;
            vec3 exitCol = mix(cc, vec3(0.72, 0.8, 0.9), 0.22);
            float fringe = exp(-abs(lr - 0.09) * 14.0);
            vec3 chroma = vec3(ca.r, cb.g, cc.b) * fringe * 0.42;

            float stars = 0.0;
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
              }
            }
            stars *= 0.55 + uTreble * 0.28;

            float space = fbm(luv * 3.0) * smoothstep(0.55, 1.4, lr);
            vec3 col = vec3(0.008, 0.01, 0.028);
            col += wall;
            col += exitCol * (core * 0.55 + throat);
            col += chroma;
            col += mix(vec3(0.84, 0.91, 1.0), cc, 0.28) * stars;
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
    update(m, time, _dt, palette, speed = 1) {
      if (!material) return
      material.uniforms.uTime.value = speed > 0.001 ? time / speed : time
      material.uniforms.uSpeed.value = speed
      material.uniforms.uBass.value = m.bass
      material.uniforms.uMid.value = m.mid
      material.uniforms.uTreble.value = m.treble
      material.uniforms.uEnergy.value = m.energy
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
      const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.05), stripMat)
      lightBar.position.set(0, 0.7, 1.24)
      const barGlow = new THREE.Mesh(
        new THREE.BoxGeometry(1.66, 0.16, 0.03),
        new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.32, depthWrite: false }),
      )
      barGlow.position.set(0, 0.7, 1.27)
      neonMats.push(barGlow.material as THREE.MeshBasicMaterial)
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
      }
      const under = group.getObjectByName('drive-under') as THREE.PointLight | undefined
      if (under) {
        under.color.copy(accent)
        under.intensity = 1.8 + m.energy * 1.4
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
  let group: THREE.Group | null = null
  let comb: THREE.InstancedMesh | null = null
  let honey: THREE.InstancedMesh | null = null
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const look = new THREE.Vector3()
  const cells: { x: number; y: number; z: number; honey: number }[] = []
  const bees: {
    root: THREE.Group
    left: THREE.Object3D
    right: THREE.Object3D
    phase: number
    pace: number
    spread: number
    lift: number
  }[] = []

  const makeBee = () => {
    const root = new THREE.Group()
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      emissive: 0xf2c14e,
      emissiveIntensity: 0.18,
      roughness: 0.45,
    })
    const black = new THREE.MeshStandardMaterial({
      color: 0x1c140c,
      roughness: 0.55,
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
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), yellow)
    abdomen.scale.set(0.78, 0.78, 1.45)
    abdomen.position.set(0, -0.01, -0.14)
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 8), black)
    stripe.scale.set(0.86, 0.86, 0.28)
    stripe.position.set(0, -0.01, -0.12)
    const stripe2 = stripe.clone()
    stripe2.position.z = -0.18
    const wingGeo = new THREE.PlaneGeometry(0.18, 0.09)
    const left = new THREE.Mesh(wingGeo, wingMat)
    const right = new THREE.Mesh(wingGeo, wingMat)
    left.position.set(-0.04, 0.06, 0.02)
    right.position.set(0.04, 0.06, 0.02)
    left.rotation.y = 0.35
    right.rotation.y = -0.35
    root.add(thorax, head, abdomen, stripe, stripe2, left, right)
    return { root, left, right }
  }

  return {
    id: 'hive',
    label: 'Hive',
    hint: 'Honeycomb and bees',
    mount(scene, camera, palette) {
      camera.position.set(0.35, 0.85, 9.4)
      camera.lookAt(0, 0.35, 0)
      scene.fog = new THREE.FogExp2(0x120b07, 0.038)
      scene.background = new THREE.Color(0x120b07)
      group = new THREE.Group()
      const rng = styleRng(palette.seed)
      const hex = hexCellTexture()
      const wax = new THREE.MeshStandardMaterial({
        map: hex,
        emissiveMap: hex,
        emissive: new THREE.Color(0xc48a32),
        emissiveIntensity: 0.22,
        metalness: 0.08,
        roughness: 0.62,
      })
      const nectar = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffb44a,
        emissiveIntensity: 0.7,
        metalness: 0.2,
        roughness: 0.28,
      })
      const cellGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.4, 6)
      cellGeo.rotateX(Math.PI / 2)
      const honeyGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6)
      honeyGeo.rotateX(Math.PI / 2)
      const spacingX = 0.58
      const spacingY = 0.5
      for (let row = -8; row <= 8; row++) {
        for (let col = -7; col <= 7; col++) {
          const x = (col + (row & 1) * 0.5) * spacingX
          const y = row * spacingY
          if (Math.hypot(x * 0.92, y * 0.72) > 4.15 || rng.next() < 0.04) continue
          cells.push({
            x,
            y,
            z: x * x * 0.028 - 0.15,
            honey: rng.next() > 0.38 ? 0.45 + rng.next() * 0.55 : 0,
          })
        }
      }
      comb = new THREE.InstancedMesh(cellGeo, wax, cells.length)
      honey = new THREE.InstancedMesh(honeyGeo, nectar, cells.length)
      comb.count = cells.length
      honey.count = cells.length
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        dummy.position.set(cell.x, cell.y, cell.z)
        dummy.scale.setScalar(1)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        comb.setMatrixAt(i, dummy.matrix)
        color.setRGB(0.86, 0.62, 0.22).lerp(new THREE.Color().setRGB(...palette.a), 0.28)
        comb.setColorAt(i, color)
        dummy.position.z = cell.z + 0.16
        dummy.scale.setScalar(cell.honey > 0 ? 1 : 0.001)
        dummy.updateMatrix()
        honey.setMatrixAt(i, dummy.matrix)
        color.setRGB(...palette.c).lerp(new THREE.Color(0xffc056), 0.55)
        honey.setColorAt(i, color)
      }
      if (comb.instanceColor) comb.instanceColor.needsUpdate = true
      if (honey.instanceColor) honey.instanceColor.needsUpdate = true
      group.add(comb, honey)

      const beeCount = 7
      for (let i = 0; i < beeCount; i++) {
        const parts = makeBee()
        bees.push({
          root: parts.root,
          left: parts.left,
          right: parts.right,
          phase: rng.next() * Math.PI * 2,
          pace: 0.7 + rng.next() * 0.7,
          spread: 1.7 + rng.next() * 1.4,
          lift: 0.15 + rng.next() * 1.6,
        })
        group.add(parts.root)
      }

      const key = new THREE.PointLight(0xffc56a, 18, 26)
      key.position.set(2.2, 3.4, 6)
      key.name = 'style-light'
      const fill = new THREE.PointLight(0x4a2a10, 7, 20)
      fill.position.set(-4, 0.4, 4)
      fill.name = 'style-light'
      group.add(key, fill)
      scene.add(group)
    },
    update(m, time, _dt, palette, speed = 1) {
      if (!group || !comb || !honey) return
      const wax = comb.material as THREE.MeshStandardMaterial
      wax.emissive.setRGB(0.55 + palette.a[0] * 0.25, 0.32 + palette.a[1] * 0.15, 0.08)
      wax.emissiveIntensity = 0.16 + m.energy * 0.18
      const nectar = honey.material as THREE.MeshStandardMaterial
      nectar.emissive.setRGB(palette.c[0], palette.c[1] * 0.7 + 0.25, palette.c[2] * 0.25)
      nectar.emissiveIntensity = 0.45 + m.energy * 0.4
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        const spec = m.spectrum[i % m.spectrum.length]
        dummy.position.set(cell.x, cell.y, cell.z)
        dummy.scale.setScalar(1)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        comb.setMatrixAt(i, dummy.matrix)
        color.setRGB(0.84, 0.6, 0.2).lerp(new THREE.Color().setRGB(...palette.a), 0.3)
        comb.setColorAt(i, color)
        const fill = cell.honey * (0.7 + spec * 0.55 + m.bass * 0.12)
        dummy.position.z = cell.z + 0.16
        dummy.scale.setScalar(cell.honey > 0 ? 0.75 + fill * 0.45 : 0.001)
        dummy.updateMatrix()
        honey.setMatrixAt(i, dummy.matrix)
        color.setRGB(...palette.c).lerp(new THREE.Color(0xffc056), 0.5 + spec * 0.2)
        honey.setColorAt(i, color)
      }
      comb.instanceMatrix.needsUpdate = true
      honey.instanceMatrix.needsUpdate = true
      if (comb.instanceColor) comb.instanceColor.needsUpdate = true
      if (honey.instanceColor) honey.instanceColor.needsUpdate = true

      const flight = time
      const flap = time * (38 + speed * 10)
      for (let i = 0; i < bees.length; i++) {
        const bee = bees[i]
        const t = flight * bee.pace + bee.phase
        const x = Math.cos(t) * bee.spread + Math.sin(t * 2.15 + bee.phase) * 0.55
        const y = bee.lift + Math.sin(t * 1.65) * 1.15 + Math.sin(t * 4.4 + i) * 0.18
        const z = 1.55 + Math.sin(t * 0.92 + bee.phase) * 1.25 + Math.cos(t * 1.8) * 0.35
        const t2 = t + 0.08
        look.set(
          Math.cos(t2) * bee.spread + Math.sin(t2 * 2.15 + bee.phase) * 0.55,
          bee.lift + Math.sin(t2 * 1.65) * 1.15,
          1.55 + Math.sin(t2 * 0.92 + bee.phase) * 1.25,
        )
        bee.root.position.set(x, y, z)
        bee.root.lookAt(look)
        bee.left.rotation.x = Math.sin(flap + i) * 0.72
        bee.right.rotation.x = -Math.sin(flap + i + 0.4) * 0.72
      }
      group.rotation.y = Math.sin(time * 0.07) * 0.05
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

  return {
    id: 'void',
    label: 'Void',
    hint: 'Black hole singularity',
    bloom: { base: 0.26, pulse: 0.05 },
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
          uniform float uTime, uBass, uMid, uTreble, uEnergy, uSeed;
          uniform vec2 uRes;
          uniform vec3 uA, uB, uC;
          varying vec2 vUv;

          const float RS = 1.0;
          const float ISCO = 3.05;
          const float DISK_OUT = 13.6;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float hash13(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
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
            float temp = pow(ISCO / max(r, ISCO), 0.75) * pow(max(0.001, 1.0 - sqrt(xr)), 0.25);
            temp *= sqrt(max(0.05, 1.0 - RS / max(r, RS * 1.02)));
            float phi = atan(hit.z, hit.x);
            float omega = 1.55 * pow(ISCO / max(r, 0.9), 1.55) + 0.7;
            float kepler = phi - uTime * omega;
            float turb = 0.48 + 0.52 * sin(kepler * 5.0 + r * 1.6);
            turb *= 0.58 + 0.42 * sin(kepler * 2.2 - r * 0.85);
            turb *= 0.72 + 0.28 * sin(kepler * 9.0 - r * 3.2);
            turb = mix(0.7, turb, 0.8 + uMid * 0.1);
            float dens = smoothstep(ISCO, ISCO + 0.42, r) * smoothstep(DISK_OUT, DISK_OUT - 3.2, r);
            dens *= 0.55 + turb * 0.7;
            float orbSpeed = sqrt(0.5 * RS / max(r, ISCO));
            vec3 orbDir = normalize(vec3(-hit.z, 0.0, hit.x));
            float dop = max(0.22, 1.0 + 1.65 * dot(normalize(vel), orbDir) * orbSpeed);
            float boost = dop * dop * dop;
            float colorTemp = temp * pow(dop, 1.35) * (1.05 + uEnergy * 0.12);
            vec3 col = blackbody(colorTemp);
            vec3 outer = mix(uB, uA, 0.45);
            col = mix(col, mix(col, outer, 0.35), smoothstep(5.5, 11.5, r));
            col = mix(col * vec3(1.18, 0.42, 0.16), col, clamp(dop * 0.55, 0.0, 1.0));
            return col * dens * boost * (0.95 + uBass * 0.1);
          }

          vec3 starTint(vec2 id) {
            float h = hash(id + uSeed);
            float h2 = hash(id + 9.7);
            return mix(mix(uA, uB, h), uC, h2 * 0.65);
          }

          vec3 vortexLayer(float rad, float ang, float t, float lanes, float rings, float amp) {
            float edge = pow(clamp((0.62 - rad) / 0.48, 0.0, 1.0), 1.35);
            float spin = ang + t * (0.38 + 2.8 * edge) + 0.42 * log(max(rad, 0.04));
            float fall = rad * rings + t * (1.15 + 1.8 * edge);
            vec2 id = floor(vec2(spin * lanes / 6.2831853, fall));
            vec2 f = fract(vec2(spin * lanes / 6.2831853, fall));
            float n = hash(id + uSeed * 0.13);
            if (n < 0.58) return vec3(0.0);
            vec2 c = f - 0.5;
            float pix = 1.0 - smoothstep(0.1, 0.2, max(abs(c.x), abs(c.y)));
            float fade = smoothstep(0.055, 0.13, rad) * smoothstep(1.42, 0.42, rad);
            return starTint(id) * pix * amp * fade * (0.45 + n * 0.8);
          }

          vec3 sky(vec3 dir, vec2 uv) {
            vec3 d = normalize(dir);
            float a = uTime * 0.48;
            float ca = cos(a);
            float sa = sin(a);
            d = vec3(ca * d.x + sa * d.z, d.y, -sa * d.x + ca * d.z);

            vec3 cell = floor(d * 68.0);
            float n = hash13(cell + vec3(uSeed * 0.002));
            vec3 acc = vec3(0.012, 0.014, 0.03);
            acc += starTint(cell.xy) * pow(n, 20.0) * (1.2 + uTreble * 0.22);
            acc += mix(uB, uC, 0.4) * pow(hash13(floor(d * 7.0 + 2.4)), 2.0) * 0.12;

            float r = length(uv);
            float warp = 0.024 / max(r * r, 0.0035);
            vec2 luv = uv * (1.0 - clamp(warp, 0.0, 0.68));
            float rad = length(luv);
            float ang = atan(luv.y, luv.x);
            acc += vortexLayer(rad, ang, uTime, 34.0, 18.0, 0.95);
            acc += vortexLayer(rad, ang, uTime * 0.62 + 1.7, 21.0, 12.0, 0.62);
            acc += vortexLayer(rad, ang + 0.4, uTime * 0.4 + 3.1, 13.0, 8.0, 0.4);

            vec3 s0 = normalize(vec3(0.82, 0.22, 0.48));
            vec3 s1 = normalize(vec3(-0.64, 0.12, 0.72));
            vec3 s2 = normalize(vec3(0.18, -0.28, -0.88));
            vec3 s3 = normalize(vec3(-0.42, 0.36, -0.62));
            float k0 = 1.0 - dot(d, s0);
            float k1 = 1.0 - dot(d, s1);
            float k2 = 1.0 - dot(d, s2);
            float k3 = 1.0 - dot(d, s3);
            acc += mix(uA, vec3(1.0, 0.86, 0.58), 0.45) * (exp(-k0 * 920.0) * 2.1 + exp(-k0 * 58.0) * 0.22);
            acc += mix(uB, vec3(0.72, 0.84, 1.0), 0.4) * (exp(-k1 * 780.0) * 1.6 + exp(-k1 * 48.0) * 0.18);
            acc += mix(uC, vec3(1.0, 0.7, 0.4), 0.4) * (exp(-k2 * 700.0) * 1.35 + exp(-k2 * 40.0) * 0.16);
            acc += mix(uA, uC, 0.5) * (exp(-k3 * 640.0) * 1.2 + exp(-k3 * 36.0) * 0.14);
            return acc;
          }

          void lightState(float id, out vec3 p, out vec3 col, out float fade) {
            float phase = hash(vec2(id * 17.3 + uSeed, 8.1));
            float life = fract(phase - uTime * (0.022 + id * 0.003));
            float fall = pow(life, 0.6);
            float r = mix(RS * 1.14, 24.0, fall);
            float omega = 0.7 + 3.6 * pow(3.05 / max(r, 1.2), 1.45);
            float phi = phase * 6.2831853 + id * 0.95 + uTime * omega;
            float inc = (hash(vec2(id, uSeed + 3.3)) - 0.5) * 1.35;
            p = vec3(cos(phi) * r, inc * (0.28 + 0.72 * fall), sin(phi) * r);
            float g = sqrt(max(0.05, 1.0 - RS / max(r, RS * 1.02)));
            fade = smoothstep(0.0, 0.09, life) * smoothstep(RS * 1.05, RS * 1.28, r) * g;
            vec3 warm = vec3(1.0, 0.8, 0.48);
            vec3 cool = vec3(0.62, 0.8, 1.0);
            col = mix(mix(uA, uC, fract(phase * 2.7)), mix(warm, cool, fract(phase * 4.1)), 0.58);
            col *= mix(0.55, 1.35, life);
          }

          float approach(vec3 a, vec3 b, vec3 L) {
            vec3 w = b - a;
            vec3 v = a - L;
            float t = clamp(-dot(v, w) / max(dot(w, w), 1e-5), 0.0, 1.0);
            vec3 d = a + w * t - L;
            return dot(d, d);
          }

          vec3 lightFromDist(float d2, vec3 col, float fade) {
            if (fade < 0.012) return vec3(0.0);
            return col * fade * (1.05 * exp(-d2 * 10.5) + 0.22 * exp(-d2 * 2.2) + 0.06 / (d2 + 0.05));
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

            vec3 lp0; vec3 lp1; vec3 lp2; vec3 lp3; vec3 lp4; vec3 lp5;
            vec3 lc0; vec3 lc1; vec3 lc2; vec3 lc3; vec3 lc4; vec3 lc5;
            float lf0; float lf1; float lf2; float lf3; float lf4; float lf5;
            lightState(0.0, lp0, lc0, lf0);
            lightState(1.0, lp1, lc1, lf1);
            lightState(2.0, lp2, lc2, lf2);
            lightState(3.0, lp3, lc3, lf3);
            lightState(4.0, lp4, lc4, lf4);
            lightState(5.0, lp5, lc5, lf5);

            vec3 diskCol = vec3(0.0);
            float diskA = 0.0;
            bool absorbed = false;
            int crossings = 0;
            float d0 = 80.0;
            float d1 = 80.0;
            float d2 = 80.0;
            float d3 = 80.0;
            float d4 = 80.0;
            float d5 = 80.0;

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

              if (r < 24.0) {
                d0 = min(d0, approach(pos, p1, lp0));
                d1 = min(d1, approach(pos, p1, lp1));
                d2 = min(d2, approach(pos, p1, lp2));
                d3 = min(d3, approach(pos, p1, lp3));
                d4 = min(d4, approach(pos, p1, lp4));
                d5 = min(d5, approach(pos, p1, lp5));
              }

              pos = p1;
              vel = v1;
            }

            vec3 lights = lightFromDist(d0, lc0, lf0);
            lights += lightFromDist(d1, lc1, lf1);
            lights += lightFromDist(d2, lc2, lf2);
            lights += lightFromDist(d3, lc3, lf3);
            lights += lightFromDist(d4, lc4, lf4);
            lights += lightFromDist(d5, lc5, lf5);

            float impact = sqrt(max(L2, 0.0));
            float caustic = 1.0 + 1.15 * exp(-pow((impact - 2.598) * 1.7, 2.0));

            float rad = length(uv);
            float ang = atan(uv.y, uv.x);
            float hole = smoothstep(0.154, 0.149, rad);
            float rim = smoothstep(0.154, 0.168, rad) * smoothstep(0.4, 0.188, rad);
            float edge = pow(clamp((0.36 - rad) / 0.2, 0.0, 1.0), 1.2);
            float spin = ang - uTime * mix(0.85, 4.4, edge);
            float flow = 0.48 + 0.52 * sin(spin * 6.0 + rad * 16.0);
            flow *= 0.6 + 0.4 * sin(spin * 3.0 - rad * 7.0);
            float clump = pow(0.5 + 0.5 * sin(ang * 2.0 - uTime * mix(0.5, 2.4, edge)), 2.4);
            vec3 glowCol = mix(mix(uA, uC, 0.35), vec3(1.0, 0.58, 0.16), 0.72);
            vec3 rimGlow = glowCol * rim * (0.2 + flow * 0.7 + clump * 0.4) * (0.95 + uEnergy * 0.12);

            vec3 col = vec3(0.0);
            if (!absorbed && hole < 0.001) col += sky(vel, uv);
            col += lights * caustic * (1.0 - hole);
            col += diskCol * (1.02 + uEnergy * 0.14) * (1.0 - hole);
            col += rimGlow * (1.0 - hole);
            col = mix(col, vec3(0.0), hole);

            float vig = smoothstep(1.45, 0.28, length(uv * vec2(0.82, 1.0)));
            gl_FragColor = vec4(col * vig, 1.0);
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
      sBass += (m.bass - sBass) * 0.04
      sMid += (m.mid - sMid) * 0.035
      sTreble += (m.treble - sTreble) * 0.035
      sEnergy += (m.energy - sEnergy) * 0.035
      material.uniforms.uTime.value = time
      material.uniforms.uBass.value = sBass
      material.uniforms.uMid.value = sMid
      material.uniforms.uTreble.value = sTreble
      material.uniforms.uEnergy.value = sEnergy
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

export function createTide(): VisualStyle {
  let group: THREE.Group | null = null
  let oceanMat: THREE.ShaderMaterial | null = null
  let moonMat: THREE.MeshBasicMaterial | null = null
  const uA = new THREE.Color()
  const uC = new THREE.Color()

  return {
    id: 'tide',
    label: 'Tide',
    hint: 'Bioluminescent night tide',
    bloom: { base: 0.2, pulse: 0.05 },
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

      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(0x03060d) },
          uHorizon: { value: new THREE.Color(0x0a1824) },
        },
        vertexShader: `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTop, uHorizon;
          varying float vH;
          void main() {
            float h = clamp(vH * 1.1 + 0.05, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, smoothstep(0.02, 0.72, h));
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
          uniform float uEnergy;
          uniform vec3 uA, uC, uMoon, uFogColor;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vCrest;
          varying float vDist;

          void main() {
            vec3 n = normalize(vNormal);
            vec3 view = normalize(cameraPosition - vWorld);
            vec3 moonDir = normalize(uMoon - vWorld);
            float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.2);
            float spec = pow(max(dot(n, normalize(moonDir + view)), 0.0), 42.0);
            float crest = smoothstep(0.42, 0.88, vCrest);
            vec3 bio = mix(vec3(0.06, 0.72, 0.68), mix(uA, uC, 0.5), 0.48);
            vec3 deep = vec3(0.012, 0.035, 0.05);
            vec3 col = mix(deep, bio, crest * (0.42 + uEnergy * 0.38));
            col += bio * pow(max(vCrest, 0.0), 3.4) * (0.18 + uEnergy * 0.16);
            col += vec3(0.7, 0.84, 1.0) * spec * 0.28;
            col += vec3(0.12, 0.2, 0.28) * fres * 0.35;
            float fog = smoothstep(34.0, 98.0, vDist);
            col = mix(col, uFogColor, fog);
            gl_FragColor = vec4(min(col, vec3(0.7)), 1.0);
          }
        `,
      })
      const ocean = new THREE.Mesh(oceanGeo, oceanMat)
      ocean.position.set(0, 0, -22)
      group.add(ocean)

      scene.add(group)
      colorFrom(palette.a, uA)
      colorFrom(palette.c, uC)
    },
    update(m, time, _dt, palette) {
      if (!oceanMat) return
      oceanMat.uniforms.uTime.value = time
      oceanMat.uniforms.uBass.value = m.bass
      oceanMat.uniforms.uEnergy.value = m.energy
      colorFrom(palette.a, oceanMat.uniforms.uA.value)
      colorFrom(palette.c, oceanMat.uniforms.uC.value)
      if (moonMat) moonMat.color.setRGB(0.9 + m.energy * 0.08, 0.93, 1)
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
      moonMat = null
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
  { id: 'void', label: 'Void', hint: 'Black hole singularity' },
  { id: 'tide', label: 'Tide', hint: 'Bioluminescent night tide' },
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
]

export function createAllStyles(): VisualStyle[] {
  return STYLE_FACTORIES.map((factory) => factory())
}
