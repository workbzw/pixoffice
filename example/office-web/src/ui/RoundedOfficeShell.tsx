import type { OfficeShellProps } from './OfficeShell.tsx'
import { MemberOfficeWorkspace } from './MemberOfficeShell.tsx'
import './RoundedOfficeShell.css'

export function RoundedOfficeShell(props: OfficeShellProps) {
  return <MemberOfficeWorkspace {...props} variant="rounded" />
}
