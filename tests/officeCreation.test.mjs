import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestServer } from './helpers/vite.mjs'

let server, DemoOfficeDirectory, demoOfficeStorageKey, ExampleOfficeDataSource, OfficeTeamHost, OfficeEmptyState, TeamOverviewDialog, TeamSwitcher, OfficeCreationForm
before(async () => {
  server = await createTestServer()
  ;({ DemoOfficeDirectory, demoOfficeStorageKey } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoOfficeDirectory.ts'))
  ;({ ExampleOfficeDataSource } = await server.ssrLoadModule('/example/office-web/src/dashboard/demoSource.ts'))
  ;({ OfficeTeamHost } = await server.ssrLoadModule('/example/office-web/src/application/OfficeTeamHost.ts'))
  ;({ OfficeEmptyState } = await server.ssrLoadModule('/example/office-web/src/ui/OfficeEmptyState.tsx'))
  ;({ TeamOverviewDialog } = await server.ssrLoadModule('/example/office-web/src/ui/team-switcher/TeamOverviewDialog.tsx'))
  ;({ TeamSwitcher } = await server.ssrLoadModule('/example/office-web/src/ui/TeamSwitcher.tsx'))
  ;({ OfficeCreationForm } = await server.ssrLoadModule('/example/office-web/src/ui/team-switcher/OfficeCreationForm.tsx'))
})
after(() => server?.close())

function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('stale directories merge new offices from the latest saved directory', async () => {
  const saved = storage(), a = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved), b = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  const [first, second] = await Promise.all([a.create({ name: 'Tab A' }), b.create({ name: 'Tab B' })])
  const restored = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  assert.deepEqual(restored.list().slice(3).map(team => team.id), [first.id, second.id])
  await assert.rejects(a.create({ name: 'Tab B' }), /已存在/)
  saved.setItem(demoOfficeStorageKey, '{broken')
  await assert.rejects(b.create({ name: 'Do not overwrite' }), /未覆盖/)
  assert.equal(saved.getItem(demoOfficeStorageKey), '{broken')
})

test('stale directories apply the office limit to the latest saved data', async () => {
  const saved = storage(), a = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved), b = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  while (a.list().length < 100) await a.create({ name: `Office ${a.list().length + 1}` })
  await assert.rejects(b.create({ name: 'Overflow from stale tab' }), /100/)
  assert.equal(new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved).list().length, 100)
})

test('created demo offices retain the fixed roster and have independent empty tasks', async () => {
  const directory = new DemoOfficeDirectory(new ExampleOfficeDataSource())
  const initial = directory.list()
  const snapshots = await Promise.all(initial.map(team => team.source.getSnapshot()))
  const team = await directory.create({ name: '  新的研发办公室  ' })
  assert.match(team.id, /^office-local-/)
  assert.equal(team.name, '新的研发办公室')
  assert.equal(directory.list().length, 4)
  for (const [index, existing] of initial.entries()) {
    assert.equal(directory.list()[index], existing)
    assert.deepEqual(await existing.source.getSnapshot(), snapshots[index])
  }
  const snapshot = await team.source.getSnapshot()
  assert.deepEqual(snapshot.workspace, { id: team.id, name: team.name })
  assert.equal(snapshot.employees.length, 6)
  assert.deepEqual(snapshot.tasks, [])
  assert.deepEqual(snapshot.events, [])
})

test('creation validates names and duplicates without changing the directory', async () => {
  const directory = new DemoOfficeDirectory(new ExampleOfficeDataSource())
  await assert.rejects(directory.create({ name: '  ' }), /名称/)
  await assert.rejects(directory.create({ name: '字'.repeat(41) }), /名称/)
  await assert.rejects(directory.create({ name: '内容运营团队' }), /已存在/)
  assert.equal(directory.list().length, 3)
  await directory.create({ name: 'Team Alpha' })
  await assert.rejects(directory.create({ name: ' team alpha ' }), /已存在/)
  assert.equal(directory.list().length, 4)
})

test('saved office definitions restore with stable identities and do not store rendering resources', async () => {
  const saved = storage()
  const directory = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  const team = await directory.create({ name: '保存的办公室' })
  const record = JSON.parse(saved.getItem(demoOfficeStorageKey))
  assert.deepEqual(record, { version: 1, offices: [{ id: team.id, name: team.name }] })
  const restored = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  assert.equal(restored.list().length, 4)
  assert.equal(restored.list()[3].id, team.id)
  assert.equal((await restored.list()[3].source.getSnapshot()).employees.length, 6)
})

