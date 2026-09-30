import { useEffect, useRef } from 'react'
import { OFFICE_HTTP_ACTIONS_URL } from '@/config/officeMode'
import { OfficeActionHttpClient } from '@/services/officeActionHttp'

/** 轮询 HTTP 动作源，将外部动作同步到办公室场景 */
export function OfficeActionConnector() {
  const clientRef = useRef<OfficeActionHttpClient | null>(null)

  useEffect(() => {
    const client = new OfficeActionHttpClient()
    clientRef.current = client
    client.connect(OFFICE_HTTP_ACTIONS_URL)

    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [])

  return null
}
