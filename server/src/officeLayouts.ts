import { defaultOfficeLayout, describeOfficeLayouts, officeLayoutIdSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeLayoutId, OfficeLayoutState } from '@pixoffice/protocol/office-integration'

/** Page presentation is shared by this service instance, independent of office business snapshots. */
export class OfficeLayouts {
  private state: OfficeLayoutState = { ...defaultOfficeLayout }
  read() { return { ...this.state } }
  describe() { return describeOfficeLayouts(this.state) }
  select(layoutId: OfficeLayoutId) {
    const currentLayoutId = officeLayoutIdSchema.parse(layoutId)
    if (currentLayoutId !== this.state.currentLayoutId) this.state = { currentLayoutId, revision: this.state.revision + 1 }
    return this.read()
  }
}
