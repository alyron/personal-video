/**
 * 视频缓存模块
 */
const videoCache = {
  videos: [],
  isScanning: false,
  lastScanTime: 0,
  scanProgress: {
    total: 0,
    current: 0
  }
};

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
  updateLastScanTime
};
