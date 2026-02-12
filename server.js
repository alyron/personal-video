/**
 * 视频服务器入口文件
 * 
 * 功能：
 * - 用户认证 (Cookie Session)
 * - 视频目录扫描
 * - 视频流传输 (支持 Range 请求)
 * - HTTPS 支持
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');

// 加载配置
const config = require('./src/config');

// 加载路由
const { authRoutes, apiRoutes, pageRoutes } = require('./src/routes');

// 加载服务
const videoScanner = require('./src/services/videoScanner');
const videoCache = require('./src/models/videoCache');
const videoIdManager = require('./src/utils/videoId');

// 创建 Express 应用
const app = express();

// 中间件配置
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 路由配置
app.use('/', authRoutes);      // 认证路由 (/login, /logout)
app.use('/api', apiRoutes);    // API 路由 (/api/scan, /api/stream, etc.)
app.use('/', pageRoutes);      // 页面路由 (/, /video/:id)

// 404 处理
app.use((req, res) => {
  res.status(404).send('页面不存在');
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

// 创建服务器
const cfg = config.getConfig();
const port = cfg.port || 18899;
const host = cfg.host || '::';

let server;

if (cfg.https && cfg.https.enabled) {
  // HTTPS 服务器
  try {
    const keyPath = path.join(__dirname, cfg.https.key || './key.pem');
    const certPath = path.join(__dirname, cfg.https.cert || './cert.pem');
    
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    
    server = https.createServer(httpsOptions, app);
    console.log('HTTPS 模式已启用');
  } catch (err) {
    console.error('加载 SSL 证书失败:', err.message);
    console.log('回退到 HTTP 模式');
    server = http.createServer(app);
  }
} else {
  // HTTP 服务器
  server = http.createServer(app);
}

// 设置服务器超时时间（大文件下载需要更长超时）
server.timeout = 30 * 60 * 1000; // 30分钟
server.keepAliveTimeout = 65000; // 保持连接超时

// 启动服务器
server.listen(port, host, () => {
  const protocol = cfg.https && cfg.https.enabled ? 'https' : 'http';
  
  console.log('=================================================');
  console.log('视频服务已启动！');
  console.log('=================================================');
  console.log(`协议: ${protocol.toUpperCase()}`);
  console.log(`访问地址 (IPv6): ${protocol}://[::1]:${port}`);
  console.log(`访问地址 (IPv4): ${protocol}://127.0.0.1:${port}`);
  console.log(`访问地址 (本地网络): ${protocol}://<本机IP>:${port}`);
  console.log('=================================================');
  console.log('默认登录信息:');
  console.log('用户名: admin');
  console.log('密码: password123');
  console.log('=================================================');
  console.log('提示: 修改 config.json 文件可更改用户名、密码和其他设置');
  if (cfg.https && cfg.https.enabled) {
    console.log('HTTPS 已启用，使用加密连接传输数据');
  }
  console.log('=================================================');
  
  // 启动时加载视频缓存
  const cacheLoaded = videoCache.loadCache();
  
  if (cacheLoaded && videoCache.getVideos().length > 0) {
    // 缓存存在，直接注册视频ID
    videoIdManager.registerVideos(videoCache.getVideos());
    console.log(`使用缓存数据，如需更新请点击"刷新扫描"`);
  } else {
    // 无缓存，启动后台扫描
    console.log('正在扫描视频目录...');
    videoScanner.scanAllDirectories().catch(err => {
      console.error('初始扫描失败:', err.message);
    });
  }
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n收到中断信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
