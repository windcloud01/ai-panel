import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, session, shell, type Session } from 'electron'
import { X509Certificate } from 'node:crypto'
import { join } from 'node:path'
import {
  configPath,
  flushConfig,
  getConfig,
  loadConfig,
  onConfigChange,
  reloadFromDisk,
  setConfig,
  updateConfig
} from './config'
import { initUsageQueue, refreshUsage, usageQueueState } from './usage'
import {
  BRIDGE_CERT_SHA256,
  BRIDGE_CONSOLE_URL,
  BRIDGE_HOST,
  BRIDGE_PARTITION,
  NAS_PAGES,
  nasPageByPartition,
  nasPageOrigin,
  type AppConfig,
  type NasPage
} from '../shared/types'

// UA 归一化：去掉 Electron/x.y.z 和应用名，网站看到的就是普通 Chrome。
// 对所有 session（包括每个 persist:muse-* partition）生效。
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|MusePanel|muse-panel|MuseConsole)\/\S+/gi, '')

// 测试用：MUSE_PANEL_USER_DATA 指定独立的数据目录，不碰正式配置和登录态
if (process.env.MUSE_PANEL_USER_DATA) app.setPath('userData', process.env.MUSE_PANEL_USER_DATA)

const ALLOWED_POPUP_HOSTS = /(^|\.)(muse\.ai|meta\.com|facebook\.com|metaaivm\.com|accountscenter\.meta\.com)$/i

let win: BrowserWindow | null = null

// NAS 智能体页的 session → 页面定义（did-attach 时按 session 识别来源）
const NAS_PAGES_SESSIONS = new Map<Session, NasPage>()

function musePreloadPath(): string {
  return join(__dirname, '../preload/muse.js')
}

