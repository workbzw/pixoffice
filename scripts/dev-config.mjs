export function createDevEnvironment(env) {
  const port = Number(env.PORT ?? 8765)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  const host = env.HOST ?? '127.0.0.1'
  const connectHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
  const address = connectHost.includes(':') ? `[${connectHost}]` : connectHost
  return {
    server: { ...env, PORT: String(port), HOST: host, PIXOFFICE_SERVE_STATIC: 'false' },
    vite: { ...env, PIXOFFICE_INTERNAL_API_URL: `http://${address}:${port}` },
  }
}
