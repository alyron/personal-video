const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Load configuration
const config = require('./config.json');

// Create Express app
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create users map for quick lookup
const users = {};
config.users.forEach(user => {
  users[user.username] = user.password;
});

// Session storage (in-memory, simple implementation)
const sessions = new Map();

// Video ID storage (hash ID -> { dirName, relativePath, createdAt })
const videoIdMap = new Map();

// Video cache (stores scanned videos)
const videoCache = {
  videos: [],
  isScanning: false,
  lastScanTime: 0,
  scanProgress: {
    total: 0,
    current: 0
  }
};

// Supported video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

// Recursively scan directory for video files (ASYNC)
async function scanDirectoryRecursively(dirPath, dirName, dirConfigPath) {
  const videos = [];
  const visitedDirs = new Set();

  async function scan(currentPath, relativePath = '') {
    try {
      // Resolve real path to handle symlinks
      const realPath = await fs.promises.realpath(currentPath);

      // Check for circular references
      if (visitedDirs.has(realPath)) {
        console.warn(`警告: 检测到循环引用，跳过 - ${currentPath}`);
        return;
      }

      visitedDirs.add(realPath);

      const items = await fs.promises.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const relativeItemPath = relativePath ? path.join(relativePath, item) : item;

        try {
          const stat = await fs.promises.stat(itemPath);

          if (stat.isDirectory()) {
            // Recursively scan subdirectories
            await scan(itemPath, relativeItemPath);
          } else {
            // Check if it's a video file
            const ext = path.extname(item).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
              // Get relative path from root video directory
              const pathFromRoot = path.relative(path.resolve(dirConfigPath), itemPath);

              videos.push({
                name: item,
                relativePath: relativeItemPath,
                fullPath: itemPath,
                dirName: dirName,
                dirPath: dirConfigPath,
                size: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
                modified: stat.mtime.toLocaleString('zh-CN')
              });
            }
          }
        } catch (statError) {
          console.warn(`警告: 无法读取文件 ${itemPath}: ${statError.message}`);
        }
      }

      // Remove from visited set after processing
      visitedDirs.delete(realPath);

    } catch (err) {
      console.warn(`警告: 无法读取目录 ${currentPath}: ${err.message}`);
    }
  }

  await scan(dirPath);
  return videos;
}

// Async scan all directories and update cache
async function scanAllDirectories() {
  if (videoCache.isScanning) {
    console.log('扫描已在进行中...');
    return videoCache.videos;
  }

  videoCache.isScanning = true;
  videoCache.videos = [];
  videoCache.scanProgress = { total: 0, current: 0 };

  console.log('开始异步扫描视频目录...');

  for (const dirConfig of config.videoDirs) {
    const videoDir = path.resolve(dirConfig.path);

    if (!fs.existsSync(videoDir)) {
      console.warn(`警告: 目录不存在 - ${videoDir}`);
      continue;
    }

    try {
      const dirStat = await fs.promises.stat(videoDir);
      if (!dirStat.isDirectory()) {
        console.warn(`警告: 路径不是目录 - ${videoDir}`);
        continue;
      }

      console.log(`正在扫描目录: ${dirConfig.name}...`);
      const videos = await scanDirectoryRecursively(videoDir, dirConfig.name, dirConfig.path);
      videoCache.videos.push(...videos);
      console.log(`✓ 扫描完成 ${dirConfig.name}: ${videos.length} 个视频`);

    } catch (err) {
      console.error(`错误: 扫描目录失败 ${dirConfig.path}: ${err.message}`);
    }
  }

  // Sort videos by name
  videoCache.videos.sort((a, b) => a.name.localeCompare(b.name));

  videoCache.isScanning = false;
  videoCache.lastScanTime = Date.now();

  console.log(`=================================================`);
  console.log(`扫描完成！总计找到 ${videoCache.videos.length} 个视频文件`);
  console.log(`=================================================`);

  return videoCache.videos;
}

