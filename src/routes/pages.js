/**
 * 页面路由 - 仅处理重定向
 */
const express = require('express');
const router = express.Router();
const videoScanner = require('../services/videoScanner');
const videoCache = require('../models/videoCache');
const { requireAuth } = require('../middleware/auth');

/**
 * 主页 - 检查登录后重定向到静态页面
 */
router.get('/', requireAuth, (req, res) => {
  // 如果缓存为空，启动后台扫描
  if (videoCache.getVideos().length === 0 && !videoCache.isScanning()) {
    console.log('缓存为空，开始扫描...');
    videoScanner.scanAllDirectories().catch(err => {
      console.error('扫描失败:', err);
    });
  }
  
  // 重定向到静态主页
  res.redirect('/index.html');
});

module.exports = router;
