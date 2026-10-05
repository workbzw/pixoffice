import type { OfficeDataSource } from './contract.ts'
import { ExampleOfficeDataSource } from './demoSource.ts'
import { HttpOfficeDataSource } from './httpSource.ts'

export function createOfficeDataSource(): OfficeDataSource {
  const url = import.meta.env.VITE_OFFICE_DASHBOARD_URL?.trim()
  return url ? new HttpOfficeDataSource(url) : new ExampleOfficeDataSource()
}
