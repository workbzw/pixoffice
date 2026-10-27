import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readAssetCatalogFiles } from './export-pack.mjs'

const shared = ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt', 'pixoffice-config.js']
const branding = ['brand/logo.png', 'brand/title.png', 'site/icon.png', 'site/wordmark.webp',
  'site/office-scene.webp', 'site/office-preview.webp', 'site/classroom-preview.webp', 'site/farm-preview.webp', 'site/civic-preview.webp']

/** Publish current catalog entries, never the contents of an old generated directory. */
export async function collectReleaseAssets(directory, product = 'website') {
  if (!['website', 'office', 'classroom', 'farm'].includes(product)) throw new Error(`Unknown release product: ${product}`)
  const root = await realpath(directory), files = new Map()
  const add = async file => {
    const target = await realpath(path.join(root, file))
    if (!target.startsWith(root + path.sep)) throw new Error(`Asset escapes root: ${file}`)
    files.set(file, await readFile(target))
  }
  const catalog = async (file, prefix = '') => {
    await add(file)
    const entries = await readAssetCatalogFiles(path.join(root, prefix), JSON.parse(files.get(file)))
    for (const [name, buffer] of entries) files.set(path.posix.join(prefix, name), buffer)
    return entries
  }
  for (const file of product === 'website' || product === 'office' ? shared : ['pixoffice-config.js']) await add(file)
  if (product === 'website' || product === 'office') {
    for (const file of branding) await add(file)
    const office = await catalog('asset-packs/office-complete.json')
    await catalog('asset-packs/office-furniture.json')
    const registry = JSON.parse(office.get('characters/registry.json'))
    for (const character of registry.characters) await catalog(`asset-packs/${character.id}.json`)
  }
  for (const scene of product === 'website' ? ['classroom', 'farm'] : ['classroom', 'farm'].filter(scene => scene === product)) {
    await catalog(`${scene}-assets/asset-pack.json`, `${scene}-assets`)
  }
  if (product === 'website') {
    await add('site/customization-contact.jpg')
    await catalog('civic-assets/asset-pack.json', 'civic-assets')
  }
  return files
}

export function releaseAssetsPlugin(product = 'website') {
  let publicDir
  return {
    name: 'current-release-assets', apply: 'build',
    config: () => ({ build: { copyPublicDir: false } }),
    configResolved(config) { publicDir = config.publicDir },
    async generateBundle() {
      for (const [fileName, source] of await collectReleaseAssets(publicDir, product)) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
