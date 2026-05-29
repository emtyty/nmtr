/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURN_SERVER_URI?: string
  readonly VITE_TURN_SERVER_USER?: string
  readonly VITE_TURN_SERVER_PASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