// Generate a hash ID for video
function generateVideoId(dirName, filename) {
  const data = `${dirName}:${filename}:${Date.now()}:${Math.random()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// Get or create video ID
function getVideoId(dirName, relativePath) {
  const key = `${dirName}:${relativePath}`;

  // Check if we already have an ID for this video
  for (const [id, info] of videoIdMap.entries()) {
    if (info.dirName === dirName && info.relativePath === relativePath) {
      // Update last accessed time
      info.lastAccessed = Date.now();
      return id;
    }
  }

  // Create new ID
  const videoId = generateVideoId(dirName, relativePath);
  videoIdMap.set(videoId, {
    dirName,
    relativePath,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  });

  return videoId;
}

// Get video info by ID
function getVideoById(videoId) {
  const info = videoIdMap.get(videoId);
  if (info) {
    info.lastAccessed = Date.now();
    return info;
  }
  return null;
}

// Clean up old video IDs (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [id, info] of videoIdMap.entries()) {
    if (now - info.lastAccessed > oneHour) {
      videoIdMap.delete(id);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Middleware to check authentication
function requireAuth(req, res, next) {
  const sessionId = req.cookies.sessionId;
  if (sessionId && sessions.has(sessionId)) {
    return next();
  }
  return res.redirect('/login');
}

// Login page
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>程序测试 - 登录</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
            }
            .login-container {
                background-color: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                width: 300px;
            }
            h1 {
                text-align: center;
                color: #333;
                margin-bottom: 30px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                color: #555;
            }
            input {
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                box-sizing: border-box;
            }
            button {
                width: 100%;
                padding: 10px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            button:hover {
                background-color: #45a049;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <h1>程序测试</h1>
            <form action="/login" method="POST">
                <div class="form-group">
                    <label for="username">用户名:</label>
                    <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="password">密码:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit">登录</button>
            </form>
        </div>
    </body>
    </html>
  `);
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (users[username] && users[username] === password) {
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
    sessions.set(sessionId, { username, createdAt: Date.now() });
    res.cookie('sessionId', sessionId, { maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
    return res.redirect('/');
  }
  return res.redirect('/login?error=1');
});

// Logout
app.get('/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('sessionId');
  res.redirect('/login');
});

