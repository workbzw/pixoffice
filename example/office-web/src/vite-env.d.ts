/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PIXOFFICE_CHAT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {}
