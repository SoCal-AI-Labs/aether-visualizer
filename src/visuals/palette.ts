export type Palette = {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
  hexA: string
  hexB: string
  hexC: string
  seed: number
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100
  const lig = l / 100
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return [f(0), f(8), f(4)]
}

function rgbToHex([r, g, b]: [number, number, number]) {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [(h * 60 + 360) % 360, s * 100, l * 100]
}

export function evolvePalette(
  base: Palette,
  audio: { bass: number; mid: number; treble: number; energy: number },
  time: number,
  speed = 1,
): Palette {
  const shift = time * 22 * speed + audio.bass * 55 + audio.mid * 32 + audio.treble * 18
  const satBoost = 8 + audio.energy * 18
  const lightPulse = audio.bass * 8 - audio.treble * 3
  const rotate = (rgb: [number, number, number], extra: number) => {
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])
    return hslToRgb(
      (h + shift + extra) % 360,
      Math.min(96, s + satBoost),
      Math.min(72, Math.max(28, l + lightPulse)),
    )
  }
  const a = rotate(base.a, 0)
  const b = rotate(base.b, 28)
  const c = rotate(base.c, 140)
  return {
    a,
    b,
    c,
    hexA: rgbToHex(a),
    hexB: rgbToHex(b),
    hexC: rgbToHex(c),
    seed: base.seed,
  }
}

export function createPalette(seed: number): Palette {
  const rand = mulberry32(seed || 1)
  const hue = rand() * 360
  const spread = 28 + rand() * 52
  const accent = (hue + 160 + rand() * 80) % 360
  const sat = 72 + rand() * 22
  const a = hslToRgb(hue, sat, 58 + rand() * 10)
  const b = hslToRgb((hue + spread) % 360, sat - 8, 52 + rand() * 12)
  const c = hslToRgb(accent, 80 + rand() * 15, 64)
  return {
    a,
    b,
    c,
    hexA: rgbToHex(a),
    hexB: rgbToHex(b),
    hexC: rgbToHex(c),
    seed,
  }
}
