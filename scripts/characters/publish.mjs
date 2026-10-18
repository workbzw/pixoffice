import { cp, mkdir, mkdtemp, open, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildCharacter, buildCharacters } from './build.mjs'
import { buildOfficeAssets, OFFICE_IMAGES } from '../build-office-assets.mjs'
import { buildVisualManifests } from '../build-visual-manifests.mjs'
import { buildAssetCatalogs } from '../build-asset-catalogs.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep)

export async function publishCharacterCandidate(directory, {
  sourceRoot = path.join(root, 'art/characters/packs'), publicRoot = path.join(root, 'public'),
  backupRoot = path.join(root, '.character-backups'),
} = {}) {
  const candidate = await realpath(directory)
  await mkdir(sourceRoot, { recursive: true }); await mkdir(backupRoot, { recursive: true })
  sourceRoot = await realpath(sourceRoot); backupRoot = await realpath(backupRoot)
  if (within(candidate, sourceRoot) || within(sourceRoot, candidate)) throw new Error('Publish a staged candidate outside the active character library')
  if (within(backupRoot, sourceRoot)) throw new Error('Backups must stay outside the active character library')
  const lockPath = path.join(sourceRoot, '.publish.lock')
  const lock = await open(lockPath, 'wx')
  let temporary, destination, backup, releaseRoot, installed = false
  const replaced = []
  try {
    const built = await buildCharacter(candidate, { requireAdmission: true })
    if (built.admission.status !== 'approved') throw new Error('Legacy compatibility is not approval to publish a candidate')
    const id = built.source.id
    destination = path.join(sourceRoot, id)
    temporary = path.join(sourceRoot, `.${id}-candidate-${randomUUID()}`)
    await cp(candidate, temporary, { recursive: true, errorOnExist: true, force: false })
    // Validate the copied bytes again, before replacing any active files.
    const copied = await buildCharacter(temporary, { requireAdmission: true })
    if (copied.admission.digest !== built.admission.digest) throw new Error('Candidate changed during publication')
    try {
      await stat(destination)
      const nextBackup = path.join(backupRoot, `${id}-${randomUUID()}`)
      await rename(destination, nextBackup)
      backup = nextBackup
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    await rename(temporary, destination); installed = true
    await mkdir(publicRoot, { recursive: true })
    releaseRoot = await mkdtemp(path.join(publicRoot, '.character-publish-'))
    const furnitureRoot = path.join(publicRoot, 'assets/office')
    await buildOfficeAssets(furnitureRoot)
    for (const image of OFFICE_IMAGES) for (const extension of ['png', 'webp']) {
      const name = `assets/office/${image}.${extension}`
      await mkdir(path.dirname(path.join(releaseRoot, name)), { recursive: true })
      await cp(path.join(publicRoot, name), path.join(releaseRoot, name))
    }
    await buildCharacters({ sourceRoot, outputRoot: path.join(releaseRoot, 'characters') })
    await buildVisualManifests(path.join(releaseRoot, 'characters'))
    await buildAssetCatalogs(releaseRoot)
    // Build and validate every dependent file before exposing the new registry or catalogs.
    for (const name of ['characters', 'asset-packs']) {
      const target = path.join(publicRoot, name), previous = path.join(releaseRoot, `previous-${name}`)
      let hadPrevious = false
      try { await rename(target, previous); hadPrevious = true } catch (error) { if (error.code !== 'ENOENT') throw error }
      replaced.push({ target, previous, hadPrevious })
      await rename(path.join(releaseRoot, name), target)
    }
    return { id, digest: copied.admission.digest, destination, backup }
  } catch (error) {
    for (const { target, previous, hadPrevious } of replaced.reverse()) {
      await rm(target, { recursive: true, force: true })
      if (hadPrevious) await rename(previous, target)
    }
    if (installed) await rm(destination, { recursive: true, force: true })
    if (backup) await rename(backup, destination)
    throw error
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true })
    if (releaseRoot) await rm(releaseRoot, { recursive: true, force: true })
    await lock.close(); await rm(lockPath, { force: true })
  }
}
