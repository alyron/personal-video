/**
 * 视频ID管理模块
 */
const crypto = require('crypto');

// 视频ID映射 (hash ID -> { dirName, relativePath, createdAt })
const videoIdMap = new Map();

/**
 * 生成视频ID
 * @param {string} dirName 目录名
 * @param {string} filename 文件名
 * @returns {string} 16字符哈希ID
 */
function generateVideoId(dirName, filename) {
  const data = `${dirName}:${filename}:${Date.now()}:${Math.random()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * 获取或创建视频ID
 * @param {string} dirName 目录名
 * @param {string} relativePath 相对路径
 * @returns {string} 视频ID
 */
function getVideoId(dirName, relativePath) {
  // 检查是否已有ID
  for (const [id, info] of videoIdMap.entries()) {
    if (info.dirName === dirName && info.relativePath === relativePath) {
      info.lastAccessed = Date.now();
      return id;
    }
  }
  
  // 创建新ID
  const videoId = generateVideoId(dirName, relativePath);
  videoIdMap.set(videoId, {
    dirName,
    relativePath,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  });
  
  return videoId;
}

/**
 * 通过ID获取视频信息
 * @param {string} videoId 视频ID
 * @returns {object|null} 视频信息
 */
function getVideoById(videoId) {
  const info = videoIdMap.get(videoId);
  if (info) {
    info.lastAccessed = Date.now();
    return info;
  }
  return null;
}

/**
 * 清理过期视频ID (超过1小时未访问)
 */
function cleanupExpiredIds() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [id, info] of videoIdMap.entries()) {
    if (now - info.lastAccessed > oneHour) {
      videoIdMap.delete(id);
    }
  }
}

// 每小时清理一次
setInterval(cleanupExpiredIds, 60 * 60 * 1000);

module.exports = {
  generateVideoId,
  getVideoId,
  getVideoById,
  cleanupExpiredIds
};
