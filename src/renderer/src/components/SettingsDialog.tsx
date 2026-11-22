import { useEffect, useState } from 'react'
import { BRIDGE_CERT_SHA256, BRIDGE_CONSOLE_URL, NAS_PAGES } from '../../../shared/types'
import type { BridgeState } from '../../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  bridge?: BridgeState | null
  dockBadge?: boolean
  onToggleDockBadge?: (v: boolean) => void
  onOpenConsole?: () => void
  onQuickDispatch?: () => void
  onOpenPage?: (id: string) => void
}

function relLabel(iso: string | null): string {
  if (!iso) return '未知'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (Number.isNaN(s)) return '未知'
  if (s < 90) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}

export function SettingsDialog({
  open,
  onClose,
  bridge,
  dockBadge,
  onToggleDockBadge,
  onOpenConsole,
  onQuickDispatch,
  onOpenPage
}: Props): React.JSX.Element | null {
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!open) return
    void window.panel.appVersion().then(setVersion)
  }, [open ])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">设置</span>
          <button className="settings-close" title="关闭" aria-label="关闭" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-label">当前版本</span>
          <span className="settings-value">v{version || '…'}</span>
        </div>

        <div className="settings-row">
          <span className="settings-label">更新方式</span>
          <span className="settings-value">不支持在线更新（未来接入 GitHub 仓库）</span>
        </div>

        <div className="settings-state">
          <div className="settings-row">
            <span className="settings-label">团队桥</span>
            <span className="settings-value">
              {bridge ? `在线 ${bridge.online}/${bridge.total} · 待验收 ${bridge.review} 件` : '未连接（先打开调度台登录）'}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">桥地址</span>
            <span className="settings-value">{BRIDGE_CONSOLE_URL}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">证书指纹</span>
            <span className="settings-value" title={BRIDGE_CERT_SHA256}>
              {BRIDGE_CERT_SHA256.slice(0, 23)}…
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">最近备份</span>
            <span className="settings-value">{bridge ? relLabel(bridge.backupTs) : '—'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">待验收角标</span>
            <span className="settings-value">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!dockBadge}
                  onChange={(e) => onToggleDockBadge?.(e.target.checked)}
                />
                在程序坞图标上显示待验收数
              </label>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="settings-btn" onClick={onOpenConsole}>
              打开调度台
            </button>
            <button className="settings-btn" onClick={onQuickDispatch}>
              快捷派活
            </button>
          </div>
          <div className="settings-state-text">
            成员管理与桥密钥在调度台内处理（成员增减在桥服务端配置，密钥更换在调度台右上角）。
          </div>
        </div>

        <div className="settings-state">
          <div className="settings-row">
            <span className="settings-label">NAS 智能体</span>
            <span className="settings-value">经 Tailscale 打开，Mac 需保持已连接</span>
          </div>
          {NAS_PAGES.map((p) => (
            <div className="settings-row" key={p.id}>
              <span className="settings-label">{p.name}</span>
              <span className="settings-value">{p.url.replace(/^http:\/\//, '')}</span>
              <button className="settings-btn" onClick={() => onOpenPage?.(p.id)}>
                打开
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
