/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OFFICE_HTTP_ACTIONS_URL?: string
  readonly VITE_OFFICE_DISPATCH_MODE?: 'queue' | 'skip' | 'hybrid'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {}
