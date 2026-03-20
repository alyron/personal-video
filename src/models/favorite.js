/**
 * 收藏管理模块 - 异步 I/O + 5分钟TTL缓存
 */
const fs = require('fs').promises;
const path = require('path');

// 收藏数据文件路径
const FAVORITES_FILE = path.join(__dirname, '../../data/favorites.json');

// 缓存配置
const CACHE_TTL = 5 * 60 * 1000; // 5分钟
let cache = {
  data: null,
  time: 0
};

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  const dataDir = path.dirname(FAVORITES_FILE);
  await fs.mkdir(dataDir, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/**
 * 检查缓存是否有效
 */
function isCacheValid() {
  return cache.data !== null && (Date.now() - cache.time) < CACHE_TTL;
}

/**
 * 读取收藏数据（带缓存）
 */
async function readFavorites() {
  // 缓存命中
  if (isCacheValid()) {
    return cache.data;
  }
  
  // 缓存未命中，从文件读取
  try {
    const data = await fs.readFile(FAVORITES_FILE, 'utf8');
    cache.data = JSON.parse(data);
    cache.time = Date.now();
    return cache.data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.data = {};
      cache.time = Date.now();
      return cache.data;
    }
    console.error('读取收藏数据失败:', err);
    return {};
  }
}

/**
 * 写入收藏数据（同时更新缓存）
 */
async function writeFavorites(data) {
  await ensureDataDir();
  await fs.writeFile(FAVORITES_FILE, JSON.stringify(data, null, 2), 'utf8');
  // 写入后更新缓存
  cache.data = data;
  cache.time = Date.now();
}

/**
 * 获取用户收藏列表
 * @param {string} username 用户名
 * @returns {Promise<Array>} 收藏列表
 */
async function getFavorites(username) {
  const data = await readFavorites();
  return data[username] || [];
}

/**
 * 添加收藏
 * @param {string} username 用户名
 * @param {object} videoInfo 视频信息 { videoId, dirName, filename }
 * @returns {Promise<boolean>} 是否成功
 */
async function addFavorite(username, videoInfo) {
  const data = await readFavorites();
  
  if (!data[username]) {
    data[username] = [];
  }
  
  // 检查是否已收藏
  const exists = data[username].some(f => f.videoId === videoInfo.videoId);
  if (exists) {
    return false;
  }
  
  data[username].push({
    videoId: videoInfo.videoId,
    dirName: videoInfo.dirName,
    filename: videoInfo.filename,
    addedAt: Date.now()
  });
  
  await writeFavorites(data);
  return true;
}

/**
 * 移除收藏
 * @param {string} username 用户名
 * @param {string} videoId 视频ID
 * @returns {Promise<boolean>} 是否成功
 */
async function removeFavorite(username, videoId) {
  const data = await readFavorites();
  
  if (!data[username]) {
    return false;
  }
  
  const index = data[username].findIndex(f => f.videoId === videoId);
  if (index === -1) {
    return false;
  }
  
  data[username].splice(index, 1);
  await writeFavorites(data);
  return true;
}

/**
 * 检查是否已收藏
 * @param {string} username 用户名
 * @param {string} videoId 视频ID
 * @returns {Promise<boolean>}
 */
async function isFavorite(username, videoId) {
  const data = await readFavorites();
  if (!data[username]) return false;
  return data[username].some(f => f.videoId === videoId);
}

/**
 * 清除缓存（用于测试或强制刷新）
 */
function clearCache() {
  cache.data = null;
  cache.time = 0;
}

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  clearCache
};
