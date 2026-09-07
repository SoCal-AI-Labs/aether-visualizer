import { useEffect, useMemo, useRef, useState } from 'react'
import { sharedAudio, type AudioSourceKind } from './audio/AudioEngine'
import { createPalette, randomSeed } from './visuals/palette'
import { VisualizerEngine } from './visuals/engine'
import { STYLE_CATALOG } from './visuals/styles'
import type { DesktopSource } from '../electron/preload'

const VISUAL_TUNE = 86

const PRESET_URLS = [
  { label: 'YouTube', url: 'https://www.youtube.com' },
  { label: 'SoundCloud', url: 'https://soundcloud.com' },
  { label: 'Spotify', url: 'https://open.spotify.com' },
]

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'https://www.youtube.com'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmed)}`
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<VisualizerEngine | null>(null)
  const audioRef = useRef(sharedAudio)
  const fileRef = useRef<HTMLInputElement>(null)
  const webviewRef = useRef<HTMLElement | null>(null)

  const [seed, setSeed] = useState(() => randomSeed())
  const [styleId, setStyleId] = useState('nebula')
  const [source, setSource] = useState<AudioSourceKind | null>(null)
  const [listening, setListening] = useState(false)
  const [sensitivity, setSensitivity] = useState(1.15)
  const [speed, setSpeed] = useState(1.35)
  const [hideUi, setHideUi] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browserUrl, setBrowserUrl] = useState('https://www.youtube.com')
  const [browserDraft, setBrowserDraft] = useState('https://www.youtube.com')
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([])
  const [selectedDesktop, setSelectedDesktop] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [browserWindows, setBrowserWindows] = useState<DesktopSource[]>([])
  const [showEmbeddedBrowser, setShowEmbeddedBrowser] = useState(false)
  const [showBrowserPanel, setShowBrowserPanel] = useState(false)

  const palette = useMemo(() => createPalette(seed), [seed])
  const styleIdRef = useRef(styleId)
  const sensitivityRef = useRef(sensitivity)
  const speedRef = useRef(speed)
  const ignoreStyleClickUntil = useRef(0)
  styleIdRef.current = styleId
  sensitivityRef.current = sensitivity
  speedRef.current = speed

  useEffect(() => {
    const host = stageRef.current
    if (!host) return
    const engine = new VisualizerEngine(host, seed, styleIdRef.current)
    engineRef.current = engine
    engine.pullMetrics = () => audioRef.current.update()
    engine.sensitivity = sensitivityRef.current
    engine.speed = speedRef.current
    engine.onFrame = (metrics, nextPalette) => {
      const root = document.documentElement
      root.style.setProperty('--energy', metrics.energy.toFixed(3))
      root.style.setProperty('--accent', nextPalette.hexA)
      root.style.setProperty('--accent-2', nextPalette.hexC)
    }
    engine.start()
    setStyleId(engine.styleId)
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [VISUAL_TUNE])

  useEffect(() => {
    engineRef.current?.setPalette(palette)
    document.documentElement.style.setProperty('--accent', palette.hexA)
    document.documentElement.style.setProperty('--accent-2', palette.hexC)
  }, [palette])

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.sensitivity = sensitivity
      engineRef.current.speed = speed
    }
  }, [sensitivity, speed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
        if (target.closest('label.slider, input, textarea, select')) return
      }
      if (event.key === 'h' || event.key === 'H' || event.key === 'Escape') {
        setHideUi((v) => (event.key === 'Escape' ? false : !v))
      }
      if (event.key === 'f' || event.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      }
      if (event.key === ' ') {
        event.preventDefault()
        randomize(true)
      }
      if (event.key === 'r' || event.key === 'R') reshuffle()
      const digit = event.code.match(/^(?:Digit|Numpad)([0-9])$/)
      if (digit) {
        const index = digit[1] === '0' ? 9 : Number(digit[1]) - 1
        const next = STYLE_CATALOG[index]
        if (next) applyStyle(next.id)
      }
      const extra = ['KeyQ', 'KeyW', 'KeyE'].indexOf(event.code)
      if (extra >= 0) {
        const next = STYLE_CATALOG[10 + extra]
        if (next) applyStyle(next.id)
      }
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (file && file.type.startsWith('audio/')) void startFile(file)
    }
    const onDrag = (event: DragEvent) => event.preventDefault()
    window.addEventListener('keydown', onKey)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDrag)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDrag)
    }
  }, [])

  const applyStyle = (id: string) => {
    if (performance.now() < ignoreStyleClickUntil.current) return
    engineRef.current?.setStyle(id)
    setStyleId(id)
    styleIdRef.current = id
    setShowHint(false)
  }

  const markSliderUse = () => {
    ignoreStyleClickUntil.current = performance.now() + 400
  }

  const reshuffle = () => {
    setSeed(randomSeed())
  }

  const randomize = (changeStyle = true) => {
    setSeed(randomSeed())
    if (changeStyle) {
      const id = engineRef.current?.randomStyle()
      if (id) setStyleId(id)
    }
  }

  const startSource = async (kind: AudioSourceKind, file?: File) => {
    setError(null)
    setShowHint(false)
    try {
      if (kind === 'microphone') {
        await audioRef.current.useMicrophone()
        setShowSources(false)
      } else if (kind === 'file') {
        if (!file) {
          fileRef.current?.click()
          return
        }
        await audioRef.current.useFile(file)
        setShowSources(false)
      } else if (kind === 'system' || kind === 'browser') {
        if (!window.aether) {
          throw new Error('Desktop audio capture needs the Aether window. Run npm run dev.')
        }
        await audioRef.current.useDisplayAudio()
        setShowSources(false)
      } else {
        throw new Error('Unknown audio source.')
      }
      setSource(kind)
      setListening(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start that audio source.'
      setError(message)
      setListening(false)
    }
  }

  const startFile = async (file: File) => {
    await startSource('file', file)
  }

  const openSystemPicker = async () => {
    setSource('system')
    setShowSources(true)
    setShowHint(false)
    try {
      const list = (await window.aether?.getSources()) ?? []
      setDesktopSources(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list desktop sources.')
    }
  }

  const chooseDesktop = async (id: string) => {
    setSelectedDesktop(id)
    await startSource('system')
  }

  const loadBrowserWindows = async () => {
    try {
      const listed = window.aether?.getBrowserWindows
        ? await window.aether.getBrowserWindows()
        : ((await window.aether?.getSources()) ?? []).filter((item) => !item.id.startsWith('screen:'))
      setBrowserWindows(listed)
      if (!window.aether) {
        setError('Use the Aether desktop window (not a browser tab) to hear Firefox.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list browser windows.')
    }
  }

  const openBrowserSource = async () => {
    setSource('browser')
    setShowBrowserPanel(true)
    setShowHint(false)
    setShowSources(false)
    await loadBrowserWindows()
  }

  const loadBrowser = (value: string) => {
    const url = normalizeUrl(value)
    setBrowserDraft(url)
    setBrowserUrl(url)
  }

  return (
    <div className="app">
      <div className="stage" ref={stageRef} />
      <div className="vignette" />

      {showHint && !listening && (
        <div className="hint">
          <h2>Aether</h2>
          <p>Pick an audio source, then click a style — or hit Randomize.</p>
        </div>
      )}

      {error && <div className="toast glass">{error}</div>}

      {hideUi && (
        <button className="chip glass show-ui" onClick={() => setHideUi(false)}>
          Show UI
        </button>
      )}

      <div className={`hud ${hideUi ? 'hidden' : ''}`}>
        <header className="topbar glass">
          <div className="brand">
            <h1>Aether</h1>
            <span>Audio visualizer</span>
          </div>
          <div className="sources">
            <button
              className={`chip ${source === 'microphone' ? 'active' : ''}`}
              onClick={() => void startSource('microphone')}
            >
              Microphone
            </button>
            <button
              className={`chip ${source === 'system' ? 'active' : ''}`}
              onClick={() => void openSystemPicker()}
            >
              System / App
            </button>
            <button
              className={`chip ${source === 'browser' ? 'active' : ''}`}
              onClick={() => void openBrowserSource()}
            >
              Web browser
            </button>
            <button
              className={`chip ${source === 'file' ? 'active' : ''}`}
              onClick={() => fileRef.current?.click()}
            >
              Audio file
            </button>
          </div>
          <div className="actions">
            <div className="meter" title="Energy">
              <i />
            </div>
            <button className="icon-btn" onClick={() => setHideUi(true)} title="Hide UI (H or Esc to show)">
              ▢
            </button>
          </div>
        </header>

        <div className="center-space">
          {source === 'browser' && showBrowserPanel && (
            <section className="browser-panel glass">
              <div className="browser-bar">
                <div className="brand">
                  <span>Desktop browsers</span>
                </div>
                <button className="chip" onClick={() => void loadBrowserWindows()}>
                  Refresh
                </button>
                <button className="chip active" onClick={() => void startSource('browser')}>
                  {listening && source === 'browser' ? 'Listening to desktop audio' : 'Listen to Firefox / Chrome'}
                </button>
                <button className="chip close-panel" onClick={() => setShowBrowserPanel(false)}>
                  Close
                </button>
              </div>
              <p className="browser-help">
                {window.aether
                  ? 'This hears whatever is playing on your PC — including Firefox. Play a tab, then click listen.'
                  : 'This is a browser tab and cannot hear Firefox. Switch to the Aether desktop window.'}
              </p>
              <div className="source-grid browser-grid">
                {browserWindows.length === 0 && (
                  <span className="browser-help">No Firefox/Chrome windows found. Open one and hit Refresh.</span>
                )}
                {browserWindows.map((item) => (
                  <button
                    key={item.id}
                    className="source-card"
                    onClick={() => void startSource('browser')}
                  >
                    <img src={item.thumbnail} alt="" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <div className="sources" style={{ padding: '8px 12px' }}>
                <button
                  className={`chip ${showEmbeddedBrowser ? 'active' : ''}`}
                  onClick={() => setShowEmbeddedBrowser((v) => !v)}
                >
                  Built-in browser
                </button>
              </div>
              {showEmbeddedBrowser && (
                <>
                  <div className="browser-bar">
                    <input
                      value={browserDraft}
                      onChange={(e) => setBrowserDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loadBrowser(browserDraft)
                      }}
                      placeholder="Paste a URL or search YouTube"
                    />
                    <button className="go-btn" onClick={() => loadBrowser(browserDraft)}>
                      Go
                    </button>
                  </div>
                  <div className="sources" style={{ padding: '0 12px 8px' }}>
                    {PRESET_URLS.map((preset) => (
                      <button
                        key={preset.url}
                        className="chip"
                        onClick={() => loadBrowser(preset.url)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="browser-frame">
                    <webview
                      ref={(node) => {
                        webviewRef.current = node
                      }}
                      src={browserUrl}
                      partition="persist:aether-browser"
                      allowpopups={true}
                    />
                  </div>
                </>
              )}
            </section>
          )}

          {showSources && source === 'system' && (
            <section className="source-sheet glass">
              <div className="brand">
                <span>Click a screen — this listens to all PC audio, including Firefox</span>
              </div>
              <div className="source-grid">
                {desktopSources.map((item) => (
                  <button
                    key={item.id}
                    className={`source-card ${selectedDesktop === item.id ? 'active' : ''}`}
                    onClick={() => void chooseDesktop(item.id)}
                  >
                    <img src={item.thumbnail} alt="" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="dock glass">
          <div className="styles">
            {STYLE_CATALOG.map((style) => (
              <button
                key={style.id}
                className={`style-btn ${styleId === style.id ? 'active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle(style.id)}
              >
                <b>{style.label}</b>
                <small>{style.hint}</small>
              </button>
            ))}
          </div>
          <div className="actions">
            <label className="slider">
              Sensitivity
              <input
                type="range"
                min="0.4"
                max="2.4"
                step="0.05"
                value={sensitivity}
                onPointerDown={markSliderUse}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  markSliderUse()
                  setSensitivity(Number(e.target.value))
                }}
              />
            </label>
            <label className="slider">
              Speed
              <input
                type="range"
                min="0.25"
                max="2.5"
                step="0.05"
                value={speed}
                onPointerDown={markSliderUse}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  markSliderUse()
                  setSpeed(Number(e.target.value))
                }}
              />
            </label>
            <button className="chip" onClick={reshuffle}>
              Reshuffle colors
            </button>
            <button className="random-btn" onClick={() => randomize(true)}>
              Randomize
            </button>
          </div>
        </footer>
      </div>

      <p className="help" style={{ position: 'absolute', left: 22, bottom: 8, pointerEvents: 'none' }}>
        Space randomize · R reshuffle · 1–9 / 0 / Q W E styles · H hide UI · F fullscreen · drop an audio file
      </p>

      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void startFile(file)
        }}
      />
    </div>
  )
}
