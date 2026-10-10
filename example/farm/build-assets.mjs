import { readFile, readdir, mkdir, writeFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildCharacter } from '../../scripts/assets/build-character.mjs'
import { bindFarmFrames } from '@pixoffice/assets-farm'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
import { createAssetCatalog } from '../../scripts/assets/export-pack.mjs'
import { buildCrops } from './build-crops.mjs'
import { buildChickens } from './build-chickens.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = path.resolve(process.argv[2] ?? path.join(root, 'example/farm/public/farm-assets'))
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-farm-'))
try {
  const character = path.join(temp, 'farm-gardener'); await mkdir(character)
  const built = await buildCharacter(path.join(root, 'art/farm/character'))
  for (const [file, data] of built.outputs) await writeFile(path.join(character, file), data)
  await writeFile(path.join(character, 'visual.json'), JSON.stringify(visualAssetManifestSchema.parse(bindFarmFrames(built.manifest, `./${built.manifestFile}`)), null, 2) + '\n')
  await cp(path.join(character, built.portrait.image), path.join(character, 'portrait.webp'))
  await sharp(path.join(root, 'art/farm/originals/background.png')).resize(1400).webp({ quality: 88 }).toFile(path.join(temp, 'background.webp'))
  await sharp(path.join(root, 'art/farm/originals/plot-sign.png')).trim({ threshold: 10 }).resize(384).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(temp, 'plot-sign.webp'))
  await buildCrops(path.join(root, 'art/farm/originals'), temp)
  await buildChickens(path.join(root, 'art/farm/originals/chickens.png'), temp, path.join(root, 'art/farm/originals/chickens-motion-v2.png'))
  await cp(path.join(root, 'public/site/icon.png'), path.join(temp, 'pixoffice-logo.png'))
  await writeFile(path.join(temp, 'roster.json'), JSON.stringify([{ id: 'farm-gardener', manifest: 'farm-gardener/visual.json', portrait: 'farm-gardener/portrait.webp' }], null, 2) + '\n')
  await cp(path.join(root, 'LICENSE'), path.join(temp, 'LICENSE.txt'))
  await cp(path.join(root, 'art/farm/README.md'), path.join(temp, 'ASSET_PROVENANCE.md'))
  await cp(path.join(root, 'public/THIRD_PARTY_NOTICES.txt'), path.join(temp, 'THIRD_PARTY_NOTICES.txt'))
  const files = (await readdir(temp, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => path.relative(temp, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  const catalog = await createAssetCatalog(temp, 'farm', files, { background: 'background.webp', roster: 'roster.json', 'farm-gardener': 'farm-gardener/visual.json' })
  await writeFile(path.join(temp, 'asset-pack.json'), JSON.stringify(catalog, null, 2) + '\n')
  await mkdir(output, { recursive: true }); await cp(temp, output, { recursive: true })
  for (const file of await readdir(output)) if (/^(carrot|tomato|cabbage)-[0-3]\.webp$/.test(file)) await rm(path.join(output, file))
  console.log(`Farm assets ready: ${output}`)
} finally { await rm(temp, { recursive: true, force: true }) }
