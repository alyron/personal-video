/**
 * 视频缓存模块 - 异步 I/O 版本
 */
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// 缓存数据文件路径
const CACHE_FILE = path.join(__dirname, '../../data/videoCache.json');
const SCAN_LOCK_FILE = path.join(__dirname, '../../data/.scan-lock');

// 内存缓存
let cacheData = {
  videos: [],
  lastScanTime: 0
};
let isScanningFlag = false;

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  const dataDir = path.dirname(CACHE_FILE);
  await fs.mkdir(dataDir, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/**
 * 读取缓存数据
 */
async function readCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    cacheData = JSON.parse(data);
    return cacheData;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cacheData = { videos: [], lastScanTime: 0 };
      return cacheData;
    }
    console.error('读取视频缓存失败:', err);
    return cacheData;
  }
}

/**
 * 保存缓存数据
 */
async function saveCache(data) {
  await ensureDataDir();
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('保存视频缓存失败:', err);
  }
}

/**
 * 获取视频列表（同步，从内存返回）
 * @returns {Array} 视频列表
 */
function getVideos() {
  return cacheData.videos || [];
}

/**
 * 设置视频列表（异步）
 * @param {Array} videos 视频列表
 */
async function setVideos(videos) {
  cacheData.videos = videos;
  cacheData.lastScanTime = Date.now();
  await saveCache(cacheData);
}

/**
 * 检查是否正在扫描
 * @returns {boolean}
 */
function isScanning() {
  if (!isScanningFlag) return false;
  
  // 检查锁是否超时（10分钟）
  if (!fsSync.existsSync(SCAN_LOCK_FILE)) {
    isScanningFlag = false;
    return false;
  }
  
  try {
    const lockData = JSON.parse(fsSync.readFileSync(SCAN_LOCK_FILE, 'utf8'));
    if (Date.now() - lockData.lockedAt > 10 * 60 * 1000) {
      fsSync.unlinkSync(SCAN_LOCK_FILE);
      isScanningFlag = false;
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 设置扫描状态
 * @param {boolean} scanning 是否正在扫描
 */
async function setScanning(scanning) {
  await ensureDataDir();
  isScanningFlag = scanning;
  
  if (scanning) {
    await fs.writeFile(SCAN_LOCK_FILE, JSON.stringify({
      lockedAt: Date.now()
    }), 'utf8');
  } else {
    try {
      await fs.unlink(SCAN_LOCK_FILE);
    } catch (err) {
      // 忽略文件不存在的错误
    }
  }
}

/**
 * 从文件加载缓存（启动时调用）
 * @returns {Promise<boolean>} 是否加载成功
 */
async function loadCache() {
  const cache = await readCache();
  
  if (cache.videos && cache.videos.length > 0) {
    console.log(`已加载视频缓存: ${cache.videos.length} 个视频`);
    return true;
  }
  
  return false;
}

/**
 * 获取缓存状态
 * @returns {object}
 */
function getStatus() {
  return {
    isScanning: isScanningFlag,
    videoCount: (cacheData.videos || []).length,
    lastScanTime: cacheData.lastScanTime || 0
  };
}

/**
 * 更新最后扫描时间
 */
async function updateLastScanTime() {
  cacheData.lastScanTime = Date.now();
  await saveCache(cacheData);
}

module.exports = {
  getVideos,
  setVideos,
  setScanning,
  isScanning,
  getStatus,
  updateLastScanTime,
  loadCache,
  saveCache
};
