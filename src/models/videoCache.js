/**
 * 视频缓存模块 - 支持持久化存储
 */
const fs = require('fs');
const path = require('path');

// 缓存数据文件路径
const CACHE_FILE = path.join(__dirname, '../../data/videoCache.json');

// 视频缓存
const videoCache = {
  videos: [],
  isScanning: false,
  lastScanTime: 0,
  scanProgress: {
    total: 0,
    current: 0
  }
};

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * 从文件加载缓存
 */
function loadCache() {
  ensureDataDir();
  
  if (!fs.existsSync(CACHE_FILE)) {
    return false;
  }
  
  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    const cached = JSON.parse(data);
    
    if (cached.videos && Array.isArray(cached.videos)) {
      videoCache.videos = cached.videos;
      videoCache.lastScanTime = cached.lastScanTime || 0;
      console.log(`已加载视频缓存: ${videoCache.videos.length} 个视频`);
      return true;
    }
  } catch (err) {
    console.error('加载视频缓存失败:', err);
  }
  
  return false;
}

/**
 * 保存缓存到文件
 */
function saveCache() {
  ensureDataDir();
  
  try {
    const data = {
      videos: videoCache.videos,
      lastScanTime: videoCache.lastScanTime,
      savedAt: Date.now()
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('保存视频缓存失败:', err);
  }
}

/**
 * 获取缓存
 * @returns {object} 视频缓存对象
 */
function getCache() {
  return videoCache;
}

/**
 * 获取视频列表
 * @returns {Array} 视频列表
 */
function getVideos() {
  return videoCache.videos;
}

/**
 * 设置视频列表
 * @param {Array} videos 视频列表
 */
function setVideos(videos) {
  videoCache.videos = videos;
}

/**
 * 设置扫描状态
 * @param {boolean} scanning 是否正在扫描
 */
function setScanning(scanning) {
  videoCache.isScanning = scanning;
}

/**
 * 是否正在扫描
 * @returns {boolean}
 */
function isScanning() {
  return videoCache.isScanning;
}

/**
 * 获取扫描状态
 * @returns {object}
 */
function getStatus() {
  return {
    isScanning: videoCache.isScanning,
    videoCount: videoCache.videos.length,
    lastScanTime: videoCache.lastScanTime
  };
}

/**
 * 更新最后扫描时间
 */
function updateLastScanTime() {
  videoCache.lastScanTime = Date.now();
}

module.exports = {
  getCache,
  getVideos,
  setVideos,
  setScanning,
  isScanning,
  getStatus,
  updateLastScanTime,
  loadCache,
  saveCache
};
