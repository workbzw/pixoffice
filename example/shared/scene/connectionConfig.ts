export function sceneRelayUrl(): string | undefined {
  const config = (globalThis as typeof globalThis & { __PIXOFFICE_CONFIG__?: { relayUrl?: string } }).__PIXOFFICE_CONFIG__
  return config?.relayUrl || undefined
}
