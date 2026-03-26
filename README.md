# Octopus Upstream HTTP Bridge

一个给 `Octopus` 配套使用的极简 Node.js 桥接服务。

部署入口见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

它的作用只有一件事：

- `Octopus` 把 OpenAI Chat 请求发给这个 bridge
- bridge 再把请求转发到真实上游 API
- `Authorization` 由 `Octopus` 透传
- bridge 不保存你的真实上游 API key

适合这种链路：

```text
Claude Code / OpenAI SDK / Anthropic SDK
                |
                v
             Octopus
                |
                v
   octopus-upstream-http-bridge
                |
                v
     Real OpenAI-compatible upstream
```

## 给人看的最短说明

如果你是第一次部署，只看这一段就够了。

前提：

- 机器是 Linux 或 macOS
- 已安装 Node.js 18+
- Linux 使用 `systemd`
- macOS 使用 `launchd`

部署命令：

```bash
sudo bash install.sh https://your-upstream-host
```

例如：

```bash
sudo bash install.sh http://154.12.94.222:8080
```

安装完成后，这个 bridge 默认会监听：

```text
http://127.0.0.1:8330/v1
```

然后在 `Octopus` 里这样填：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：填真实上游 key

健康检查：

```bash
curl http://127.0.0.1:8330/health
```

查看日志：

```bash
sudo octopus-bridgectl follow
```

## 给 AI/自动化看的最短说明

如果你是 AI agent、脚本或自动化工具，按下面规则处理：

- 目标：部署一个本地 bridge，把 `/v1/...` 请求转发到用户给定的上游 API 根地址
- 用户唯一必须输入的参数：`upstream.base_url`
- 一键安装命令：`sudo bash install.sh https://your-upstream-host`
- 也支持：`sudo UPSTREAM_BASE_URL=https://your-upstream-host bash install.sh`
- 默认监听地址：`127.0.0.1:8330`
- Linux 默认配置文件：`/etc/octopus-upstream-http-bridge/config.json`
- macOS 默认配置文件：`/usr/local/etc/octopus-upstream-http-bridge/config.json`
- Linux 服务名：`octopus-upstream-http-bridge.service`
- macOS launchd label：`octopus-upstream-http-bridge`
- 上游地址必须以 `http://` 或 `https://` 开头
- bridge 不保存上游 API key，只透传 `Authorization`
- `Octopus` 应连接到：`http://127.0.0.1:8330/v1`
- 安装后验证命令 1：`curl http://127.0.0.1:8330/health`
- 安装后验证命令 1b：`curl http://127.0.0.1:8330/ready`
- 安装后验证命令 2：`sudo octopus-bridgectl status`
- 安装后验证命令 3：`sudo octopus-bridgectl logs 50`

## 特性

- 纯 Node.js，无运行时第三方依赖
- 支持普通响应和流式 SSE
- 支持 `Authorization` 透传
- 支持请求体大小限制和上游超时保护
- 支持优雅关停，减少服务重启时的异常请求
- 已拆分为标准模块：配置、日志、代理、服务生命周期
- 内置 `node:test` 测试与 GitHub Actions CI
- 提供 `/health`
- 提供 `/ready`
- 附带 `systemd` 与 `launchd` 服务化支持
- 附带一键安装脚本，只需要提供上游 API 地址

## 适用场景

- 某些上游对 Go 客户端兼容不好，但 Node `fetch` 正常
- 不想把真实上游密钥写死在 bridge 里
- 希望由 `Octopus` 后台统一管理渠道和密钥

## 运行要求

- Linux 或 macOS
- Node.js 18+
- Linux 使用 `systemd`
- macOS 使用 `launchd`

## 一键部署

### Linux 默认值

- 安装目录：`/opt/octopus-upstream-http-bridge`
- 配置文件：`/etc/octopus-upstream-http-bridge/config.json`
- 服务管理器：`systemd`
- 服务名：`octopus-upstream-http-bridge.service`

### macOS 默认值

- 安装目录：`/usr/local/lib/octopus-upstream-http-bridge`
- 配置文件：`/usr/local/etc/octopus-upstream-http-bridge/config.json`
- 服务管理器：`launchd`
- label：`octopus-upstream-http-bridge`
- plist：`/Library/LaunchDaemons/octopus-upstream-http-bridge.plist`
- stdout 日志：`/var/log/octopus-upstream-http-bridge.log`
- stderr 日志：`/var/log/octopus-upstream-http-bridge.error.log`

