/**
 * 视频ID管理模块
 * 
 * ID 生成规则：基于 dirName:relativePath 生成确定性哈希
 * 同一视频文件始终生成相同的 ID，确保收藏等功能持久有效
 */
const crypto = require('crypto');

// 视频ID映射 (hash ID -> { dirName, relativePath })
const videoIdMap = new Map();

/**
 * 生成确定性视频ID
 * @param {string} dirName 目录名
 * @param {string} relativePath 相对路径
 * @returns {string} 16字符哈希ID
 */
function generateVideoId(dirName, relativePath) {
  const data = `${dirName}:${relativePath}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * 获取或创建视频ID
 * @param {string} dirName 目录名
 * @param {string} relativePath 相对路径
 * @returns {string} 视频ID
 */
function getVideoId(dirName, relativePath) {
  // 生成确定性 ID
  const videoId = generateVideoId(dirName, relativePath);
  
  // 存储映射关系（用于反向查找）
  if (!videoIdMap.has(videoId)) {
    videoIdMap.set(videoId, {
      dirName,
      relativePath
    });
  }
  
  return videoId;
}

/**
 * 通过ID获取视频信息
 * @param {string} videoId 视频ID
 * @returns {object|null} 视频信息
 */
function getVideoById(videoId) {
  return videoIdMap.get(videoId) || null;
}

/**
 * 注册视频信息（用于启动时重建映射）
 * @param {string} videoId 视频ID
 * @param {string} dirName 目录名
 * @param {string} relativePath 相对路径
 */
function registerVideo(videoId, dirName, relativePath) {
  videoIdMap.set(videoId, { dirName, relativePath });
}

/**
 * 批量注册视频（扫描完成后调用）
 * @param {Array} videos 视频列表
 */
function registerVideos(videos) {
  videos.forEach(video => {
    const videoId = generateVideoId(video.dirName, video.relativePath);
    videoIdMap.set(videoId, {
      dirName: video.dirName,
      relativePath: video.relativePath
    });
  });
}

module.exports = {
  generateVideoId,
  getVideoId,
  getVideoById,
  registerVideo,
  registerVideos
};
