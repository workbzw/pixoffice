import { readFile, mkdir, writeFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCharacter } from '../../scripts/assets/build-character.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
const sourceRoot = path.resolve(root, '../../art/characters/packs/marvis')
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-walker-'))
try {
  const original = JSON.parse(await readFile(path.join(sourceRoot, 'character.json'), 'utf8'))
  const clips = {}
  const include = name => {
    if (clips[name]) return
    const clip = original.clips[name]
    if (!clip) throw new Error(`Missing demo frame: ${name}`)
    clips[name] = clip
    if ('alias' in clip) include(clip.alias)
  }
  for (const action of ['idle', 'walk']) for (const view of ['front', 'back', 'left', 'right']) include(`${action}.${view}`)
  for (const view of Object.values(original.mouth.views)) { include(view.closed); include(view.speaking) }
  const { work: _work, ...common } = original
  void _work
  const source = { ...common, id: 'walker', label: '漫游者', profile: 'courtyard', clips }
  await writeFile(path.join(temp, 'character.json'), JSON.stringify(source))
  for (const file of new Set(Object.values(clips).flatMap(clip => clip.frames?.map(frame => frame.file) ?? []))) {
    await mkdir(path.dirname(path.join(temp, file)), { recursive: true })
    await cp(path.join(sourceRoot, file), path.join(temp, file))
  }
  const built = await buildCharacter(temp)
  const output = path.join(root, 'public/walker')
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  for (const [file, buffer] of built.outputs) await writeFile(path.join(output, file), buffer)
  const variants = ['idle', 'walk'].flatMap(action => ['front', 'back', 'left', 'right'].map(view => ({
    variantId: `${action}.${view}`, actionId: `core.${action}`, poseId: 'standing', view, channel: 'base',
    clockModes: action === 'walk' ? ['time', 'distance'] : ['time'],
  })))
  await writeFile(path.join(output, 'visual.json'), JSON.stringify({
    schemaVersion: 1, asset: { id: source.id, revision: built.manifest.revision }, adapterId: 'pixoffice.frame',
    adapterApiVersion: 1, rendererApiVersion: 'pixi-1', presentationProfileId: 'courtyard-v1',
    capabilities: { variants, combinations: variants.map(v => [v.variantId]), contactProfiles: [],
      sockets: [{ id: 'root.ground', policy: 'stable' }, { id: 'ui.label', policy: 'stable' }] },
    source: { format: 'pixoffice-frame-v1', uri: `./${built.manifestFile}`, bindings: Object.fromEntries(variants.map(v => [v.variantId, { clip: v.variantId }])) },
  }, null, 2) + '\n')
  console.log(`Independent assets: ${built.outputs.size + 1} files, idle/walk only`)
  await cp(path.resolve(root, '../../LICENSE'), path.join(root, 'public/LICENSE.txt'))
  await cp(path.resolve(root, '../../public/THIRD_PARTY_NOTICES.txt'), path.join(root, 'public/THIRD_PARTY_NOTICES.txt'))
} finally { await rm(temp, { recursive: true, force: true }) }
