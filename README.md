# Octopus Upstream HTTP Bridge

一个给 `Octopus` 配套使用的极简 Node.js 桥接服务。

用途很明确：

- `Octopus` 把 OpenAI Chat 请求发给这个 bridge
- bridge 再把请求转发到真实上游
- 上游 `Authorization` 不写死在 bridge 里
- API key 由 `Octopus` 渠道配置透传

这适合下面这种架构：

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

## 特性

- 纯 Node.js，无运行时第三方依赖
- 支持普通响应和流式 SSE
- 支持 `Authorization` 透传
- 支持可选模型名映射
- 提供 `/health`
- 附带 `systemd` 服务文件
- 附带一键安装脚本

## 适用场景

- 某些上游对 Go 客户端兼容不好，但 Node `fetch` 正常
- 不想把真实上游密钥写死在桥里
- 希望由 `Octopus` 后台统一管理渠道和密钥

## 运行要求

- Linux
- Node.js 18+
- systemd（如果你要用服务方式）

## 快速开始

### 1. 准备配置

复制一份配置文件：

```bash
cp config.example.json config.json
```

最小配置只需要改 `upstream.base_url`：

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

## 一键部署

在仓库目录执行：

```bash
bash install.sh
```

默认会：

- 安装到 `/opt/octopus-upstream-http-bridge`
- 配置文件放到 `/etc/octopus-upstream-http-bridge/config.json`
- 创建 `octopus-upstream-http-bridge.service`
- 自动启动并设为开机自启

### 可选环境变量

```bash
INSTALL_DIR=/opt/octopus-upstream-http-bridge
CONFIG_PATH=/etc/octopus-upstream-http-bridge/config.json
SERVICE_NAME=octopus-upstream-http-bridge
NODE_BIN=/usr/bin/node
```

示例：

```bash
INSTALL_DIR=/srv/octopus-bridge CONFIG_PATH=/srv/octopus-bridge/config.json bash install.sh
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
- 不需要写 `/chat/completions`
- bridge 会基于传入路径拼出最终地址

### `proxy.require_authorization`

```json
"require_authorization": true
```

- `true`：没有 `Authorization` 就拒绝
- 推荐保持 `true`

### `model_map`

```json
"model_map": {
  "claude-sonnet-4-6": "gpt-5.4"
}
```

如果你希望 bridge 顺手把模型名改写掉，可以加这个。

如果你希望完全由 `Octopus` 自己管理模型名，就删掉这一段。

## 请求行为

### bridge 会做的事

- 接收 `/v1/...`
- 读取 body
- 可选改写 `model`
- 原样透传 `Authorization`
- 转发到真实上游
- 原样返回响应

### bridge 不做的事

- 不保存上游 API key
- 不做数据库
- 不做账号系统
- 不做业务路由

## 目录结构

```text
.
├── config.example.json
├── install.sh
├── uninstall.sh
├── package.json
├── README.md
├── src/
│   └── index.mjs
└── systemd/
    └── octopus-upstream-http-bridge.service
```

## 常用命令

语法检查：

```bash
npm run check
```

前台运行：

```bash
node ./src/index.mjs --config ./config.json
```

安装为服务：

```bash
bash install.sh
```

查看服务日志：

```bash
journalctl -u octopus-upstream-http-bridge.service -f
```

卸载服务：

```bash
bash uninstall.sh
```

## 用 curl 测试

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

## 开源建议

如果你准备公开发布，建议：

- 不要提交真实 `config.json`
- 不要提交真实上游密钥
- 只提交 `config.example.json`

## License

MIT
