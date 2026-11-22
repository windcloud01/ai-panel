// 主进程、preload、渲染层共用的类型与默认配置。

// ---- 桥调度台（fork 新增）----
// 调度台是桥服务自带的网页，独立 partition、证书指纹钉扎（见 main/index.ts）。
// 使用前必须把下面三个常量改成你自己的桥地址与证书指纹（占位值无法连接任何真实桥）。
export const BRIDGE_HOST = 'bridge.example.com'
export const BRIDGE_CONSOLE_URL = 'https://bridge.example.com:8731/'
export const BRIDGE_PARTITION = 'persist:bridge-console'
// 桥自签证书的 SHA-256 指纹（DER，冒号分隔大写）。桥换证书时必须同步改这里并重新构建。
export const BRIDGE_CERT_SHA256 = '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00'

// ---- NAS 智能体页（fork 新增）----
// NAS 上其他 agent 的 Web 页，以独立 webview 纳入应用：每个页面一个固定
// partition（登录态各自持久化），地址在下表中配置（示例为 Tailscale 地址，
// 在家走局域网直连、出门经 tailnet 均可达）。主进程按 partition + origin
// 精确放行并锁定导航（见 main/index.ts），页面自身的多路径跳转不受影响。
// 注意：三页均为明文 HTTP，切勿给这些端口做公网转发。
export interface NasPage {
  id: string
  name: string
  url: string
  partition: string
}

export const NAS_PAGES: NasPage[] = [
  { id: 'dsh', name: 'DeepSeek 团队', url: 'http://your-nas.local:3088/', partition: 'persist:nas-dsh' },
  { id: 'openclaw', name: 'OpenClaw', url: 'http://your-nas.local:18789/', partition: 'persist:nas-openclaw' },
  { id: 'hermes', name: 'Hermes', url: 'http://your-nas.local:9119/', partition: 'persist:nas-hermes' }
]

export function nasPageByPartition(partition: string): NasPage | undefined {
  return NAS_PAGES.find((p) => p.partition === partition)
}

export function nasPageOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

// 桥调度台页通过 window.__mbState 发布的运行时快照（ConsoleView 轮询读取，喂侧栏组件）
export interface BridgeMemberState {
  id: string
  name: string
  role: string
  pct: number | null
  online: boolean
  external?: boolean // 外部成员（ds-team / hermes）：不出现在侧栏额度列表
}

export interface NasAgentState {
  id: string
  name: string
  up: boolean
  status?: string
  version?: string
}

export interface BridgeState {
  ok: boolean
  review: number // 待验收任务数
  open: number // 在办任务数
  online: number
  total: number
  members: BridgeMemberState[]
  backupTs: string | null
  authFail24h: number | null
  rateBlocks24h: number | null
  nasAgents?: NasAgentState[] | null // NAS 其他智能体健康（桥聚合，B 档状态层）
}

export interface Usage {
  weeklyPercent: number | null // 每周额度已用 %
  extraPercent: number | null // 额外额度已用 %
  resetText: string | null // "10月17日"
  extraText: string | null // 额外额度剩余，如 "20 亿个词元"
  raw: string | null
  updatedAt: number | null
  error?: string | null
}

export interface Account {
  id: string
  name: string
  remark: string
  sleeping?: boolean // 手动休眠：不创建 webview
  usage: Usage
  manualUsage: string // 手填兜底
  resetTime?: string // 手填的重置时刻 "HH:MM"（页面上抓不到时间，只抓得到日期）
}

export interface Tab {
  id: string
  name: string
  color?: string // 组名左侧竖条的颜色，创建时分配，排序不变
  accountIds: string[] // 顺序即列顺序
}

export interface LayoutRule {
  selector: string
  action: 'hide' | 'style'
  css?: string
  note?: string
}

