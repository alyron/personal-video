/**
 * 收藏管理模块 - 使用 JSON 文件存储
 */
const fs = require('fs');
const path = require('path');

// 收藏数据文件路径
const FAVORITES_FILE = path.join(__dirname, '../../data/favorites.json');

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.dirname(FAVORITES_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 读取收藏数据
function readFavorites() {
  ensureDataDir();
  
  if (!fs.existsSync(FAVORITES_FILE)) {
    return {};
  }
  
  try {
    const data = fs.readFileSync(FAVORITES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('读取收藏数据失败:', err);
    return {};
  }
}

// 写入收藏数据
function writeFavorites(data) {
  ensureDataDir();
  fs.writeFileSync(FAVORITES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 获取用户收藏列表
 * @param {string} username 用户名
 * @returns {Array} 收藏列表
 */
function getFavorites(username) {
  const data = readFavorites();
  return data[username] || [];
}

/**
 * 添加收藏
 * @param {string} username 用户名
 * @param {object} videoInfo 视频信息 { videoId, dirName, relativePath, filename, addedAt }
 * @returns {boolean} 是否成功
 */
function addFavorite(username, videoInfo) {
  const data = readFavorites();
  
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
  
  writeFavorites(data);
  return true;
}

/**
 * 移除收藏
 * @param {string} username 用户名
 * @param {string} videoId 视频ID
 * @returns {boolean} 是否成功
 */
function removeFavorite(username, videoId) {
  const data = readFavorites();
  
  if (!data[username]) {
    return false;
  }
  
  const index = data[username].findIndex(f => f.videoId === videoId);
  if (index === -1) {
    return false;
  }
  
  data[username].splice(index, 1);
  writeFavorites(data);
  return true;
}

/**
 * 检查是否已收藏
 * @param {string} username 用户名
 * @param {string} videoId 视频ID
 * @returns {boolean}
 */
function isFavorite(username, videoId) {
  const data = readFavorites();
  if (!data[username]) return false;
  return data[username].some(f => f.videoId === videoId);
}

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorite
};
