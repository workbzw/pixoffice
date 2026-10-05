import { Assets, type Texture } from 'pixi.js'

let assetBase = '/assets/office'
let started = false
let schedule: <T>(job: () => Promise<T>) => Promise<T> = job => job()

export function configureOfficeAssets(options: { baseUrl: string; schedule?: typeof schedule }) {
  const next = options.baseUrl.replace(/\/$/, '')
  if (started && assetBase !== next) throw new Error('Configure office resources before loading')
  assetBase = next
  if (options.schedule) schedule = options.schedule
}

export function loadOfficeTexture(alias: string, name: string, background = false): Promise<Texture> {
  started = true
  if (!Assets.resolver.hasKey(alias)) Assets.add({ alias, src: `${assetBase}/${name}.webp` })
  const load = async () => {
    let texture: Texture
    try { texture = await Assets.load<Texture>(alias) }
    catch { texture = await Assets.load<Texture>(`${assetBase}/${name}.png`) }
    if (!texture?.source) throw new Error(`Invalid office texture: ${name}`)
    texture.source.scaleMode = 'linear'
    return texture
  }
  // The background must not wait behind sidebar character downloads.
  return background ? load() : schedule(load)
}
