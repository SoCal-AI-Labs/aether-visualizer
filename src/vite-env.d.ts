/// <reference types="vite/client" />

import type { AetherApi } from '../electron/preload'

declare global {
  interface Window {
    aether: AetherApi
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          partition?: string
          allowpopups?: boolean
          useragent?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
