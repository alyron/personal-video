/**
 * API 路由
 */
const express = require('express');
const router = express.Router();
const videoScanner = require('../services/videoScanner');
const videoCache = require('../models/videoCache');
const videoStream = require('../services/videoStream');
const videoIdManager = require('../utils/videoId');
const favoriteManager = require('../models/favorite');
const dirPermission = require('../utils/dirPermission');
const { requireAuth } = require('../middleware/auth');

/**
 * 获取视频列表
 */
router.get('/videos', requireAuth, (req, res) => {
  const username = req.session.username;
  const allVideos = videoCache.getVideos();
  
  // 根据用户权限过滤视频
  const videos = dirPermission.filterVideosByPermission(allVideos, username);
  const dirGroups = [...new Set(videos.map(v => v.dirName))];
  
  // 为每个视频添加 ID
  const videosWithId = videos.map(video => ({
    ...video,
    id: videoIdManager.getVideoId(video.dirName, video.relativePath)
  }));
  
  res.json({
    videos: videosWithId,
    videoCount: videos.length,
    dirCount: dirGroups.length
  });
});

/**
 * 手动扫描
 */
router.post('/scan', requireAuth, async (req, res) => {
  try {
    const videos = await videoScanner.scanAllDirectories();
    res.json({ success: true, count: videos.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 扫描状态
 */
router.get('/scan-status', requireAuth, (req, res) => {
  res.json(videoCache.getStatus());
});

/**
 * 视频信息 (改为 GET 请求)
 */
router.get('/video-info', requireAuth, (req, res) => {
  const { id } = req.query;
  const username = req.session.username;
  
  if (!id) {
    return res.status(400).json({ error: '缺少 id 参数' });
  }
  
  const info = videoStream.getVideoInfo(id);
  if (!info) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  // 权限验证
  if (!dirPermission.hasAccess(username, info.dirName)) {
    return res.status(403).json({ error: '无权访问该视频' });
  }
  
  res.json(info);
});

/**
 * 视频流 (需要认证)
 */
router.get('/stream/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  const username = req.session.username;
  videoStream.streamVideo(req, res, videoId, username);
});

/**
 * 视频下载 (需要认证)
 */
router.get('/download/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  const username = req.session.username;
  videoStream.downloadVideo(res, videoId, username);
});

/**
 * 获取收藏列表
 */
router.get('/favorites', requireAuth, (req, res) => {
  const username = req.session.username;
  const favorites = favoriteManager.getFavorites(username);
  res.json({ favorites });
});

/**
 * 添加收藏
 */
router.post('/favorite', requireAuth, (req, res) => {
  const username = req.session.username;
  const { videoId, dirName, filename } = req.body;
  
  if (!videoId) {
    return res.status(400).json({ error: '缺少 videoId' });
  }
  
  const success = favoriteManager.addFavorite(username, { 
    videoId, 
    dirName, 
    filename 
  });
  
  res.json({ success });
});

/**
 * 取消收藏
 */
router.delete('/favorite/:videoId', requireAuth, (req, res) => {
  const username = req.session.username;
  const { videoId } = req.params;
  
  const success = favoriteManager.removeFavorite(username, videoId);
  res.json({ success });
});

/**
 * 检查是否已收藏
 */
router.get('/favorite/check/:videoId', requireAuth, (req, res) => {
  const username = req.session.username;
  const { videoId } = req.params;
  
  const isFav = favoriteManager.isFavorite(username, videoId);
  res.json({ isFavorite: isFav });
});

/**
 * 获取同目录下的其他视频
 */
router.get('/sibling-videos', requireAuth, (req, res) => {
  const { id } = req.query;
  const username = req.session.username;
  
  if (!id) {
    return res.status(400).json({ error: '缺少 id 参数' });
  }
  
  const currentVideoInfo = videoIdManager.getVideoById(id);
  if (!currentVideoInfo) {
    return res.status(404).json({ error: '视频不存在' });
  }
  
  // 权限验证
  if (!dirPermission.hasAccess(username, currentVideoInfo.dirName)) {
    return res.status(403).json({ error: '无权访问' });
  }
  
  const { dirName, relativePath } = currentVideoInfo;
  const path = require('path');
  
  // 获取当前视频所在目录（relativePath 去掉文件名）
  const currentDir = path.dirname(relativePath);
  const currentFilename = path.basename(relativePath);
  
  // 从缓存中获取同目录下的其他视频
  const allVideos = videoCache.getVideos();
  const siblingVideos = allVideos
    .filter(video => {
      // 同一目录且不是当前视频
      const videoDir = path.dirname(video.relativePath);
      return video.dirName === dirName && 
             videoDir === currentDir && 
             path.basename(video.relativePath) !== currentFilename;
    })
    .map(video => ({
      id: videoIdManager.getVideoId(video.dirName, video.relativePath),
      filename: path.basename(video.relativePath),
      relativePath: video.relativePath
    }))
    // 按文件名排序
    .sort((a, b) => a.filename.localeCompare(b.filename, 'zh-CN', { numeric: true }));
  
  res.json({ videos: siblingVideos, currentDir });
});

module.exports = router;