### macOS 的 `brew services` 风格说明

这个项目现在不是 Homebrew formula，所以不能直接执行：

```bash
brew services start octopus-upstream-http-bridge
```

但使用体验可以按 `brew services` 去理解，因为底层同样是常驻系统服务。

macOS 推荐把下面这些命令当成对应关系：

- `brew services start ...` 对应 `sudo octopus-bridgectl start`
- `brew services stop ...` 对应 `sudo octopus-bridgectl stop`
- `brew services restart ...` 对应 `sudo octopus-bridgectl restart`
- `brew services list` 对应 `sudo octopus-bridgectl status`
- `tail -f` 看日志 对应 `sudo octopus-bridgectl follow`

也就是说，在 macOS 上你可以把它理解成：

```bash
sudo bash install.sh https://your-upstream-host
sudo octopus-bridgectl start
sudo octopus-bridgectl stop
sudo octopus-bridgectl restart
sudo octopus-bridgectl status
```

只是底层不是 Homebrew，而是我们直接生成并管理 `launchd` plist。

### 方式 1：直接把上游地址写在命令后面

这是最推荐的方式。

```bash
sudo bash install.sh https://your-upstream-host
```

例如：

```bash
sudo bash install.sh http://154.12.94.222:8080
```

### 方式 2：用明确参数名

```bash
sudo bash install.sh --upstream-url https://your-upstream-host
```

### 方式 3：不带参数，交互输入

```bash
sudo bash install.sh
```

脚本会提示：

```text
Upstream API base URL:
```

### 安装脚本会做什么

- 按当前系统选择默认安装目录和配置目录
- 生成配置文件
- Linux 写入 `systemd` 服务
- macOS 写入 `launchd` plist
- 自动启动服务
- 设置为开机自启

### 安装后你会得到什么

- bridge 本地地址：`http://127.0.0.1:8330/v1`
- 健康检查地址：`http://127.0.0.1:8330/health`
- 就绪检查地址：`http://127.0.0.1:8330/ready`
- 运维命令：`/usr/local/bin/octopus-bridgectl`

### 可选环境变量

如果你想自定义安装位置或端口，可以在执行时传环境变量：

```bash
UPSTREAM_BASE_URL=https://your-upstream-host
INSTALL_DIR=/opt/octopus-upstream-http-bridge
CONFIG_PATH=/etc/octopus-upstream-http-bridge/config.json
SERVICE_NAME=octopus-upstream-http-bridge
NODE_BIN=/usr/bin/node
LISTEN_HOST=127.0.0.1
LISTEN_PORT=8330
OPS_BIN_PATH=/usr/local/bin/octopus-bridgectl
FORCE_REWRITE_CONFIG=0
SERVICE_MANAGER=systemd|launchd
LAUNCHD_PLIST_PATH=/Library/LaunchDaemons/octopus-upstream-http-bridge.plist
STDOUT_LOG_PATH=/var/log/octopus-upstream-http-bridge.log
STDERR_LOG_PATH=/var/log/octopus-upstream-http-bridge.error.log
```

例如：

```bash
sudo UPSTREAM_BASE_URL=https://your-upstream-host LISTEN_PORT=18330 bash install.sh
```

说明：

- 默认会保留已有 `config.json`
- 只有在首次安装或显式设置 `FORCE_REWRITE_CONFIG=1` 时才会重写配置

## 小白部署步骤

如果你不确定自己在做什么，就严格按这个顺序来。

### 1. 进入项目目录

```bash
cd /path/to/octopus-upstream-http-bridge
```

### 2. 确认机器有 Node.js

```bash
node -v
```

如果输出版本号并且主版本大于等于 18，就可以继续。

### 3. 执行安装

把下面的地址替换成你的真实上游 API 根地址：

```bash
sudo bash install.sh https://your-upstream-host
```

注意：

- 这里填的是上游根地址
- 不要填 `/v1/chat/completions`
- 例如填 `http://154.12.94.222:8080`
- 不要填 API key

### 4. 检查服务是否启动成功

