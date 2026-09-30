import { cp, mkdir, open, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildCharacter, buildCharacters } from './build.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep)

export async function publishCharacterCandidate(directory, {
  sourceRoot = path.join(root, 'art/characters/packs'), outputRoot = path.join(root, 'public/characters'),
  backupRoot = path.join(root, '.character-backups'),
} = {}) {
  const candidate = await realpath(directory)
  await mkdir(sourceRoot, { recursive: true }); await mkdir(backupRoot, { recursive: true })
  sourceRoot = await realpath(sourceRoot); backupRoot = await realpath(backupRoot)
  if (within(candidate, sourceRoot) || within(sourceRoot, candidate)) throw new Error('Publish a staged candidate outside the active character library')
  if (within(backupRoot, sourceRoot)) throw new Error('Backups must stay outside the active character library')
  const lockPath = path.join(sourceRoot, '.publish.lock')
  const lock = await open(lockPath, 'wx')
  let temporary, destination, backup, installed = false
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
    await buildCharacters({ sourceRoot, outputRoot })
    return { id, digest: copied.admission.digest, destination, backup }
  } catch (error) {
    if (installed) await rm(destination, { recursive: true, force: true })
    if (backup) await rename(backup, destination)
    throw error
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true })
    await lock.close(); await rm(lockPath, { force: true })
  }
}
