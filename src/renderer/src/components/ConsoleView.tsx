import { useEffect, useRef } from 'react'
import { BRIDGE_CONSOLE_URL, BRIDGE_PARTITION } from '../../../shared/types'
import type { BridgeState } from '../../../shared/types'
import type { WebviewEl } from '../webviewRegistry'

export interface ConsoleApi {
  focusDispatch: () => void
}

// 桥调度台视图（fork 新增）：webview 只创建一次，切走时 display:none 隐藏，不卸载、不重载。
// 放行规则与证书钉扎都在主进程：will-attach-webview 对该 partition + 地址做精确匹配，
// 该 session 的证书校验只认桥自签证书的 SHA-256 指纹（见 main/index.ts）。
// 侧栏组件的数据来自调度台页发布的 window.__mbState：这里每 4 秒读一次，
// 变化时才上抛给 App（页面未登录或未加载完时读不到，侧栏组件保持隐藏）。
export function ConsoleView({
  visible,
  onState,
  apiRef
}: {
  visible: boolean
  onState: (s: BridgeState) => void
  apiRef: React.MutableRefObject<ConsoleApi | null>
}): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  const onStateRef = useRef(onState)
  onStateRef.current = onState

  useEffect(() => {
    if (!holder.current) return
    const wv = document.createElement('webview') as WebviewEl
    wv.setAttribute('partition', BRIDGE_PARTITION)
    wv.setAttribute('src', BRIDGE_CONSOLE_URL)
    wv.className = 'webview'
    holder.current.appendChild(wv)
    apiRef.current = {
      focusDispatch: () => {
        void wv
          .executeJavaScript('window.__mbFocusDispatch && window.__mbFocusDispatch()')
          .catch(() => {})
      }
    }
    let dead = false
    let lastJson = ''
    const poll = async (): Promise<void> => {
      if (dead) return
      try {
        const raw = await wv.executeJavaScript(
          'window.__mbState ? JSON.stringify(window.__mbState) : ""'
        )
        if (typeof raw === 'string' && raw && raw !== lastJson) {
          lastJson = raw
          onStateRef.current(JSON.parse(raw) as BridgeState)
        }
      } catch {
        /* webview 还没就绪，下一轮再试 */
      }
    }
    const timer = setInterval(() => void poll(), 4000)
    void poll()
    return () => {
      dead = true
      clearInterval(timer)
      if (apiRef.current?.focusDispatch) apiRef.current = null
      wv.remove()
    }
  }, [apiRef])
  return <div className="console-view" ref={holder} style={{ display: visible ? 'flex' : 'none' }} />
}
