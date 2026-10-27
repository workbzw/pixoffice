import { z } from 'zod'
import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { createDemoOfficeTeams } from './demoTeams.ts'
import type { DemoOfficeScenario, DemoOfficeTeam } from './demoTeams.ts'
import { ExampleOfficeDataSource } from './demoSource.ts'
import type { OfficeTeamCreator } from './officeDirectory.ts'
import { assertOfficeDirectory } from './officeDirectory.ts'
import { maxRelayTeams } from '@pixoffice/protocol/relay'
import { parseProtocolObject, stringifyProtocolObject } from '@pixoffice/protocol/schema'

export const demoOfficeStorageKey = 'pixoffice:classic:demo-offices:v1'
const officeName = z.string().trim().min(1).max(40)
const savedOffices = z.strictObject({
  version: z.literal(1),
  offices: z.array(z.strictObject({ id: z.string().regex(/^office-local-[a-zA-Z0-9-]+$/), name: officeName })),
})
type StoredOffice = z.infer<typeof savedOffices>['offices'][number]

function materialize(office: StoredOffice): DemoOfficeTeam {
  return { ...office, sceneLabel: '办公室', source: new ExampleOfficeDataSource(new Date(), { workspace: { ...office }, tasks: [] }) }
}

/** Local example directory; remote creation is injected by the application host. */
export class DemoOfficeDirectory {
  private teams: DemoOfficeTeam[]
  private readonly defaults: DemoOfficeTeam[]
  private saved: StoredOffice[] = []
  private storageError = false
  private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>
  private readonly scenario?: DemoOfficeScenario

  constructor(source: OfficeDataSource, storage?: Pick<Storage, 'getItem' | 'setItem'>, scenario?: DemoOfficeScenario) {
    if (source.kind !== 'example') throw new Error('真实数据模式不能创建本地示例办公室')
    this.storage = storage
    this.scenario = scenario
    this.defaults = scenario?.createTeams(source) ?? createDemoOfficeTeams(source)
    this.teams = [...this.defaults]
    try { this.applySaved(this.readSaved()) } catch { this.storageError = true }
  }

  list = (): readonly DemoOfficeTeam[] => this.teams

  private readSaved(): StoredOffice[] {
    const raw = this.storage?.getItem(demoOfficeStorageKey)
    const offices = this.storage ? raw ? savedOffices.parse(parseProtocolObject(raw)).offices : [] : this.saved
    assertOfficeDirectory([...this.defaults, ...offices])
    const names = new Set(this.defaults.map(team => team.name.toLocaleLowerCase()))
    for (const office of offices) {
      if (names.has(office.name.toLocaleLowerCase())) throw new Error('办公室存档重复')
      names.add(office.name.toLocaleLowerCase())
    }
    return offices
  }

  private applySaved(offices: StoredOffice[]) {
    const existing = new Map(this.teams.map(team => [team.id, team]))
    this.saved = offices
    this.teams = [...this.defaults, ...offices.map(office => {
      const team = existing.get(office.id)
      return team?.name === office.name ? team : this.scenario?.createOffice(office) ?? materialize(office)
    })]
  }

  create: OfficeTeamCreator = async input => {
    const parsed = officeName.safeParse(input.name)
    if (!parsed.success) throw new Error('办公室名称需要填写 1–40 个字符')
    const name = parsed.data
    const save = () => {
      if (this.storageError) throw new Error('本地办公室存档无法读取，未覆盖原存档')
      let latest: StoredOffice[]
      try { latest = this.readSaved() }
      catch { this.storageError = true; throw new Error('本地办公室存档无法读取，未覆盖原存档') }
      if (this.defaults.length + latest.length >= maxRelayTeams) throw new Error(`最多支持 ${maxRelayTeams} 个办公室`)
      if ([...this.defaults, ...latest].some(team => team.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('这个办公室名称已存在，请换一个名称')
      const office = { id: `office-local-${crypto.randomUUID()}`, name }
      const saved = [...latest, office]
      try { this.storage?.setItem(demoOfficeStorageKey, stringifyProtocolObject({ version: 1, offices: saved })) }
      catch { throw new Error('办公室保存失败，请检查浏览器存储空间后重试') }
      this.applySaved(saved)
      return this.teams.find(team => team.id === office.id)!
    }
    if (!this.storage || typeof window === 'undefined') return save()
    // Browser-local serialization only: no server lease or page ownership is involved.
    if (!navigator.locks) throw new Error('浏览器不支持安全的多标签保存，请使用支持 Web Locks 的浏览器及 HTTPS 或 localhost')
    return navigator.locks.request(demoOfficeStorageKey, save)
  }
}
