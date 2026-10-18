import { createPixOfficeServer, defaultStaticRoot } from './app.ts'

const port = Number(process.env.PORT ?? 8765)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
const app = await createPixOfficeServer({
  apiKey: process.env.PIXOFFICE_API_KEY,
  publicOrigin: process.env.PIXOFFICE_PUBLIC_ORIGIN,
  staticRoot: process.env.PIXOFFICE_SERVE_STATIC === 'false' ? undefined : process.env.PIXOFFICE_STATIC_ROOT ?? defaultStaticRoot,
  logger: true,
})
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)) })