```bash
systemctl status octopus-upstream-http-bridge.service --no-pager
```

看到 `active (running)` 基本就表示成功。

也可以直接用：

```bash
sudo octopus-bridgectl status
```

### 5. 检查健康接口

```bash
curl http://127.0.0.1:8330/health
```

正常应该返回类似：

```json
{"ok":true,"service":"octopus-upstream-http-bridge","config":"config.json"}
```

`/ready` 正常应该返回类似：

```json
{"ok":true,"service":"octopus-upstream-http-bridge","ready":true}
```

### 6. 去 Octopus 后台配置渠道

新增渠道时填写：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：你的真实上游 key

这里最容易填错的是 Base URL。要填 bridge 地址，不是上游地址。

### Linux 和 macOS 的区别

- Linux 安装后服务由 `systemd` 管理
- macOS 安装后服务由 `launchd` 管理
- 两边都统一使用 `sudo octopus-bridgectl ...`
- Linux 底层日志主要来自 `journalctl`
- macOS 底层日志主要来自 `/var/log/octopus-upstream-http-bridge.log` 和 `/var/log/octopus-upstream-http-bridge.error.log`

## 手动运行

如果你暂时不想装成服务，也可以直接前台运行。

### 1. 准备配置

```bash
cp config.example.json config.json
```

最小配置只需要修改 `upstream.base_url`：

```json
{
  "listen": {
    "host": "127.0.0.1",
    "port": 8330
  },
  "upstream": {
    "base_url": "http://154.12.94.222:8080"
  }
}
```

### 2. 启动

```bash
node ./src/index.mjs --config ./config.json
```

或者：

```bash
npm run start
```

### 3. 健康检查

```bash
curl http://127.0.0.1:8330/health
```

## Octopus 中怎么配

在 `Octopus` 后台新增渠道时：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：填你的真实上游 key

bridge 不保存这个 key，它只透传给上游。

## 配置说明

完整示例见 [config.example.json](./config.example.json)。

### `listen`

```json
"listen": {
  "host": "127.0.0.1",
  "port": 8330
}
```

- `host`：bridge 监听地址
- `port`：bridge 监听端口

### `upstream`

```json
"upstream": {
  "base_url": "http://154.12.94.222:8080"
}
```

- `base_url`：真实上游根地址
- 必须以 `http://` 或 `https://` 开头
- 不需要写 `/v1/chat/completions`
- bridge 会基于传入路径自动拼接最终地址

### `proxy.require_authorization`

```json
"require_authorization": true
```

- `true`：没有 `Authorization` 就拒绝
- 推荐保持 `true`

### `proxy.max_body_bytes`

```json
"max_body_bytes": 10485760
```

- 单个请求体的最大字节数
- 默认 `10MB`
- 超过限制会返回 `413`

### `proxy.upstream_timeout_ms`

```json
"upstream_timeout_ms": 300000
```

- 单次上游请求最大等待时间
- 默认 `300000ms`，也就是 5 分钟
- 超时会返回 `504`

## 错误返回格式

bridge 自身返回的错误统一是：

```json
{
  "error": {
    "code": "BRIDGE_XXX",
    "message": "human readable message"
  }
}
```

当前常见错误码：

- `BRIDGE_SHUTTING_DOWN`
- `BRIDGE_NOT_FOUND`
- `BRIDGE_MISSING_AUTH`
- `BRIDGE_INVALID_BODY`
- `BRIDGE_BODY_TOO_LARGE`
- `BRIDGE_UPSTREAM_TIMEOUT`
- `BRIDGE_UPSTREAM_FAILURE`

### `server`

```json
"server": {
  "headers_timeout_ms": 65000,
  "request_timeout_ms": 300000,
  "keep_alive_timeout_ms": 5000,
  "shutdown_timeout_ms": 15000
}
```

- `headers_timeout_ms`：请求头读取超时
- `request_timeout_ms`：整个请求生命周期超时
- `keep_alive_timeout_ms`：keep-alive 空闲超时
- `shutdown_timeout_ms`：优雅关停等待时长，超时后会强制断开剩余连接

## 请求行为

### bridge 会做的事

- 接收 `/v1/...`
- 读取请求 body
- 原样透传 `Authorization`
- 转发到真实上游
- 原样返回响应

