import assert from 'node:assert/strict'
import { test } from 'node:test'
import { access, readFile } from 'node:fs/promises'

test('Docker excludes generated character and scene assets from its build context', async () => {
  const patterns = new Set((await readFile(new URL('../.dockerignore', import.meta.url), 'utf8')).split(/\r?\n/))
  for (const directory of ['public/characters', 'public/asset-packs', 'public/classroom-assets', 'public/farm-assets', 'public/civic-assets']) {
    assert(patterns.has(directory), directory)
  }
})

test('retired artwork drafts and their dedicated importers are absent while current source packs remain', async () => {
  for (const file of ['art/branding/pixoffice-v1', 'art/branding/pixoffice-v2', 'art/characters/office-lead',
    'art/characters/office-typing-v1', 'art/characters/office-typing-v2', 'art/characters/office-computer-work-v1',
    'art/characters/office-quiet-work-v3', 'art/farm/motion-v1', 'art/farm/originals/plots.png',
    'public/assets/characters/apartment', 'public/brand/pixoffice-mascot-v3.png', 'public/brand/pixoffice-wordmark-v3.png',
    'art/classroom/desk-v4.png', 'art/classroom/chair-solid-v1.png',
    'scripts/characters/bake-quiet-work.mjs', 'scripts/characters/register-computer-work.mjs',
    'scripts/characters/register-office-typing.mjs', 'scripts/characters/prepare-typing-reference.mjs']) {
    await assert.rejects(access(new URL('../' + file, import.meta.url)), { code: 'ENOENT' })
  }
  for (const file of ['art/characters/packs/office-lead/character.json', 'art/characters/office-lead-quiet-work-v2/registration.json',
    'art/characters/office-quiet-work-v4/registration.json', 'art/characters/office-motion-v2/registration.json',
    'art/classroom/desk-v5.png', 'art/classroom/chair-solid-v2.png', 'art/classroom/room.png',
    'art/farm/character/character.json', 'art/farm/originals/soil.png', 'public/brand/logo.png', 'public/brand/title.png']) {
    await access(new URL('../' + file, import.meta.url))
  }
})

test('superseded civic gait sources and duplicate previews are absent while active references remain', async () => {
  const root = 'art/characters/police-uniform-v1/'
  for (const id of ['file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    for (const suffix of ['sidewalk-v8', 'side-arms-v12']) {
      await assert.rejects(access(new URL(`../${root}sources/${id}-${suffix}.png`, import.meta.url)), { code: 'ENOENT' })
    }
    await access(new URL(`../${root}sources/${id}-sidewalk-v13.png`, import.meta.url))
    await access(new URL(`../${root}sources/${id}-gait-reference-v13.png`, import.meta.url))
  }
  for (const id of ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    await assert.rejects(access(new URL(`../${root}qa/${id}-walking.png`, import.meta.url)), { code: 'ENOENT' })
  }
  for (const file of ['qa/walking-contacts.png', 'qa/walking.webp']) {
    await assert.rejects(access(new URL(`../${root}${file}`, import.meta.url)), { code: 'ENOENT' })
  }
  for (const file of ['qa/walking-contact.png', 'qa/walking-directions.webp', 'qa/walking-template-comparison.webp', 'sidewalk-v13.json']) {
    await access(new URL(`../${root}${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('../public/favicon.svg', import.meta.url)), { code: 'ENOENT' })
})