export interface Rules {
  chat: {
    input: string
    sendButton: string
    stopButton: string // 出现即视为"生成中"
    assistantMessage: string
    userMessage: string
    mainChatPath: string // 主要聊天的 pathname
  }
  status: {
    panel: string
    connectedPattern: string
    activityTimePattern: string
  }
  usage: {
    // 打开设置：先发 ⌘,（与页面布局无关），不行再点按钮 → 菜单项
    openMenuButton: string // "设置" 按钮（宽屏在左侧 dock，窄屏在右下角）
    menuItemText: string // 菜单里的 "设置"
    sectionTitle: string // "使用情况"
    progressBar: string // 进度条，第 1 个是每周额度，第 2 个是额外额度
    intervalMin: number
  }
  layout: LayoutRule[]
  perf: {
    pauseLoopingVideos: boolean // 头像等循环播放的装饰视频，四路同时解码很耗 GPU
    hibernateAfterMin: number // 离开某个组多少分钟后卸载该组的页面以释放内存；0 = 从不（全部常驻）
  }
}

export interface AppConfig {
  version: 1
  homeUrl: string
  window: { width: number; height: number; x?: number; y?: number; activeTabId: string | null; sidebarCollapsed?: boolean; sidebarWidth?: number; dockBadge?: boolean }
  tabs: Tab[]
  accounts: Record<string, Account>
  rules: Rules
}

// 渲染层看到的运行时状态（不落盘）
export interface AccountStatus {
  connected: boolean | null
  busy: boolean
  draft: boolean // 输入框里有用户没发出的文字
  loggedIn: boolean | null
  path: string
  lastActivity: { title: string; time: string } | null
  lastAssistant: string | null
}

// 组颜色的取色板（新组优先用还没被占用的颜色）
export const TAB_COLORS = ['#2f6fde', '#e0773b', '#2f9e6b', '#9b59d0', '#d6455d', '#1aa3b8', '#c49a1c', '#5b6b7f']

export const DEFAULT_RULES: Rules = {
  chat: {
    input: 'textarea[placeholder="消息"]',
    sendButton: 'button[aria-label="发送"]',
    stopButton: 'button[aria-label*="停止"], button[aria-label*="Stop"], button[aria-label*="stop"]',
    assistantMessage: '[data-message-role="assistant"]',
    userMessage: '[data-message-role="user"]',
    mainChatPath: '/'
  },
  status: {
    panel: '[data-testid="hatch-status-panel-sliding-surface"]',
    connectedPattern: '^(已连接|Connected)$',
    activityTimePattern: '^\\d{1,2}:\\d{2}\\s?(am|pm|AM|PM)?$'
  },
  usage: {
    openMenuButton: 'button[aria-label="设置"], button[aria-label="更多"]',
    menuItemText: '设置',
    sectionTitle: '使用情况',
    progressBar: '[role="progressbar"]',
    intervalMin: 60
  },
  perf: { pauseLoopingVideos: true, hibernateAfterMin: 10 },
  layout: [
    { selector: '[data-testid="app-download-dock-mark"]', action: 'hide', note: '下载 Muse 应用' },
    { selector: '[data-testid="hatch-invite-friends-button"]', action: 'hide', note: '邀请' },
    { selector: '[data-testid="hatch-side-chats-panel-shell"]', action: 'hide', note: '聊天列表（需要时可删掉此条）' },
    { selector: '[data-testid="hatch-status-panel-sliding-surface"]', action: 'hide', note: '右侧状态面板（信息已搬到列头）' }
  ]
}

// 重置提示：日期用抓到的 resetText（如 "10月17日"），时刻用手填的 resetTime → "10月17日14点30分重置"
export function resetLabel(resetText: string | null, resetTime?: string): string | null {
  if (!resetText) return null
  const m = resetTime?.match(/^(\d{1,2}):(\d{2})$/)
  return m ? `${resetText}${Number(m[1])}点${m[2]}分重置` : `${resetText}重置`
}

export function emptyUsage(): Usage {
  return { weeklyPercent: null, extraPercent: null, resetText: null, extraText: null, raw: null, updatedAt: null, error: null }
}

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    homeUrl: 'https://muse.ai/',
    window: { width: 1600, height: 1000, activeTabId: 't1' },
    tabs: [{ id: 't1', name: '默认组', accountIds: [] }],
    accounts: {},
    rules: DEFAULT_RULES
  }
}
