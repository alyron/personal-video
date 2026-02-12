/**
 * 页面路由
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const videoScanner = require('../services/videoScanner');
const videoCache = require('../models/videoCache');
const videoIdManager = require('../utils/videoId');
const { requireAuth } = require('../middleware/auth');

/**
 * 渲染主页 HTML
 */
function renderIndexPage(videos, dirGroups, username, videoCount, dirCount) {
  const videoListHtml = dirGroups.map(dirName => {
    const dirVideos = videos.filter(v => v.dirName === dirName);
    return `
      <div class="video-group">
        <div class="group-header" onclick="toggleGroup(this)">
          <span class="group-name">📁 ${dirName}</span>
          <span class="group-count">${dirVideos.length} 个视频</span>
        </div>
        <div class="group-content">
          ${dirVideos.map(video => {
            const displayPath = video.relativePath.replace(/\\/g, '/');
            const videoId = require('../utils/videoId').getVideoId(video.dirName, video.relativePath);
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
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>视频列表 - 视频服务器</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header class="header">
        <h1 class="header-title">📹 视频服务器</h1>
        <div class="header-info">
            <span class="user-badge">👤 ${username}</span>
            <button id="refreshBtn" class="refresh-btn" onclick="refreshVideos()">刷新扫描</button>
            <a href="/logout" class="logout-btn">退出登录</a>
        </div>
    </header>

    <main class="main-content">
        <div class="stats-bar">
            <div class="stat-item">
                <div class="stat-number">${videoCount}</div>
                <div class="stat-label">视频总数</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${dirCount}</div>
                <div class="stat-label">目录数</div>
            </div>
            <div class="stat-item">
                <div class="stat-label" id="scanStatus">检查状态中...</div>
            </div>
        </div>

        <div class="video-list">
            ${videoCount > 0 ? videoListHtml : `
                <div class="empty-state">
                    <h3>暂无视频</h3>
                    <p>点击"刷新扫描"按钮扫描视频目录</p>
                </div>
            `}
        </div>
    </main>

    <script src="/js/app.js"></script>
    <script>
        // 切换目录展开/收起
        function toggleGroup(header) {
            const content = header.nextElementSibling;
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        }
    </script>
</body>
</html>
  `;
}

/**
 * 渲染播放器页面 HTML
 */
function renderPlayerPage(videoId) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>视频播放 - 视频服务器</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="player-container">
        <div class="player-header">
            <div class="player-header-content">
                <span class="dir-badge" id="dirBadge">📁 加载中...</span>
                <h1 class="video-title" id="videoTitle">加载中...</h1>
            </div>
            <a href="/" class="back-btn">← 返回列表</a>
        </div>

        <div class="video-wrapper">
            <video id="videoPlayer" controls preload="metadata"></video>
        </div>
    </div>

    <script src="/js/app.js"></script>
</body>
</html>
  `;
}

/**
 * 主页 - 视频列表
 */
router.get('/', requireAuth, async (req, res) => {
  // 如果缓存为空，启动后台扫描
  if (videoCache.getVideos().length === 0 && !videoCache.isScanning()) {
    console.log('缓存为空，开始扫描...');
    videoScanner.scanAllDirectories().catch(err => {
      console.error('扫描失败:', err);
    });
  }
  
  const videos = videoCache.getVideos();
  const dirGroups = [...new Set(videos.map(v => v.dirName))];
  
  const html = renderIndexPage(
    videos,
    dirGroups,
    req.session.username,
    videos.length,
    dirGroups.length
  );
  
  res.send(html);
});

/**
 * 视频播放页面
 */
router.get('/video/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  const videoInfo = videoIdManager.getVideoById(videoId);
  
  if (!videoInfo) {
    return res.status(404).send('视频不存在或已过期');
  }
  
  res.send(renderPlayerPage(videoId));
});

module.exports = router;
