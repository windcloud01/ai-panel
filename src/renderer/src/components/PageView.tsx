import { useEffect, useRef } from 'react'
import type { NasPage } from '../../../shared/types'
import type { WebviewEl } from '../webviewRegistry'

// NAS 智能体页视图（fork 新增）：与桥调度台同一套嵌入机制——webview 创建
// 一次、切走时 display:none 不卸载。放行与导航锁定在主进程按 partition +
// origin 精确匹配（见 main/index.ts）。页面第一次被打开时才挂载，之后常驻
// 保活（页面自身的会话/实时连接不中断），代价是每页一个 Chromium 进程。
export function PageView({ page, visible }: { page: NasPage; visible: boolean }): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!holder.current) return
    const wv = document.createElement('webview') as WebviewEl
    wv.setAttribute('partition', page.partition)
    wv.setAttribute('src', page.url)
    wv.className = 'webview'
    holder.current.appendChild(wv)
    return () => {
      wv.remove()
    }
  }, [page])
  return <div className="console-view" ref={holder} style={{ display: visible ? 'flex' : 'none' }} />
}
