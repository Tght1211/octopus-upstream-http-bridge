# Octopus Upstream HTTP Bridge

一个给 `Octopus` 配套使用的轻量 Node.js 桥接服务。

它只做一件事：

- 接收发往 `/v1/...` 的请求
- 把请求转发到真实上游 API
- 原样透传 `Authorization`
- 不保存真实上游 API key

适合这种链路：

```text
Client / SDK
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

## 文档入口

- 部署文档：[`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Linux 部署：见 `DEPLOYMENT.md` 的 `Linux`
- macOS 部署：见 `DEPLOYMENT.md` 的 `macOS`

如果你只想部署，直接看 `DEPLOYMENT.md`，不要看这个 README。

## 核心特性

- 纯 Node.js，无运行时第三方依赖
- 支持普通响应和流式 SSE
- 支持 `Authorization` 透传
- 支持请求体大小限制和上游超时
- 支持优雅关停
- 提供 `/health` 和 `/ready`
- 支持 Linux `systemd`
- 支持 macOS `launchd`
- 提供统一运维命令 `octopus-bridgectl`
- 内置测试和 GitHub Actions CI

## 适用场景

- 某些上游对 Go 客户端兼容不好，但 Node `fetch` 正常
- 不想把真实上游密钥写死在 bridge 里
- 希望由 `Octopus` 统一管理渠道和密钥

## 运行要求

- Node.js 18+
- Linux 或 macOS
- Linux 服务化使用 `systemd`
- macOS 服务化使用 `launchd`

## Octopus 中怎么配

在 `Octopus` 后台新增渠道时：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：真实上游 key

注意：

- Base URL 填的是 bridge 地址
- 不是上游地址
- bridge 不保存 API key，只透传给上游

## 接口约定

### 健康检查

```bash
curl http://127.0.0.1:8330/health
```

### 就绪检查

```bash
curl http://127.0.0.1:8330/ready
```

### 错误返回格式

bridge 自身错误统一返回：

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

## 配置说明

完整示例见 [`config.example.json`](./config.example.json)。

关键字段：

- `listen.host`
- `listen.port`
- `upstream.base_url`
- `proxy.require_authorization`
- `proxy.max_body_bytes`
- `proxy.upstream_timeout_ms`
- `server.headers_timeout_ms`
- `server.request_timeout_ms`
- `server.keep_alive_timeout_ms`
- `server.shutdown_timeout_ms`

`upstream.base_url` 必须是上游根地址，例如：

- `http://154.12.94.222:8080`
- `https://api.example.com`

不要写：

- `sk-xxxx`
- `api.example.com`
- `https://api.example.com/v1/chat/completions`

## 运维入口

安装完成后统一使用：

```bash
sudo octopus-bridgectl
```

常用命令：

- `sudo octopus-bridgectl summary`
- `sudo octopus-bridgectl status`
- `sudo octopus-bridgectl health`
- `sudo octopus-bridgectl ready`
- `sudo octopus-bridgectl doctor`
- `sudo octopus-bridgectl logs 100`
- `sudo octopus-bridgectl follow`
- `sudo octopus-bridgectl restart`
- `sudo octopus-bridgectl stop`
- `sudo octopus-bridgectl config-show`
- `sudo octopus-bridgectl config-edit`
- `sudo octopus-bridgectl update`

## 本地开发

准备配置：

```bash
cp config.example.json config.json
```

前台启动：

```bash
node ./src/index.mjs --config ./config.json
```

或者：

```bash
npm run start
```

代码检查：

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

## 目录结构

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── config.example.json
├── DEPLOYMENT.md
├── launchd/
│   └── octopus-upstream-http-bridge.plist
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
├── systemd/
│   └── octopus-upstream-http-bridge.service
├── test/
│   ├── config.test.mjs
│   ├── proxy.test.mjs
│   └── smoke.test.mjs
├── install.sh
├── ops.sh
├── package.json
└── uninstall.sh
```

## License

MIT
