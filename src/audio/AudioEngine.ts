export type AudioSourceKind = 'microphone' | 'system' | 'browser' | 'file'

export type AudioMetrics = {
  bass: number
  mid: number
  treble: number
  energy: number
  beat: boolean
  spectrum: Float32Array
  waveform: Float32Array
}

const SPECTRUM_BINS = 64
const WAVE_BINS = 128

export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: AudioNode | null = null
  private stream: MediaStream | null = null
  private audioEl: HTMLAudioElement | null = null
  private videoEl: HTMLVideoElement | null = null
  private freq = new Uint8Array(0)
  private wave = new Uint8Array(0)
  private energyHistory: number[] = []
  private lastBeat = 0
  private fileUrl: string | null = null

  readonly metrics: AudioMetrics = {
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    beat: false,
    spectrum: new Float32Array(SPECTRUM_BINS),
    waveform: new Float32Array(WAVE_BINS),
  }

  get context() {
    return this.ctx
  }

  private ensureGraph() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
      this.analyser = null
    }
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.62
      this.analyser.minDecibels = -92
      this.analyser.maxDecibels = -18
      this.freq = new Uint8Array(this.analyser.frequencyBinCount)
      this.wave = new Uint8Array(this.analyser.fftSize)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return { ctx: this.ctx, analyser: this.analyser }
  }

  private disconnectSource() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch {
        // already disconnected
      }
      this.sourceNode = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.src = ''
      this.audioEl = null
    }
    if (this.videoEl) {
      this.videoEl.pause()
      this.videoEl.srcObject = null
      this.videoEl.remove()
      this.videoEl = null
    }
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl)
      this.fileUrl = null
    }
  }

  async useMicrophone() {
    this.disconnectSource()
    const { ctx, analyser } = this.ensureGraph()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    this.stream = stream
    this.sourceNode = ctx.createMediaStreamSource(stream)
    this.sourceNode.connect(analyser)
  }

  private async captureLegacyDesktop() {
    const sources = await window.aether?.getSources()
    const screen = sources?.find((source) => source.id.startsWith('screen:')) ?? sources?.[0]
    if (!screen) {
      throw new Error('No screen source available for desktop audio.')
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screen.id,
        },
      },
    } as MediaStreamConstraints)
  }

  private attachCaptureStream(stream: MediaStream) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = stream
    video.setAttribute('aria-hidden', 'true')
    Object.assign(video.style, {
      position: 'fixed',
      width: '2px',
      height: '2px',
      opacity: '0',
      pointerEvents: 'none',
      left: '0',
      bottom: '0',
    })
    document.body.appendChild(video)
    this.videoEl = video
    void video.play().catch(() => undefined)
  }

  async useDisplayAudio() {
    this.disconnectSource()
    const { ctx, analyser } = this.ensureGraph()

    try {
      await window.aether?.enableLoopbackAudio?.()
    } catch {
      // Handler is also installed at app startup.
    }

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      })
    } catch {
      stream = null
    }

    if (!stream || stream.getAudioTracks().length === 0) {
      stream?.getTracks().forEach((track) => track.stop())
      stream = await this.captureLegacyDesktop()
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error(
        'No system audio track. Play something in Firefox on your default speakers/headphones, then try again.',
      )
    }

    this.attachCaptureStream(stream)
    this.stream = stream
    this.sourceNode = ctx.createMediaStreamSource(new MediaStream(audioTracks))
    this.sourceNode.connect(analyser)
  }

  async useFile(file: File) {
    this.disconnectSource()
    const { ctx, analyser } = this.ensureGraph()
    const url = URL.createObjectURL(file)
    this.fileUrl = url
    const el = new Audio()
    el.src = url
    el.loop = true
    el.crossOrigin = 'anonymous'
    await el.play()
    this.audioEl = el
    this.sourceNode = ctx.createMediaElementSource(el)
    this.sourceNode.connect(analyser)
    analyser.connect(ctx.destination)
  }

  stop() {
    this.disconnectSource()
    if (this.analyser && this.ctx) {
      try {
        this.analyser.disconnect()
      } catch {
        // ignore
      }
    }
  }

  update(sensitivity = 1) {
    const analyser = this.analyser
    if (!analyser) return this.metrics

    analyser.smoothingTimeConstant = 0.62
    analyser.getByteFrequencyData(this.freq)
    analyser.getByteTimeDomainData(this.wave)

    const count = this.freq.length
    const bassEnd = Math.max(2, Math.floor(count * 0.08))
    const midEnd = Math.max(bassEnd + 1, Math.floor(count * 0.4))

    const avg = (start: number, end: number) => {
      let sum = 0
      for (let i = start; i < end; i++) sum += this.freq[i]
      return sum / Math.max(1, end - start) / 255
    }

    let rms = 0
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128
      rms += v * v
    }
    rms = Math.sqrt(rms / this.wave.length)

    const boost = (n: number) => Math.pow(Math.max(0, n), 0.88)

    const bass = boost(avg(0, bassEnd))
    const mid = boost(avg(bassEnd, midEnd))
    const treble = boost(avg(midEnd, count))
    const energy = boost(Math.max(rms * 2.2, (bass + mid + treble) / 3))

    this.energyHistory.push(energy)
    if (this.energyHistory.length > 48) this.energyHistory.shift()
    const mean = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length
    const now = performance.now()
    const beat =
      energy > mean * 1.38 && energy > 0.16 && now - this.lastBeat > 170
    if (beat) this.lastBeat = now

    const spec = this.metrics.spectrum
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const start = Math.floor((i / SPECTRUM_BINS) * count)
      const end = Math.floor(((i + 1) / SPECTRUM_BINS) * count)
      spec[i] += (boost(avg(start, end)) - spec[i]) * 0.35
    }

    const wave = this.metrics.waveform
    const step = this.wave.length / WAVE_BINS
    for (let i = 0; i < WAVE_BINS; i++) {
      wave[i] = (this.wave[Math.floor(i * step)] - 128) / 128
    }

    this.metrics.bass = bass
    this.metrics.mid = mid
    this.metrics.treble = treble
    this.metrics.energy = energy
    this.metrics.beat = beat
    return this.metrics
  }

  dispose() {
    this.stop()
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
    this.analyser = null
  }
}

export const sharedAudio = new AudioEngine()
