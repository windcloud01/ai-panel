# Muse Console（AI智能调度台）

基于 [xiezhaoye/muse-panel](https://github.com/xiezhaoye/muse-panel) v0.3.0（MIT）的 fork：
在多 Muse 账号同窗面板之上，增加「团队桥调度台」与「NAS 智能体页」，
供自建 Muse 团队桥（bridge）的用户把成员状态、额度与派活入口收进一个桌面应用。

## 功能

- **多账号同窗**（上游能力）：每个 Muse 账号一列，登录态各自持久保存；每列顶部显示每周额度（手动刷新读取）。
- **桥调度台视图**：侧栏固定入口，主区整页打开自建桥服务的调度台网页（成员卡、任务看板、账本、派活表单）。
  - 独立 partition，桥密钥在页内输一次即持久保存；
  - 主进程按 partition + 地址精确放行（无通配），不给该页 preload；
  - 该 session **证书钉扎**：只接受指纹等于配置值的桥证书，指纹不对直接拒绝连接；
  - 禁止弹窗与站外导航（外链走系统浏览器）。
- **侧栏桥状态组件**：成员额度迷你条、最近备份时间、24h 异常登录数、NAS 智能体健康点（在线绿/离线灰）、待验收角标、快捷派活。
- **NAS 智能体页**：把 NAS 上其他 agent 的 Web 页（如 DeepSeek Harness、OpenClaw、Hermes）以独立 webview 纳入侧栏，每页独立登录分区。
- **无自建更新器**：上游的自研更新器已拆除。本应用只从本源码构建更新，永不从任何域名拉取安装包。

## 配置（使用前必读）

桥地址、证书指纹与 NAS 页地址都是 `src/shared/types.ts` 顶部的常量，仓库里是占位值，**必须改成你自己的**才能连上：

| 常量 | 说明 |
|------|------|
| `BRIDGE_HOST` / `BRIDGE_CONSOLE_URL` | 你的桥服务主机名与调度台地址 |
| `BRIDGE_CERT_SHA256` | 桥自签证书的 SHA-256 指纹（DER、冒号分隔大写）。在桥主机上用 `openssl x509 -in cert.pem -noout -fingerprint -sha256` 取得 |
| `NAS_PAGES` | NAS 智能体页清单（名称、地址、端口按你的部署改） |

桥更换证书后，必须同步更新 `BRIDGE_CERT_SHA256` 并重新构建，否则调度台视图会拒绝连接（这是钉扎的预期行为）。

> 注意：NAS 智能体页示例为明文 HTTP，只应在局域网/Tailscale 内使用，切勿给这些端口做公网转发。

## 构建（macOS, Apple Silicon）

前置：Node 22 LTS。不需要 Apple 开发者账号（未签名本地构建）。

```bash
npm ci
npm run typecheck
npm run dist        # 产出 dist/MuseConsole_1.3.3_arm64.dmg / .zip
```

把 `Muse Console.app` 拖入「应用程序」，首次打开：Finder 右键 → 打开（未签名应用的例行一步）。

- 每个账号在列里登录一次 muse.ai，登录态按账号持久保存在本机；
- 配置文件：`~/Library/Application Support/Muse Console/config.json`；
- 更新：改源码后重跑 `npm run dist` 覆盖安装，配置与登录态不受影响。

## 安全说明

- 本 fork 删除了上游更新器与发布站/iOS 目录，不存在任何自动更新通道。
- preload 中保留的 inject 管道为上游原状：只能由本机界面触发，任何网络侧（包括桥）不得触发。
- 桥调度台的证书钉扎意味着：即使有人伪造同名站点，没有桥的自签证书也无法通过校验。

## 许可与致谢

MIT License（见 `LICENSE`）。

本项目是 [xiezhaoye/muse-panel](https://github.com/xiezhaoye/muse-panel) v0.3.0 的 fork。感谢上游作者 **xiezhaoye** 开发并以 MIT 许可开源 Muse Panel——多账号同窗面板的全部基础能力来自上游，本 fork 的桥调度台、侧栏桥状态组件与 NAS 智能体页均建立在它之上。上游版权在 `LICENSE` 中完整保留；本 fork 修改部分的版权归 **windcloud01**，同样以 MIT 发布。
