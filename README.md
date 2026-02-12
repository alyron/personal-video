# 远程视频服务器

一个轻量级的家庭视频远程播放服务，支持 IPv4/IPv6 公网访问，全程 HTTPS 加密保护内容安全。

## 功能特性

- 远程访问家中电脑上的视频资源
- 支持 IPv4 和 IPv6 双栈网络
- 全程 HTTPS 加密，保障传输安全
- 用户认证机制，保护内容隐私
- 视频流式传输，支持 Range 请求（拖动进度条）
- 视频收藏功能
- 视频下载功能
- 快速导航滑块（适合大量视频）
- 响应式设计，支持移动端访问

## 项目结构

```
rmt/
├── server.js              # 入口文件
├── config.json            # 配置文件
├── package.json           # 依赖管理
├── data/                  # 数据目录
│   ├── config.json        # 自定义配置（优先级高）
│   ├── sessions.json      # 会话持久化
│   ├── favorites.json     # 收藏数据
│   ├── videoCache.json    # 视频缓存
│   ├── key.pem            # SSL 私钥
│   └── cert.pem           # SSL 证书
├── src/
│   ├── config/            # 配置加载
│   ├── middleware/        # 中间件（认证等）
│   ├── models/            # 数据模型
│   ├── routes/            # 路由定义
│   ├── services/          # 核心服务
│   └── utils/             # 工具函数
└── public/                # 前端资源
    ├── index.html         # 主页面
    ├── login.html         # 登录页面
    ├── player.html        # 播放页面
    ├── css/               # 样式文件
    └── js/                # 前端脚本
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 生成 SSL 证书

为了保障传输安全，项目强制使用 HTTPS。你可以使用以下方式生成证书：

**方式一：使用项目提供的脚本（自签名证书）**

证书会自动生成到 `data/` 目录中：

```bash
# Linux/macOS
chmod +x generate-cert.sh
./generate-cert.sh

# Windows
generate-cert.bat
```

生成的文件：
- `data/key.pem` - SSL 私钥
- `data/cert.pem` - SSL 证书

**方式二：使用 Let's Encrypt（推荐，有域名时）**

```bash
# 安装 certbot
sudo apt install certbot  # Debian/Ubuntu
brew install certbot      # macOS

# 生成证书
sudo certbot certonly --standalone -d your-domain.com

# 证书位置
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

然后将证书复制到 `data/` 目录，或在 `config.json` 中指定证书路径。

### 3. 配置项目

#### 配置文件优先级

项目支持两个配置文件位置，优先级如下：

1. **`data/config.json`** - 优先级高，适合存放自定义配置
2. **`config.json`** - 根目录配置，默认配置

**使用建议：**
- 将 `config.json` 保持默认配置，用于版本控制
- 在 `data/config.json` 中存放你的个性化配置（用户名、密码、视频目录等）
- `data/` 目录通常不纳入版本控制，适合存放敏感信息

编辑配置文件：

```json
{
  "users": [
    {
      "username": "your-username",
      "password": "your-password"
    }
  ],
  "port": 18899,
  "host": "::",
  "debug": false,
  "https": {
    "enabled": true,
    "key": "./data/key.pem",
    "cert": "./data/cert.pem"
  },
  "videoDirs": [
    {
      "name": "电影",
      "path": "/path/to/your/movies"
    },
    {
      "name": "电视剧",
      "path": "/path/to/your/tv-shows"
    }
  ]
}
```

#### 配置说明

| 字段 | 说明 |
|------|------|
| `users` | 用户列表，支持多用户 |
| `port` | 服务端口，默认 18899 |
| `host` | 监听地址，`::` 表示监听所有 IPv4 和 IPv6 地址 |
| `debug` | 调试模式，开启后控制台显示详细日志 |
| `https.enabled` | 是否启用 HTTPS，生产环境强烈建议开启 |
| `https.key` | SSL 私钥路径 |
| `https.cert` | SSL 证书路径 |
| `videoDirs` | 视频目录配置，`name` 为显示名称，`path` 为绝对路径 |

### 4. 启动服务

```bash
# 直接启动
npm start

# 或使用脚本
# Linux/macOS
./start.sh

# Windows
start.bat
```

## 网络配置

### IPv6 公网访问

如果你的宽带支持 IPv6，可以直接通过 IPv6 地址访问：

```
https://[你的IPv6地址]:18899
```

查看本机 IPv6 地址：
```bash
# Linux/macOS
ip -6 addr show

# Windows
ipconfig
```

### 配合域名使用

1. 在 DNS 服务商添加 AAAA 记录指向你的 IPv6 地址
2. 使用 Let's Encrypt 为域名申请免费 SSL 证书
3. 通过 `https://your-domain.com:18899` 访问

### 端口转发（IPv4）

如果需要 IPv4 公网访问，需要在路由器上配置端口转发：

1. 登录路由器管理界面
2. 找到「端口转发」或「虚拟服务器」
3. 将外网端口（如 18899）转发到内网服务器 IP:18899

### 防火墙设置

确保防火墙开放服务端口：

```bash
# Linux (ufw)
sudo ufw allow 18899/tcp

# Linux (firewalld)
sudo firewall-cmd --add-port=18899/tcp --permanent
sudo firewall-cmd --reload

# macOS
# 系统偏好设置 > 安全性与隐私 > 防火墙 > 防火墙选项
```

## 安全建议

1. **修改默认密码**：在 `config.json` 中设置强密码
2. **使用正式 SSL 证书**：自签名证书浏览器会警告，建议使用 Let's Encrypt
3. **限制访问**：可配合防火墙限制访问 IP
4. **定期更新**：及时更新依赖包

## 支持的视频格式

支持所有浏览器原生支持的视频格式：
- MP4 (H.264)
- WebM
- Ogg

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML/CSS/JavaScript
- **播放器**：Plyr
- **存储**：JSON 文件（轻量级持久化）

## License

MIT
