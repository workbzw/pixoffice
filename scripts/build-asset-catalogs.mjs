import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAssetCatalog } from './assets/export-pack.mjs'
import { OFFICE_IMAGES } from './build-office-assets.mjs'
export async function buildAssetCatalogs(root = fileURLToPath(new URL('../public', import.meta.url))) {
  const out = path.join(root, 'asset-packs')
  await mkdir(out, { recursive: true })
  const publish = async (name, catalog) => writeFile(path.join(out, name + '.json'), JSON.stringify(catalog, null, 2) + '\n')
  const furniture = await createAssetCatalog(root, 'pixoffice.office.furniture', OFFICE_IMAGES.flatMap(name => ['webp', 'png'].map(extension => `assets/office/${name}.${extension}`)), { background: 'assets/office/office.webp' })
  await publish('office-furniture', furniture)
  const registry = JSON.parse(await readFile(path.join(root, 'characters/registry.json'), 'utf8'))
  const all = [...furniture.files.map(file => file.path), 'characters/registry.json']
  for (const character of registry.characters) {
    const manifest = 'characters/' + character.manifest
    const parsed = JSON.parse(await readFile(path.join(root, manifest), 'utf8'))
    const prefix = path.posix.dirname(manifest)
    const appearance = `characters/visuals/${character.id}.json`
    const files = [manifest, appearance, ...parsed.pages.map(page => `${prefix}/${page.image}`)]
    if (character.portrait) files.push(`${prefix}/${character.portrait.image}`)
    await publish(character.id, await createAssetCatalog(root, `pixoffice.character.${character.id}`, files, { appearance, manifest }))
    all.push(...files)
  }
  await publish('office-complete', await createAssetCatalog(root, 'pixoffice.office.complete', all, { registry: 'characters/registry.json' }))
  return registry.characters.length
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Asset catalogs built: furniture + ${await buildAssetCatalogs()} individual characters + office assembly`)
}
