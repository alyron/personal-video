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
 * 视频信息
 */
router.post('/video-info', requireAuth, (req, res) => {
  const { videoId } = req.body;
  
  if (!videoId) {
    return res.status(400).json({ error: '缺少 videoId 参数' });
  }
  
  const info = videoStream.getVideoInfo(videoId);
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

module.exports = router;
