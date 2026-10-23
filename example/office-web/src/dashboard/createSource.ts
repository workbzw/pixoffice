import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { CommerceOfficeDataSource } from './CommerceOfficeDataSource.ts'

export function createOfficeDataSource(): OfficeDataSource {
  return new CommerceOfficeDataSource('operations')
}
