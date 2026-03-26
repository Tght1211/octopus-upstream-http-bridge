# Deployment

这个文件只讲部署，不讲项目背景。

如果你要部署这个 bridge，看这里。

## 部署目标

把 `octopus-upstream-http-bridge` 装成系统服务。

用户唯一必须提供的参数：

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

## 通用安装命令

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

## Linux

### 前提

- Linux
- Node.js 18+
- `systemd`
- `sudo`

### 默认安装路径

- 安装目录：`/opt/octopus-upstream-http-bridge`
- 配置文件：`/etc/octopus-upstream-http-bridge/config.json`
- 服务：`octopus-upstream-http-bridge.service`

### 安装后会做什么

- 复制项目文件到安装目录
- 生成配置文件
- 写入 `systemd` 服务
- 启动服务
- 设置开机自启

### 安装后验证

查看服务状态：

```bash
sudo octopus-bridgectl status
```

查看健康检查：

```bash
curl http://127.0.0.1:8330/health
```

查看就绪检查：

```bash
curl http://127.0.0.1:8330/ready
```

查看日志：

```bash
sudo octopus-bridgectl logs 50
```

### Linux 底层命令

如果你不用 `octopus-bridgectl`，也可以直接看：

```bash
systemctl status octopus-upstream-http-bridge.service --no-pager
journalctl -u octopus-upstream-http-bridge.service -n 50 --no-pager
```

## macOS

### 前提

- macOS
- Node.js 18+
- `launchd`
- `sudo`

### 默认安装路径

- 安装目录：`/usr/local/lib/octopus-upstream-http-bridge`
- 配置文件：`/usr/local/etc/octopus-upstream-http-bridge/config.json`
- launchd label：`octopus-upstream-http-bridge`
- plist：`/Library/LaunchDaemons/octopus-upstream-http-bridge.plist`
- stdout 日志：`/var/log/octopus-upstream-http-bridge.log`
- stderr 日志：`/var/log/octopus-upstream-http-bridge.error.log`

### 安装后会做什么

- 复制项目文件到安装目录
- 生成配置文件
- 写入 `launchd` plist
- 启动服务
- 设置开机启动

### 安装后验证

查看服务状态：

```bash
sudo octopus-bridgectl status
```

查看健康检查：

```bash
curl http://127.0.0.1:8330/health
```

查看就绪检查：

```bash
curl http://127.0.0.1:8330/ready
```

查看日志：

```bash
sudo octopus-bridgectl logs 50
```

### `brew services` 风格理解

这个项目不是 Homebrew formula。

所以不能直接用：

```bash
brew services start octopus-upstream-http-bridge
```

但你可以按这个习惯理解：

- `brew services start ...` 对应 `sudo octopus-bridgectl start`
- `brew services stop ...` 对应 `sudo octopus-bridgectl stop`
- `brew services restart ...` 对应 `sudo octopus-bridgectl restart`
- `brew services list` 对应 `sudo octopus-bridgectl status`

### macOS 底层命令

如果你不用 `octopus-bridgectl`，也可以直接看：

```bash
sudo launchctl print system/octopus-upstream-http-bridge
tail -n 50 /var/log/octopus-upstream-http-bridge.log
tail -n 50 /var/log/octopus-upstream-http-bridge.error.log
```

## Octopus 配置

在 `Octopus` 后台新增渠道时填写：

- 类型：`OpenAI Chat`
- Base URL：`http://127.0.0.1:8330/v1`
- API Key：真实上游 key

注意：

- Base URL 填的是 bridge 地址
- 不是上游地址

## 统一运维命令

Linux 和 macOS 安装后都统一使用：

```bash
sudo octopus-bridgectl summary
sudo octopus-bridgectl status
sudo octopus-bridgectl health
sudo octopus-bridgectl ready
sudo octopus-bridgectl doctor
sudo octopus-bridgectl logs 100
sudo octopus-bridgectl follow
sudo octopus-bridgectl restart
sudo octopus-bridgectl stop
sudo octopus-bridgectl config-show
sudo octopus-bridgectl config-edit
sudo octopus-bridgectl update
```

## 可选环境变量

如果你需要改默认路径或行为，可以传这些环境变量：

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

说明：

- 默认会保留已有配置文件
- 只有首次安装或显式设置 `FORCE_REWRITE_CONFIG=1` 时才会重写配置

## 快速排障

如果服务没起来，先执行：

```bash
sudo octopus-bridgectl doctor
```

如果健康检查正常但转发失败，重点检查：

- 上游地址是否可达
- 上游地址是否写成了完整接口路径而不是根地址
- Octopus 是否带了 `Authorization`
- 请求体是否超过 `proxy.max_body_bytes`
- 上游是否超时
- 上游是否本身就返回错误

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
ready_url=http://127.0.0.1:8330/ready
linux_install_dir=/opt/octopus-upstream-http-bridge
linux_config_path=/etc/octopus-upstream-http-bridge/config.json
linux_service_name=octopus-upstream-http-bridge.service
macos_install_dir=/usr/local/lib/octopus-upstream-http-bridge
macos_config_path=/usr/local/etc/octopus-upstream-http-bridge/config.json
macos_launchd_label=octopus-upstream-http-bridge
macos_launchd_plist=/Library/LaunchDaemons/octopus-upstream-http-bridge.plist
ops_command=/usr/local/bin/octopus-bridgectl
octopus_channel_type=OpenAI Chat
octopus_base_url=http://127.0.0.1:8330/v1
octopus_api_key=real_upstream_key
```
