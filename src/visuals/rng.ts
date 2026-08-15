export function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function styleRng(seed: number) {
  const next = mulberry32(seed || 1)
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    range: (a: number, b: number) => a + next() * (b - a),
    pick: <T,>(items: T[]) => items[Math.floor(next() * items.length)] as T,
  }
}