// Manual scan endpoint
app.post('/api/scan', requireAuth, async (req, res) => {
  try {
    const videos = await scanAllDirectories();
    res.json({ success: true, count: videos.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get scan status endpoint
app.get('/api/scan-status', requireAuth, (req, res) => {
  res.json({
    isScanning: videoCache.isScanning,
    videoCount: videoCache.videos.length,
    lastScanTime: videoCache.lastScanTime
  });
});

// Video list page (main page)
app.get('/', requireAuth, (req, res) => {
  // If cache is empty or too old, start scanning in background
  if (videoCache.videos.length === 0 && !videoCache.isScanning) {
    console.log('缓存为空，开始扫描...');
    scanAllDirectories().catch(err => {
      console.error('扫描失败:', err);
    });
  }

  // Get unique directory names for grouping
  const dirGroups = [...new Set(videoCache.videos.map(v => v.dirName))];

  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>视频列表</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header h1 {
                margin: 0;
                color: #333;
            }
            .scan-btn {
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            .scan-btn:hover {
                background-color: #45a049;
            }
            .scan-btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            .scan-status {
                margin-right: 10px;
                font-size: 14px;
                color: #666;
            }
            .logout-btn {
                padding: 10px 20px;
                background-color: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
            }
            .logout-btn:hover {
                background-color: #da190b;
            }
            .video-list {
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .dir-group {
                margin-bottom: 30px;
            }
            .dir-header {
                background-color: #4CAF50;
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                margin-bottom: 15px;
                font-size: 16px;
                font-weight: bold;
            }
            .video-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid #eee;
                transition: background-color 0.3s;
            }
            .video-item:last-child {
                border-bottom: none;
            }
            .video-item:hover {
                background-color: #f9f9f9;
            }
            .video-info {
                flex: 1;
            }
            .video-path {
                font-size: 12px;
                color: #999;
                margin-bottom: 3px;
                font-family: 'Courier New', monospace;
            }
            .video-name {
                font-size: 18px;
                color: #333;
                margin-bottom: 5px;
            }
            .video-meta {
                font-size: 14px;
                color: #666;
            }
            .watch-btn {
                padding: 8px 20px;
                background-color: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
            }
            .watch-btn:hover {
                background-color: #0b7dda;
            }
            .empty {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            .stats {
                margin-top: 20px;
                padding: 15px;
                background-color: #e3f2fd;
                border-radius: 5px;
                color: #1976d2;
            }
            .loading {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            .loading-spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📺 视频列表</h1>
            <div>
                <span class="scan-status" id="scanStatus">视频: ${videoCache.videos.length} 个</span>
                <button class="scan-btn" onclick="startScan()" id="scanBtn">🔄 刷新扫描</button>
            </div>
            <a href="/logout" class="logout-btn">退出登录</a>
        </div>
        <div class="video-list">
            ${videoCache.videos.length === 0 ?
                '<div class="loading"><div class="loading-spinner"></div><p>正在扫描视频...</p></div>' :
                `
                <div class="stats">
                    共找到 ${videoCache.videos.length} 个视频文件，来自 ${dirGroups.length} 个目录
                </div>
                ` + dirGroups.map(dirName => {
                  const dirVideos = videoCache.videos.filter(v => v.dirName === dirName);
                  return `
                    <div class="dir-group">
                        <div class="dir-header">📁 ${dirName} (${dirVideos.length} 个视频)</div>
                        ${dirVideos.map(video => {
                          const videoId = getVideoId(video.dirName, video.relativePath);
                          const displayPath = video.relativePath.replace(/\\/g, '/');
                          return `
                            <div class="video-item">
                                <div class="video-info">
                                    ${displayPath !== video.name ? `<div class="video-path">📂 ${displayPath}</div>` : ''}
                                    <div class="video-name">${video.name}</div>
                                    <div class="video-meta">大小: ${video.size} | 修改时间: ${video.modified}</div>
                                </div>
                                <a href="/video/${videoId}" class="watch-btn">观看</a>
                            </div>
                          `;
                        }).join('')}
                    </div>
                  `;
                }).join('')
            }
        </div>
        <script>
            async function startScan() {
                const btn = document.getElementById('scanBtn');
                const status = document.getElementById('scanStatus');

                btn.disabled = true;
                btn.textContent = '⏳ 扫描中...';

                try {
                    const response = await fetch('/api/scan', {
                        method: 'POST'
                    });
                    const result = await response.json();

                    if (result.success) {
                        alert(\`扫描完成！找到 \${result.count} 个视频文件\`);
                        location.reload();
                    } else {
                        alert('扫描失败: ' + result.error);
                    }
                } catch (error) {
                    alert('扫描失败: ' + error.message);
                }

                btn.disabled = false;
                btn.textContent = '🔄 刷新扫描';
            }

            // Auto-refresh status every 3 seconds if scanning
            setInterval(async () => {
                try {
                    const response = await fetch('/api/scan-status');
                    const status = await response.json();

                    if (status.isScanning) {
                        document.getElementById('scanBtn').textContent = '⏳ 扫描中...';
                        document.getElementById('scanBtn').disabled = true;
                        document.getElementById('scanStatus').textContent = '扫描中...';
                    } else {
                        document.getElementById('scanBtn').disabled = false;
                        document.getElementById('scanBtn').textContent = '🔄 刷新扫描';
                        document.getElementById('scanStatus').textContent = \`视频: \${status.videoCount} 个\`;
                    }
                } catch (error) {
                    console.error('Failed to get scan status:', error);
                }
            }, 3000);
        </script>
    </body>
    </html>
  `);
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Video info endpoint (GET video metadata by ID)
app.post('/video-info', requireAuth, (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: '缺少 videoId 参数' });
  }

  // Get video info by ID
  const videoInfo = getVideoById(videoId);
  if (!videoInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }

  // Get file extension for content type
  const ext = path.extname(videoInfo.relativePath).toLowerCase();
  const contentTypeMap = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm'
  };
  const contentType = contentTypeMap[ext] || 'video/mp4';

  // Return video info (including filename for display)
  res.json({
    dirName: videoInfo.dirName,
    relativePath: videoInfo.relativePath,
    filename: path.basename(videoInfo.relativePath),
    contentType: contentType
  });
});

// Video player page
app.get('/video/:videoId', requireAuth, (req, res) => {
  const videoId = req.params.videoId;

  // Get video info by ID
  const videoInfo = getVideoById(videoId);
  if (!videoInfo) {
    return res.status(404).send('视频不存在或已过期');
  }

  const dirName = videoInfo.dirName;

  // Serve player HTML
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// GET video stream endpoint with Range support
app.get('/video/:videoId', requireAuth, (req, res) => {
  const videoId = req.params.videoId;

  if (!videoId) {
    return res.status(400).json({ error: '缺少 videoId 参数' });
  }

  // Get video info by ID
  const videoInfo = getVideoById(videoId);
  if (!videoInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }

  const dirName = videoInfo.dirName;
  const relativePath = videoInfo.relativePath;

  // Find directory config by name
  const dirConfig = config.videoDirs.find(dir => dir.name === dirName);
  if (!dirConfig) {
    return res.status(404).json({ error: '目录配置不存在' });
  }

  const videoDir = path.resolve(dirConfig.path);
  const filePath = path.join(videoDir, relativePath);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '视频文件不存在' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  // Get filename from relative path for display
  const filename = path.basename(relativePath);

  // Determine content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  const contentTypeMap = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm'
  };
  const contentType = contentTypeMap[ext] || 'video/mp4';

  // Check for Range header (for seeking/skipping)
  const range = req.headers.range;

  if (range) {
    // Parse Range header: "bytes=start-end"
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;

    // Validate range
    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      return res.status(416).json({ error: '请求范围无效' });
    }

    console.log(`Stream range: ${start}-${end} (${chunksize} bytes)`);

    // Create read stream for requested range
    const fileStream = fs.createReadStream(filePath, { start, end });

    // Set headers for partial content
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Duration': Math.floor(fileSize / 1000000)
    });

    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('Error streaming video:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '视频流传输失败' });
      }
    });
  } else {
    // No Range header, stream entire file
    console.log(`Stream full file: ${filePath} (${fileSize} bytes)`);

    const fileStream = fs.createReadStream(filePath);

    // Set headers for full content
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Duration': Math.floor(fileSize / 1000000)
    });

    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('Error streaming video:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '视频流传输失败' });
      }
    });
  }
});

// Create server (HTTP or HTTPS based on configuration)
const port = config.port || 18899;
const host = config.host || '::';

let server;

if (config.https && config.https.enabled) {
  // HTTPS server
  try {
    const httpsOptions = {
      key: fs.readFileSync(config.https.key),
      cert: fs.readFileSync(config.https.cert)
    };
    server = https.createServer(httpsOptions, app);
  } catch (err) {
    console.error('错误: 无法读取SSL证书文件');
    console.error('请确保以下文件存在:');
    console.log(`  - ${config.https.key}`);
    console.log(`  - ${config.https.cert}`);
    console.log('');
    console.log('可以使用以下命令生成自签名证书:');
    console.log('  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes');
    process.exit(1);
  }
} else {
  // HTTP server
  server = http.createServer(app);
}

// Start server
server.listen(port, host, () => {
  console.log('=================================================');
  console.log('视频服务已启动！');
  console.log('=================================================');
  console.log(`协议: ${config.https && config.https.enabled ? 'HTTPS' : 'HTTP'}`);
  console.log(`访问地址 (IPv6): ${(config.https && config.https.enabled ? 'https' : 'http'}://[::1]:${port}`);
  console.log(`访问地址 (IPv4): ${(config.https && config.https.enabled ? 'https' : 'http'}://127.0.0.1:${port}`);
  console.log(`访问地址 (本地网络 IPv4): ${(config.https && config.https.enabled ? 'https' : 'http'}://<本机IP>:${port}`);
  console.log(`访问地址 (本地网络 IPv6): ${(config.https && config.https.enabled ? 'https' : 'http'}://[本机IPv6地址>:${port}`);
  console.log('=================================================');
  console.log('默认登录信息:');
  console.log('用户名: admin');
  console.log('密码: password123');
  console.log('=================================================');
  console.log('提示: 可以修改 config.json 文件来更改用户名、密码和其他设置');
  if (config.https && config.https.enabled) {
    console.log('HTTPS已启用，使用加密连接传输数据');
  }
  console.log('=================================================');
  console.log('开始初始化视频扫描（异步）...');
  scanAllDirectories().catch(err => {
    console.error('初始化扫描失败:', err);
  });
  console.log('=================================================');
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`错误: 端口 ${port} 已被占用，请更换端口或关闭占用该端口的程序`);
  } else {
    console.error('服务器错误:', err);
  }
});
