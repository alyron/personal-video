/**
 * 视频流服务 - 优化版：使用异步 I/O
 */
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const config = require('../config');
const videoIdManager = require('../utils/videoId');
const dirPermission = require('../utils/dirPermission');

// 内容类型映射
const CONTENT_TYPE_MAP = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

// 文件状态缓存（避免频繁 stat）
const statCache = new Map();
const STAT_CACHE_TTL = 30000; // 30秒缓存

/**
 * 调试日志输出
 */
function debugLog(...args) {
  const cfg = config.getConfig();
  if (cfg.debug) {
    console.log(...args);
  }
}

/**
 * 获取视频文件路径
 * @param {string} videoId 视频ID
 * @returns {object|null} { filePath, filename, contentType } 或 null
 */
function getVideoPath(videoId) {
  const videoInfo = videoIdManager.getVideoById(videoId);
  if (!videoInfo) {
    return null;
  }
  
  const { dirName, relativePath } = videoInfo;
  const cfg = config.getConfig();
  
  // 查找目录配置
  const dirConfig = cfg.videoDirs.find(dir => dir.name === dirName);
  if (!dirConfig) {
    return null;
  }
  
  const videoDir = path.resolve(dirConfig.path);
  const filePath = path.join(videoDir, relativePath);
  
  const filename = path.basename(relativePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPE_MAP[ext] || 'video/mp4';
  
  return { filePath, filename, contentType };
}

/**
 * 获取视频信息
 * @param {string} videoId 视频ID
 * @returns {object|null} 视频信息
 */
function getVideoInfo(videoId) {
  const videoInfo = videoIdManager.getVideoById(videoId);
  if (!videoInfo) {
    return null;
  }
  
  const pathInfo = getVideoPath(videoId);
  if (!pathInfo) {
    return null;
  }
  
  return {
    dirName: videoInfo.dirName,
    relativePath: videoInfo.relativePath,
    filename: pathInfo.filename,
    contentType: pathInfo.contentType
  };
}

/**
 * 异步获取文件状态（带缓存）
 * @param {string} filePath 文件路径
 * @returns {Promise<object|null>} 文件状态
 */
async function getFileStat(filePath) {
  const cached = statCache.get(filePath);
  if (cached && Date.now() - cached.time < STAT_CACHE_TTL) {
    return cached.stat;
  }
  
  try {
    const stat = await fsPromises.stat(filePath);
    statCache.set(filePath, { stat, time: Date.now() });
    return stat;
  } catch (err) {
    return null;
  }
}

/**
 * 同步获取文件状态（带缓存）
 * @param {string} filePath 文件路径
 * @returns {object|null} 文件状态
 */
function getFileStatSync(filePath) {
  const cached = statCache.get(filePath);
  if (cached && Date.now() - cached.time < STAT_CACHE_TTL) {
    return cached.stat;
  }
  
  try {
    const stat = fs.statSync(filePath);
    statCache.set(filePath, { stat, time: Date.now() });
    return stat;
  } catch (err) {
    return null;
  }
}

/**
 * 流式传输视频（异步版本）
 * @param {object} req Express请求对象
 * @param {object} res Express响应对象
 * @param {string} videoId 视频ID
 * @param {string} username 用户名（用于权限验证）
 */
async function streamVideoAsync(req, res, videoId, username) {
  const videoInfo = videoIdManager.getVideoById(videoId);
  if (!videoInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  // 权限验证
  if (!dirPermission.hasAccess(username, videoInfo.dirName)) {
    return res.status(403).json({ error: '无权访问该视频' });
  }
  
  const pathInfo = getVideoPath(videoId);
  if (!pathInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  const { filePath, contentType } = pathInfo;
  const stat = await getFileStat(filePath);
  
  if (!stat) {
    return res.status(404).json({ error: '视频文件不存在' });
  }
  
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    // 解析 Range 请求
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;
    
    // 验证范围
    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      return res.status(416).json({ error: '请求范围无效' });
    }
    
    debugLog(`Stream range: ${start}-${end} (${chunkSize} bytes)`);
    
    const fileStream = fs.createReadStream(filePath, { start, end });
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('视频流传输失败:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '视频流传输失败' });
      }
    });
  } else {
    // 完整文件传输
    debugLog(`Stream full file: ${filePath} (${fileSize} bytes)`);
    
    const fileStream = fs.createReadStream(filePath);
    
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('视频流传输失败:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '视频流传输失败' });
      }
    });
  }
}

/**
 * 流式传输视频（兼容同步接口）
 */
function streamVideo(req, res, videoId, username) {
  streamVideoAsync(req, res, videoId, username).catch(err => {
    console.error('视频流处理失败:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '视频流处理失败' });
    }
  });
}

/**
 * 下载视频
 * @param {object} res Express响应对象
 * @param {string} videoId 视频ID
 * @param {string} username 用户名（用于权限验证）
 */
function downloadVideo(res, videoId, username) {
  const videoInfo = videoIdManager.getVideoById(videoId);
  if (!videoInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  // 权限验证
  if (!dirPermission.hasAccess(username, videoInfo.dirName)) {
    return res.status(403).json({ error: '无权访问该视频' });
  }
  
  const pathInfo = getVideoPath(videoId);
  if (!pathInfo) {
    return res.status(404).json({ error: '视频不存在或已过期' });
  }
  
  const { filePath, filename, contentType } = pathInfo;
  const stat = getFileStatSync(filePath);
  
  if (!stat) {
    return res.status(404).json({ error: '视频文件不存在' });
  }
  
  const fileSize = stat.size;
  
  debugLog(`Download: ${filename} (${fileSize} bytes)`);
  
  // 设置下载响应头
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileSize,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-cache'
  });
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  
  fileStream.on('error', (err) => {
    console.error('视频下载失败:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '视频下载失败' });
    }
  });
}

/**
 * 清理状态缓存
 */
function clearStatCache() {
  statCache.clear();
}

module.exports = {
  getVideoPath,
  getVideoInfo,
  streamVideo,
  downloadVideo,
  clearStatCache
};
