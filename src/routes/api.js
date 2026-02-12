/**
 * API 路由
 */
const express = require('express');
const router = express.Router();
const videoScanner = require('../services/videoScanner');
const videoCache = require('../models/videoCache');
const videoStream = require('../services/videoStream');
const videoIdManager = require('../utils/videoId');
const { requireAuth } = require('../middleware/auth');

/**
 * 获取视频列表
 */
router.get('/videos', requireAuth, (req, res) => {
  const videos = videoCache.getVideos();
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
  
  if (!id) {
    return res.status(400).json({ error: '缺少 id 参数' });
  }
  
  const info = videoStream.getVideoInfo(id);
  if (!info) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  res.json(info);
});

/**
 * 视频流
 */
router.get('/stream/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  videoStream.streamVideo(req, res, videoId);
});

/**
 * 视频下载
 */
router.get('/download/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  videoStream.downloadVideo(res, videoId);
});

module.exports = router;
