import { officeIntegrationPaths, officeLayoutInfoSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeLayoutId, OfficeLayoutState } from '@pixoffice/protocol/office-integration'
import { responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'

export async function requestOfficeLayout(baseUrl: string, layoutId: OfficeLayoutId): Promise<OfficeLayoutState> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${officeIntegrationPaths.layout}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: stringifyProtocolObject({ type: 'office.layout.set', layoutId }), signal: AbortSignal.timeout(10000) })
  const result = responseEnvelopeSchema.parse(await response.json())
  if (result.code !== response.status) throw new Error('布局响应格式错误')
  if (!response.ok) throw new Error(`${result.msg}（${result.data.reasonCode ?? response.status}）`)
  const { currentLayoutId, revision } = officeLayoutInfoSchema.parse(result.data)
  return { currentLayoutId, revision }
}
