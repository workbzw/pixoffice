import type { OfficeDataSource } from './contract'
import { ExampleOfficeDataSource } from './demoSource'
import { HttpOfficeDataSource } from './httpSource'

export function createOfficeDataSource(): OfficeDataSource {
  const url = import.meta.env.VITE_OFFICE_DASHBOARD_URL?.trim()
  return url ? new HttpOfficeDataSource(url) : new ExampleOfficeDataSource()
}