test('storage failures are surfaced and never claim creation succeeded', async () => {
  const directory = new DemoOfficeDirectory(new ExampleOfficeDataSource(), {
    getItem: () => null, setItem: () => { throw new Error('quota') },
  })
  await assert.rejects(directory.create({ name: '不能保存的办公室' }), /保存失败/)
  assert.equal(directory.list().length, 3)
  let writes = 0
  const corrupt = new DemoOfficeDirectory(new ExampleOfficeDataSource(), {
    getItem: () => '{invalid', setItem: () => { writes++ },
  })
  await assert.rejects(corrupt.create({ name: '不能覆盖的办公室' }), /未覆盖/)
  assert.equal(writes, 0)
})

test('a remote data source cannot silently create a local example office', () => {
  assert.throws(() => new DemoOfficeDirectory({ kind: 'http' }), /真实数据/)
})

test('the directory refuses the 101st office without changing saved state', async () => {
  const saved = storage(), directory = new DemoOfficeDirectory(new ExampleOfficeDataSource(), saved)
  while (directory.list().length < 100) await directory.create({ name: `Office ${directory.list().length + 1}` })
  const before = saved.getItem(demoOfficeStorageKey)
  await assert.rejects(directory.create({ name: 'Office 101' }), /100/)
  assert.equal(directory.list().length, 100)
  assert.equal(saved.getItem(demoOfficeStorageKey), before)
})

test('adding a team starts only that session and preserves existing lifecycle', () => {
  const calls = []
  const session = id => ({ start: () => calls.push(`start:${id}`), stop: () => calls.push(`stop:${id}`) })
  const a = session('a'), b = session('b'), c = session('c')
  const host = new OfficeTeamHost()
  host.update([a, b])
  host.update([a, b, c])
  host.update([a, b, c])
  assert.deepEqual(calls, ['start:a', 'start:b', 'start:c'])
  host.update([a, c])
  assert.deepEqual(calls, ['start:a', 'start:b', 'start:c', 'stop:b'])
  host.stop(); host.stop()
  assert.deepEqual(calls, ['start:a', 'start:b', 'start:c', 'stop:b', 'stop:a', 'stop:c'])
  host.update([a, c])
  assert.deepEqual(calls.slice(-2), ['start:a', 'start:c'])
})

test('an empty scene exposes the plus creation entry without instantiating a canvas', () => {
  const html = renderToStaticMarkup(createElement(OfficeEmptyState, { create: async () => {} }))
  assert(html.includes('办公室空状态'))
  assert(html.includes('创建办公室'))
  assert(html.includes('lucide-plus'))
  assert(!html.includes('<canvas'))
  const unavailable = renderToStaticMarkup(createElement(OfficeEmptyState))
  assert(unavailable.includes('暂无办公室'))
  assert(!unavailable.includes('<button'))
})

test('the plus card follows existing offices and remains available for a single office', () => {
  const teams = [{ id: 'a', name: 'A', sceneLabel: '办公室' }]
  const selection = { teams, activeId: 'a', select() {}, create: async () => {} }
  const html = renderToStaticMarkup(createElement(TeamOverviewDialog, { id: 'dialog', selection, onClose() {} }))
  assert(html.indexOf('team-space-create') > html.indexOf('进入A'))
  assert(html.includes('team-space-create'))
  const trigger = renderToStaticMarkup(createElement(TeamSwitcher, { selection }))
  assert(trigger.includes('aria-expanded="false"'))
  assert(!trigger.includes('disabled=""'))
  const readOnly = renderToStaticMarkup(createElement(TeamOverviewDialog, { id: 'dialog', selection: { ...selection, create: undefined }, onClose() {} }))
  assert(!readOnly.includes('新建办公室'))
})

test('the heading exposes a permanent plus beside the title, including large directories', () => {
  const teams = Array.from({ length: 12 }, (_, index) => ({ id: `office-${index}`, name: `办公室 ${index + 1}`, sceneLabel: '办公室' }))
  const html = renderToStaticMarkup(createElement(TeamOverviewDialog, {
    id: 'large-directory', selection: { teams, activeId: teams[0].id, select() {}, create: async () => {} }, onClose() {},
  }))
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  assert(header.includes('团队空间'))
  assert(header.includes('class="team-picker-create"'))
  assert(header.includes('aria-label="新建办公室"'))
  assert(header.includes('title="新建办公室"'))
  assert(html.includes('team-space-create'))
  assert.equal((html.match(/aria-label="新建办公室"/g) ?? []).length, 2)
})

test('the creation form keeps fixed layout and appearance instead of exposing unimplemented choices', () => {
  const html = renderToStaticMarkup(createElement(OfficeCreationForm, { create: async () => {}, onCancel() {}, onCreated() {} }))
  assert(html.includes('办公室名称'))
  assert(html.includes('maxLength="40"'))
  assert(html.includes('标准办公室'))
  assert(html.includes('固定外观'))
  assert(!html.includes('<select'))
})
