/**
 * 视频扫描服务
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const videoCache = require('../models/videoCache');

// 支持的视频扩展名
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 格式化日期
 * @param {Date} date 日期对象
 * @returns {string} 格式化后的日期
 */
function formatDate(date) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 异步递归扫描目录
 * @param {string} dirPath 目录路径
 * @param {string} dirName 目录名称
 * @param {string} dirConfigPath 配置中的路径
 * @returns {Promise<Array>} 视频列表
 */
async function scanDirectoryRecursively(dirPath, dirName, dirConfigPath) {
  const videos = [];
  const visitedDirs = new Set();
  
  async function scan(currentPath, relativePath = '') {
    // 检测循环引用
    const realPath = fs.realpathSync(currentPath);
    if (visitedDirs.has(realPath)) {
      return;
    }
    visitedDirs.add(realPath);
    
    let items;
    try {
      items = await fs.promises.readdir(currentPath);
    } catch (err) {
      console.error(`无法读取目录 ${currentPath}: ${err.message}`);
      return;
    }
    
    for (const item of items) {
      // 跳过隐藏文件
      if (item.startsWith('.')) continue;
      
      const itemPath = path.join(currentPath, item);
      const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
      
      let stat;
      try {
        stat = await fs.promises.stat(itemPath);
      } catch (err) {
        continue;
      }
      
      if (stat.isDirectory()) {
        await scan(itemPath, relativeItemPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          const pathFromRoot = path.relative(path.resolve(dirConfigPath), itemPath);
          videos.push({
            name: item,
            relativePath: relativeItemPath,
            fullPath: itemPath,
            dirName: dirName,
            size: formatFileSize(stat.size),
            sizeBytes: stat.size,
            modified: formatDate(stat.mtime),
            modifiedTime: stat.mtime.getTime()
          });
        }
      }
    }
  }
  
  await scan(dirPath);
  return videos;
}

/**
 * 扫描所有配置的目录
 * @returns {Promise<Array>} 视频列表
 */
async function scanAllDirectories() {
  if (videoCache.isScanning()) {
    console.log('扫描已在进行中...');
    return videoCache.getVideos();
  }
  
  videoCache.setScanning(true);
  videoCache.setVideos([]);
  
  console.log('开始异步扫描视频目录...');
  
  const cfg = config.getConfig();
  
  for (const dirConfig of cfg.videoDirs) {
    const videoDir = path.resolve(dirConfig.path);
    
    if (!fs.existsSync(videoDir)) {
      console.warn(`警告: 目录不存在 - ${videoDir}`);
      continue;
    }
    
    try {
      const dirStat = await fs.promises.stat(videoDir);
      if (!dirStat.isDirectory()) {
        console.warn(`警告: 路径不是目录 - ${videoDir}`);
        continue;
      }
      
      console.log(`正在扫描目录: ${dirConfig.name}...`);
      const videos = await scanDirectoryRecursively(videoDir, dirConfig.name, dirConfig.path);
      videoCache.setVideos([...videoCache.getVideos(), ...videos]);
      console.log(`✓ 扫描完成 ${dirConfig.name}: ${videos.length} 个视频`);
    } catch (err) {
      console.error(`错误: 扫描目录失败 ${dirConfig.path}: ${err.message}`);
    }
  }
  
  // 按名称排序
  videoCache.setVideos(
    videoCache.getVideos().sort((a, b) => a.name.localeCompare(b.name))
  );
  
  videoCache.setScanning(false);
  videoCache.updateLastScanTime();
  
  console.log(`=================================================`);
  console.log(`扫描完成！总计找到 ${videoCache.getVideos().length} 个视频文件`);
  console.log(`=================================================`);
  
  return videoCache.getVideos();
}

module.exports = {
  scanDirectoryRecursively,
  scanAllDirectories,
  VIDEO_EXTENSIONS
};
