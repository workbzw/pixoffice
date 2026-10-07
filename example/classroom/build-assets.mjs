import { readFile, readdir, mkdir, writeFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildCharacter, frameBuildProfile } from '../../scripts/assets/build-character.mjs'
import { bindClassroomFrames, classroomAppearanceIds } from '@pixoffice/assets-classroom'
import { visualAssetManifestSchema } from '@pixoffice/contracts'
import { createAssetCatalog } from '../../scripts/assets/export-pack.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = path.resolve(process.argv[2] ?? path.join(root, 'example/classroom/public/classroom-assets'))
const temp = await mkdtemp(path.join(tmpdir(), 'pixoffice-classroom-'))
const sourceIds = ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
try {
  const staging = path.join(temp, 'output'); await mkdir(staging)
  const roster = []
  for (const [index, id] of classroomAppearanceIds.entries()) {
    const sourceRoot = path.join(root, 'art/characters/packs', sourceIds[index])
    const original = JSON.parse(await readFile(path.join(sourceRoot, 'character.json'), 'utf8'))
    const clips = {}
    const include = name => {
      if (clips[name]) return
      const clip = original.clips[name]
      if (!clip) throw new Error(`Missing classroom frame: ${sourceIds[index]}/${name}`)
      clips[name] = clip
      if ('alias' in clip) include(clip.alias)
    }
    for (const action of ['idle', 'walk']) for (const view of ['front', 'back', 'left', 'right']) include(`${action}.${view}`)
    for (const name of ['sit.back', 'talk.seated-left', 'talk.seated-right', 'sit-down.back', 'stand-up.back', original.portrait]) include(name)
    for (const view of Object.values(original.mouth?.views ?? {})) { include(view.closed); include(view.speaking) }
    const { work: _work, ...common } = original
    void _work
    const source = { ...common, id, label: id, profile: 'classroom', clips }
    const directory = path.join(temp, id); await mkdir(directory)
    await writeFile(path.join(directory, 'character.json'), JSON.stringify(source))
    for (const file of new Set(Object.values(clips).flatMap(clip => clip.frames?.map(frame => frame.file) ?? []))) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true }); await cp(path.join(sourceRoot, file), path.join(directory, file))
    }
    const built = await buildCharacter(directory, { profile: { ...frameBuildProfile, startupClips: source => [source.portrait, 'idle.front', 'sit.back'] } })
    const target = path.join(staging, id); await mkdir(target)
    for (const [file, buffer] of built.outputs) await writeFile(path.join(target, file), buffer)
    const manifest = visualAssetManifestSchema.parse(bindClassroomFrames(built.manifest, `./${built.manifestFile}`))
    await writeFile(path.join(target, 'visual.json'), JSON.stringify(manifest, null, 2) + '\n')
    await cp(path.join(target, built.portrait.image), path.join(target, 'portrait.webp'))
    roster.push({ id, manifest: `${id}/visual.json`, portrait: `${id}/portrait.webp` })
    console.log(`Classroom: ${id}, ${Object.keys(clips).length} clips, no office work animations`)
  }
  for (const file of ['room', 'desk-v5', 'chair-solid-v2']) await sharp(path.join(root, 'art/classroom', `${file}.png`)).resize({ width: file === 'room' ? 1400 : 512, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(staging, `${file}.webp`))
  await writeFile(path.join(staging, 'roster.json'), JSON.stringify(roster, null, 2) + '\n')
  await cp(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE.txt'))
  await cp(path.join(root, 'art/classroom/README.md'), path.join(staging, 'ASSET_PROVENANCE.md'))
  await cp(path.join(root, 'public/THIRD_PARTY_NOTICES.txt'), path.join(staging, 'THIRD_PARTY_NOTICES.txt'))
  const files = (await readdir(staging, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => path.relative(staging, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  const catalog = await createAssetCatalog(staging, 'classroom', files, { roster: 'roster.json', background: 'room.webp', ...Object.fromEntries(roster.map(item => [item.id, item.manifest])) })
  await writeFile(path.join(staging, 'asset-pack.json'), JSON.stringify(catalog, null, 2) + '\n')
  await mkdir(output, { recursive: true })
  await cp(staging, output, { recursive: true })
  console.log(`Classroom assets ready: ${output}`)
} finally { await rm(temp, { recursive: true, force: true }) }
