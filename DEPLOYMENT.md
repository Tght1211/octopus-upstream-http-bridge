# Deployment

这个文件只回答一件事：怎么把 `octopus-upstream-http-bridge` 部署起来。

## 目标

部署一个本地 bridge，把发到 `/v1/...` 的请求转发到用户提供的真实上游 API 根地址。

## 唯一必填参数

用户只需要提供：

```text
upstream base URL
```

例如：

```text
http://154.12.94.222:8080
https://api.example.com
```

不要填：

```text
sk-xxxx
api.example.com
https://api.example.com/v1/chat/completions
```

## 前提

- Linux
- Node.js 18+
- systemd
- 有 `sudo` 权限

## 标准部署命令

最推荐：

```bash
sudo bash install.sh https://your-upstream-host
```

也支持：

```bash
sudo bash install.sh --upstream-url https://your-upstream-host
```

或者：

```bash
sudo UPSTREAM_BASE_URL=https://your-upstream-host bash install.sh
```

## 安装脚本会做什么

- 复制项目到 `/opt/octopus-upstream-http-bridge`
- 生成配置文件 `/etc/octopus-upstream-http-bridge/config.json`
- 创建服务 `/etc/systemd/system/octopus-upstream-http-bridge.service`
- 启动服务
- 设置开机自启

## 默认值

- 监听地址：`127.0.0.1`
- 监听端口：`8330`
- bridge Base URL：`http://127.0.0.1:8330/v1`
- 健康检查：`http://127.0.0.1:8330/health`
- 服务名：`octopus-upstream-http-bridge.service`
- 最大请求体：`10MB`
- 上游超时：`300000ms`
- 运维命令：`/usr/local/bin/octopus-bridgectl`

## 安装后验证

### 1. 看服务状态

```bash
systemctl status octopus-upstream-http-bridge.service --no-pager
```

预期：

```text
active (running)
```

### 2. 看健康检查

```bash
curl http://127.0.0.1:8330/health
```

预期类似：

```json
{"ok":true,"service":"octopus-upstream-http-bridge","config":"config.json"}
```

### 3. 看日志

```bash
journalctl -u octopus-upstream-http-bridge.service -n 50 --no-pager
```

## Octopus 应该怎么填

在 `Octopus` 后台新增渠道时：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：真实上游 key

注意：

- 这里的 Base URL 填 bridge 地址
- 不是填上游地址
- bridge 不保存 API key，只透传 `Authorization`

## 可选自定义参数

支持这些环境变量：

```bash
UPSTREAM_BASE_URL=https://your-upstream-host
INSTALL_DIR=/opt/octopus-upstream-http-bridge
CONFIG_PATH=/etc/octopus-upstream-http-bridge/config.json
SERVICE_NAME=octopus-upstream-http-bridge
NODE_BIN=/usr/bin/node
LISTEN_HOST=127.0.0.1
LISTEN_PORT=8330
OPS_BIN_PATH=/usr/local/bin/octopus-bridgectl
```

示例：

```bash
sudo UPSTREAM_BASE_URL=https://your-upstream-host LISTEN_PORT=18330 bash install.sh
```

如果修改了端口，`Octopus` 里的 Base URL 也要一起改。
重新执行安装或 `octopus-bridgectl update` 时，默认会保留现有配置文件。

更细的稳定性参数要在配置文件里改，例如：

- `proxy.max_body_bytes`
- `proxy.upstream_timeout_ms`
- `server.headers_timeout_ms`
- `server.request_timeout_ms`
- `server.keep_alive_timeout_ms`
- `server.shutdown_timeout_ms`

## 常用命令

重启：

```bash
sudo systemctl restart octopus-upstream-http-bridge.service
```

停止：

```bash
sudo systemctl stop octopus-upstream-http-bridge.service
```

实时日志：

```bash
sudo octopus-bridgectl follow
```

卸载服务：

```bash
sudo bash uninstall.sh
```

## 运维命令

安装后可直接使用：

```bash
sudo octopus-bridgectl summary
sudo octopus-bridgectl status
sudo octopus-bridgectl health
sudo octopus-bridgectl logs 100
sudo octopus-bridgectl follow
sudo octopus-bridgectl config-show
sudo octopus-bridgectl config-edit
sudo octopus-bridgectl restart
sudo octopus-bridgectl update
```

## 快速排障

如果健康检查不通，先检查：

```bash
systemctl status octopus-upstream-http-bridge.service --no-pager
journalctl -u octopus-upstream-http-bridge.service -n 100 --no-pager
```

如果健康检查通，但转发失败，重点检查：

- 上游地址是否可达
- 上游地址是否写成了接口完整路径而不是根地址
- Octopus 是否带了 `Authorization`
- 请求体是否超过 `proxy.max_body_bytes`
- 上游是否超时
- 上游自身是否返回错误

## 给 AI 的结构化摘要

```text
project=octopus-upstream-http-bridge
required_input=upstream_base_url
install_cmd=sudo bash install.sh https://your-upstream-host
alt_install_cmd=sudo bash install.sh --upstream-url https://your-upstream-host
env_install_cmd=sudo UPSTREAM_BASE_URL=https://your-upstream-host bash install.sh
default_host=127.0.0.1
default_port=8330
bridge_base_url=http://127.0.0.1:8330/v1
health_url=http://127.0.0.1:8330/health
service_name=octopus-upstream-http-bridge.service
config_path=/etc/octopus-upstream-http-bridge/config.json
ops_command=/usr/local/bin/octopus-bridgectl
max_body_bytes_default=10485760
upstream_timeout_ms_default=300000
octopus_channel_type=OpenAI Chat
octopus_base_url=http://127.0.0.1:8330/v1
octopus_api_key=real_upstream_key
```
