import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { collectThirdPartyNotices, generateThirdPartyNotices } from '../scripts/third-party-notices.mjs'

async function fixture(t, dependencies) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pixoffice-licenses-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'public'))
  await writeFile(path.join(root, 'LICENSE'), 'PixOffice project license\n')
  const packages = { '': { name: 'fixture' } }
  for (const dependency of dependencies) {
    const directory = `node_modules/${dependency.name}`
    packages[directory] = { version: dependency.lockedVersion ?? dependency.version, dev: dependency.dev }
    const installed = path.join(root, directory)
    await mkdir(installed, { recursive: true })
    await writeFile(path.join(installed, 'package.json'), JSON.stringify(dependency))
    for (const [name, text] of Object.entries(dependency.files ?? {})) {
      await writeFile(path.join(installed, name), text)
    }
  }
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }))
  return root
}

test('notices include transitive production dependencies and all license/notice files, not dev tools', async t => {
  const root = await fixture(t, [
    { name: 'runtime', version: '1.0.0', license: 'MIT', files: { LICENSE: 'MIT text', NOTICE: 'Additional attribution' } },
    { name: 'runtime-dependency', version: '2.0.0', license: 'BSD-3-Clause', files: { 'LICENSE.txt': 'BSD text' } },
    { name: 'dev-tool', version: '1.0.0', license: 'unreviewed', dev: true },
  ])
  const first = await collectThirdPartyNotices(root)
  assert.deepEqual(first.packages.map(pkg => pkg.name), ['runtime', 'runtime-dependency'])
  assert(first.text.includes('Additional attribution'))
  assert(first.text.includes('BSD text'))
  assert(!first.text.includes('dev-tool'))
  assert.equal(first.text, (await collectThirdPartyNotices(root)).text)
  await generateThirdPartyNotices(root)
  assert.equal(await readFile(path.join(root, 'public/THIRD_PARTY_NOTICES.txt'), 'utf8'), first.text)
  assert.equal(await readFile(path.join(root, 'public/LICENSE.txt'), 'utf8'), 'PixOffice project license\n')
  await generateThirdPartyNotices(root, { check: true })
})

test('unreviewed or missing declared licenses stop generation', async t => {
  for (const license of ['GPL-3.0-only', undefined, '(MIT OR Apache-2.0)']) {
    const root = await fixture(t, [{ name: 'new-package', version: '1.0.0', license, files: { LICENSE: 'License text' } }])
    await assert.rejects(collectThirdPartyNotices(root), /Unreviewed license/)
  }
})

test('missing and empty license texts stop generation instead of inventing permission', async t => {
  for (const files of [{}, { LICENSE: '' }]) {
    const root = await fixture(t, [{ name: 'runtime', version: '1.0.0', license: 'MIT', files }])
    await assert.rejects(collectThirdPartyNotices(root), /Missing license text/)
  }
})

test('installed dependency versions must match the lockfile', async t => {
  const root = await fixture(t, [{ name: 'runtime', version: '2.0.0', lockedVersion: '1.0.0', license: 'MIT', files: { LICENSE: 'MIT text' } }])
  await assert.rejects(collectThirdPartyNotices(root), /Installed version differs from lockfile/)
})

test('legacy README licenses are preserved and their section boundaries are checked', async t => {
  const licenseText = 'License\n-------\n\nPort attribution\nFull PSF license text\n'
  const root = await fixture(t, [{ name: 'heap', version: '0.2.5', licenses: [{ type: 'PSF' }], files: { 'README.md': `Usage\n\n${licenseText}` } }])
  const { text } = await collectThirdPartyNotices(root)
  assert(text.includes(licenseText.trim()))
  assert(text.includes('Change summary:'))
  await writeFile(path.join(root, 'node_modules/heap/README.md'), 'Changed license heading')
  await assert.rejects(collectThirdPartyNotices(root), /License section changed/)
})

test('supplemental license sources cannot silently carry over to a new dependency version', async t => {
  const root = await fixture(t, [{ name: '@pixi/colord', version: '2.9.7', license: 'MIT' }])
  await assert.rejects(collectThirdPartyNotices(root), /Missing license text/)
})

test('checks reject stale third-party notices and stale project licenses', async t => {
  const root = await fixture(t, [{ name: 'runtime', version: '1.0.0', license: 'MIT', files: { LICENSE: 'MIT text' } }])
  await assert.rejects(generateThirdPartyNotices(root, { check: true }), /Outdated license notice/)
  await generateThirdPartyNotices(root)
  await writeFile(path.join(root, 'public/THIRD_PARTY_NOTICES.txt'), 'Old inventory')
  await assert.rejects(generateThirdPartyNotices(root, { check: true }), /THIRD_PARTY_NOTICES/)
  await generateThirdPartyNotices(root)
  await writeFile(path.join(root, 'LICENSE'), 'Updated project license')
  await assert.rejects(generateThirdPartyNotices(root, { check: true }), /LICENSE.txt/)
})

test('the real inventory preserves Lucide/Feather, legacy MIT/PSF and missing upstream license text', async () => {
  const { packages, text } = await collectThirdPartyNotices()
  for (const pkg of packages) assert(text.includes(`${pkg.name}@${pkg.version}`))
  const lucide = (await readFile(new URL('../node_modules/lucide-react/LICENSE', import.meta.url), 'utf8')).trim()
  assert(text.includes(lucide))
  assert(text.includes('Cole Bemis'))
  assert(text.includes('PSF LICENSE AGREEMENT FOR PYTHON 2.7.2'))
  assert(text.includes('2011-2012 Xueqiao Xu'))
  assert(text.includes('2020 Vlad Shilov'))
  await generateThirdPartyNotices(undefined, { check: true })
})
