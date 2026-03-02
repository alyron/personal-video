/**
 * 目录权限检查工具
 * 
 * 权限规则：
 * - 如果目录没有配置 allowedUsers，则对所有用户开放
 * - 如果配置了 allowedUsers，则只有列表中的用户可以访问
 */
const config = require('../config');

/**
 * 检查用户是否有权限访问指定目录
 * @param {string} username 用户名
 * @param {string} dirName 目录名称
 * @returns {boolean} 是否有权限
 */
function hasAccess(username, dirName) {
  const cfg = config.getConfig();
  const dirConfig = cfg.videoDirs.find(dir => dir.name === dirName);
  
  // 目录不存在配置中，拒绝访问
  if (!dirConfig) {
    return false;
  }
  
  // 如果没有配置 allowedUsers，则对所有用户开放
  if (!dirConfig.allowedUsers || !Array.isArray(dirConfig.allowedUsers)) {
    return true;
  }
  
  // 如果配置了 allowedUsers，检查用户是否在列表中
  return dirConfig.allowedUsers.includes(username);
}

/**
 * 获取用户有权限访问的目录名称列表
 * @param {string} username 用户名
 * @returns {Array<string>} 有权限的目录名称列表
 */
function getAccessibleDirs(username) {
  const cfg = config.getConfig();
  
  return cfg.videoDirs
    .filter(dir => !dir.allowedUsers || !Array.isArray(dir.allowedUsers) || dir.allowedUsers.includes(username))
    .map(dir => dir.name);
}

/**
 * 过滤视频列表，只保留用户有权限访问的视频
 * @param {Array} videos 视频列表
 * @param {string} username 用户名
 * @returns {Array} 过滤后的视频列表
 */
function filterVideosByPermission(videos, username) {
  const accessibleDirs = getAccessibleDirs(username);
  return videos.filter(video => accessibleDirs.includes(video.dirName));
}

module.exports = {
  hasAccess,
  getAccessibleDirs,
  filterVideosByPermission
};
