import assert from 'node:assert/strict'
import { test } from 'node:test'
import { access } from 'node:fs/promises'

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