### bridge 不会做的事

- 不保存上游 API key
- 不做数据库
- 不做账号系统
- 不做业务路由

## 常用命令

语法检查：

```bash
npm run check
```

运行测试：

```bash
npm test
```

只跑 smoke test：

```bash
npm run smoke
```

安装为服务：

```bash
sudo bash install.sh https://your-upstream-host
```

查看服务状态：

```bash
sudo octopus-bridgectl status
```

查看就绪状态：

```bash
sudo octopus-bridgectl ready
```

自动诊断：

```bash
sudo octopus-bridgectl doctor
```

查看服务日志：

```bash
sudo octopus-bridgectl follow
```

重启服务：

```bash
sudo octopus-bridgectl restart
```

停止服务：

```bash
sudo octopus-bridgectl stop
```

卸载服务：

```bash
sudo bash uninstall.sh
```

## 用 curl 测试转发

```bash
curl -sS http://127.0.0.1:8330/v1/chat/completions \
  -H 'Authorization: Bearer YOUR_REAL_UPSTREAM_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gpt-5.4",
    "messages":[{"role":"user","content":"Reply with OK"}],
    "max_tokens":32
  }'
```

## 常见问题

### 1. 为什么安装脚本需要 `sudo`

因为它会写下面这些系统目录：

- `/opt/...`
- `/etc/...`
- `/etc/systemd/system/...`

### 2. 上游地址到底该填什么

填上游 API 根地址。

正确示例：

- `http://154.12.94.222:8080`
- `https://api.example.com`

错误示例：

- `sk-xxxxxx`
- `api.example.com`
- `https://api.example.com/v1/chat/completions`

### 3. Octopus 里的 Base URL 该填什么

填 bridge 地址：

```text
http://127.0.0.1:8330/v1
```

不是填上游地址。

### 4. 健康检查通过，但调用失败怎么办

先看日志：

```bash
sudo octopus-bridgectl logs 100
```

重点排查：

- 上游地址是否可达
- Octopus 是否带了 `Authorization`
- 上游是否要求特定模型名
- 请求体是否超过 `max_body_bytes`
- 上游是否超时
- 上游是否本身就返回了错误

## 运维命令

安装完成后会自动生成命令：

```bash
sudo octopus-bridgectl
```

常用子命令：

- `sudo octopus-bridgectl summary`：查看服务、配置、bridge 地址
- `sudo octopus-bridgectl status`：查看服务状态
- `sudo octopus-bridgectl health`：请求本地健康接口
- `sudo octopus-bridgectl ready`：请求本地就绪接口
- `sudo octopus-bridgectl doctor`：自动检查服务、配置、探针和最近错误日志
- `sudo octopus-bridgectl logs 100`：查看最近 100 行日志
- `sudo octopus-bridgectl follow`：实时追日志
- `sudo octopus-bridgectl restart`：重启服务
- `sudo octopus-bridgectl start`：启动服务
- `sudo octopus-bridgectl stop`：停止服务
- `sudo octopus-bridgectl config-path`：显示配置文件路径
- `sudo octopus-bridgectl config-show`：显示当前配置
- `sudo octopus-bridgectl config-edit`：用 `$EDITOR` 编辑配置
- `sudo octopus-bridgectl update`：保留当前配置，重新安装并重启服务

## 目录结构

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── LICENSE
├── launchd/
│   └── octopus-upstream-http-bridge.plist
├── config.example.json
├── DEPLOYMENT.md
├── install.sh
├── ops.sh
├── package.json
├── README.md
├── scripts/
│   ├── install.sh
│   ├── ops.sh
│   └── uninstall.sh
├── src/
│   ├── config.mjs
│   ├── constants.mjs
│   ├── errors.mjs
│   ├── index.mjs
│   ├── logger.mjs
│   ├── proxy.mjs
│   └── server.mjs
├── test/
│   ├── config.test.mjs
│   ├── proxy.test.mjs
│   └── smoke.test.mjs
├── systemd/
│   └── octopus-upstream-http-bridge.service
└── uninstall.sh
```

## 开源建议

如果你准备公开发布，建议：

- 不要提交真实 `config.json`
- 不要提交真实 API key

## License

MIT
