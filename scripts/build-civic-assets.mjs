import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildCivicPreview } from '../art/characters/police-uniform-v1/preview.mjs'
import { createAssetCatalog } from './assets/export-pack.mjs'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'public/civic-assets')
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-civic-assets-'))
try {
  const staging = path.join(temp, 'staging'), assets = path.join(temp, 'assets')
  await promisify(execFile)(process.execPath, ['art/characters/police-uniform-v1/import.mjs'], {
    cwd: root, env: { ...process.env, POLICE_STAGING_ROOT: staging }, maxBuffer: 4 * 1024 * 1024,
  })
  // This named preview never replaces approved office packs or writes review approvals.
  await buildCivicPreview(staging, path.join(assets, 'characters'))
  const files = (await readdir(assets, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => path.relative(assets, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort()
  const catalog = await createAssetCatalog(assets, 'civic-preview', files, {
    registry: 'characters/registry.json', audit: 'audit.json',
  })
  await writeFile(path.join(assets, 'asset-pack.json'), JSON.stringify(catalog, null, 2) + '\n')
  await mkdir(output, { recursive: true })
  await cp(assets, output, { recursive: true })
  const current = new Set([...files, 'asset-pack.json'])
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    const relative = path.relative(output, file).split(path.sep).join('/')
    if (!current.has(relative)) await rm(file)
  }
  console.log('Built civic preview assets (not approved character packs).')
} finally {
  await rm(temp, { recursive: true, force: true })
}