function createWindow(cfg: AppConfig): void {
  win = new BrowserWindow({
    width: cfg.window.width,
    height: cfg.window.height,
    x: cfg.window.x,
    y: cfg.window.y,
    minWidth: 900,
    minHeight: 600,
    title: 'AI智能调度台',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6f6f4',
    webPreferences: {
      preload: join(__dirname, '../preload/panel.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  // 只允许本应用创建三类 webview，并强制安全参数：
  // 1) muse 账号 webview：partition persist:muse-* + src 只许 muse.ai；
  // 2) 桥调度台 webview（fork 新增）：partition 恰为 persist:bridge-console + src 恰为桥地址，精确匹配、无通配；
  // 3) NAS 智能体 webview（fork 新增）：partition 在 NAS_PAGES 定义表内 + src origin 与表中地址一致。
  win.webContents.on('will-attach-webview', (event, prefs, params) => {
    const partition = params.partition ?? ''
    const harden = (): void => {
      // 嵌入页一律不需要 preload，并强制隔离参数
      delete (prefs as Record<string, unknown>).preload
      delete (prefs as Record<string, unknown>).preloadURL
      prefs.contextIsolation = true
      prefs.nodeIntegration = false
      prefs.sandbox = true
    }
    if (partition === BRIDGE_PARTITION) {
      if (params.src !== BRIDGE_CONSOLE_URL) {
        event.preventDefault()
        return
      }
      harden()
      return
    }
    const nasPage = nasPageByPartition(partition)
    if (nasPage) {
      if (nasPageOrigin(params.src) !== nasPageOrigin(nasPage.url)) {
        event.preventDefault()
        return
      }
      harden()
      return
    }
    if (!partition.startsWith('persist:muse-') || !/^https:\/\/([a-z0-9-]+\.)*muse\.ai\//.test(params.src)) {
      event.preventDefault()
      return
    }
    prefs.preload = musePreloadPath()
    prefs.contextIsolation = true
    prefs.nodeIntegration = false
    prefs.sandbox = true
    delete (prefs as Record<string, unknown>).preloadURL
  })

  win.webContents.on('did-attach-webview', (_e, wc) => {
    if (wc.session === session.fromPartition(BRIDGE_PARTITION)) {
      // 调度台 webview：不许弹窗、不许导航离开桥源（外链走系统浏览器）
      wc.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
      })
      wc.on('will-navigate', (ev, url) => {
        if (!url.startsWith(BRIDGE_CONSOLE_URL)) ev.preventDefault()
      })
      return
    }
    const nasPage = NAS_PAGES_SESSIONS.get(wc.session)
    if (nasPage) {
      // NAS 智能体 webview：同源弹窗放行（部分页面的登录/授权走弹窗），
      // 顶层导航锁定在该页面 origin 内，站外链接走系统浏览器
      const origin = nasPageOrigin(nasPage.url)
      wc.setWindowOpenHandler(({ url }) => {
        if (nasPageOrigin(url) === origin) return { action: 'allow' }
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
      })
      wc.on('will-navigate', (ev, url) => {
        if (nasPageOrigin(url) !== origin) ev.preventDefault()
      })
      return
    }
    wc.setWindowOpenHandler(({ url }) => {
      try {
        const host = new URL(url).hostname
        if (ALLOWED_POPUP_HOSTS.test(host)) return { action: 'allow' } // 登录弹窗与同站链接，沿用同一 partition
      } catch {}
      shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  const saveBounds = (): void => {
    if (!win) return
    const b = win.getBounds()
    updateConfig((c) => {
      c.window.width = b.width
      c.window.height = b.height
      c.window.x = b.x
      c.window.y = b.y
    })
  }
  win.on('resized', saveBounds)
  win.on('moved', saveBounds)
  win.on('closed', () => (win = null))

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' }, // 没有它，webview 里 ⌘C/⌘V 不可用
    {
      label: '面板',
      submenu: [
        { label: '打开配置文件', click: () => shell.openPath(configPath()) },
        { label: '在 Finder 中显示配置', click: () => shell.showItemInFolder(configPath()) },
        {
          label: '重新加载配置（改完 JSON 后）',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            try {
              reloadFromDisk()
            } catch (e) {
              dialog.showErrorBox('配置文件有误', String(e))
            }
          }
        },
        { type: 'separator' },
        { role: 'reload', label: '重载面板界面' },
        { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}


function send(channel: string, ...args: unknown[]): void {
  win?.webContents.send(channel, ...args)
}

function registerIpc(): void {
  // 侧栏收拢时隐藏左上角红绿灯，避免压在第一列列头上
  ipcMain.on('window:trafficLights', (_e, visible: boolean) => win?.setWindowButtonVisibility(visible))
  ipcMain.on('app:badge', (_e, n: number) => {
    try {
      app.setBadgeCount(Math.max(0, Math.floor(Number(n) || 0)))
    } catch {}
  })
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, next: AppConfig) => setConfig(next))
  ipcMain.handle('config:path', () => configPath())
  ipcMain.handle('paths:musePreload', () => `file://${musePreloadPath()}`)
  // 设置窗口用：当前版本（fork 已拆除上游更新器，更新 = 重新构建安装）
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('usage:refresh', (_e, id: string) => refreshUsage(id))
  ipcMain.handle('usage:queueState', () => usageQueueState())
  ipcMain.handle('account:clearData', async (_e, id: string) => {
    await session.fromPartition(`persist:muse-${id}`).clearStorageData()
    return true
  })
  ipcMain.handle('dialog:confirm', async (_e, message: string) => {
    if (!win) return false
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['取消', '确定'], defaultId: 0, cancelId: 0, message })
    return r.response === 1
  })
  ipcMain.on('notify', (_e, title: string, body: string) => new Notification({ title, body }).show())
}

/** 桥调度台证书钉扎：该 session 只接受指纹等于 BRIDGE_CERT_SHA256 的桥证书，其余主机走默认校验 */
function pinBridgeCertificate(): void {
  const ses = session.fromPartition(BRIDGE_PARTITION)
  ses.setCertificateVerifyProc((request, callback) => {
    if (request.hostname !== BRIDGE_HOST) {
      callback(-3) // 非桥主机：Chromium 默认校验
      return
    }
    try {
      const fp = new X509Certificate(request.certificate.data).fingerprint256
      callback(fp === BRIDGE_CERT_SHA256 ? 0 : -2)
    } catch {
      callback(-2)
    }
  })
}

app.whenReady().then(() => {
  // 账号页面里用不上拼写检查，关掉省一点内存和 CPU
  app.on('session-created', (ses) => ses.setSpellCheckerEnabled(false))
  pinBridgeCertificate()
  for (const p of NAS_PAGES) NAS_PAGES_SESSIONS.set(session.fromPartition(p.partition), p)
  const cfg = loadConfig()
  buildMenu()
  registerIpc()
  createWindow(cfg)
  // 不在启动时自动检查更新，只有用户点「检查更新…」才查

  onConfigChange((c) => send('config:changed', c))
  // 额度只在用户点刷新时读取（串行队列），不做启动时或定时的抓取
  initUsageQueue((id, state) => send('usage:state', id, state))


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(getConfig())
  })
})

app.on('before-quit', () => {
  flushConfig()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
