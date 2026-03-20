/**
 * 视频扫描服务
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const videoCache = require('../models/videoCache');
const videoIdManager = require('../utils/videoId');

// 支持的视频扩展名
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 格式化日期
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
 */
async function scanDirectoryRecursively(dirPath, dirName, dirConfigPath) {
  const videos = [];
  const visitedDirs = new Set();
  
  async function scan(currentPath, relativePath = '') {
    let realPath;
    try {
      realPath = await fs.promises.realpath(currentPath);
    } catch (err) {
      return; // 无法解析路径，跳过
    }
    if (visitedDirs.has(realPath)) return;
    visitedDirs.add(realPath);
    
    let items;
    try {
      items = await fs.promises.readdir(currentPath);
    } catch (err) {
      console.error(`无法读取目录 ${currentPath}: ${err.message}`);
      return;
    }
    
    for (const item of items) {
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
 */
async function scanAllDirectories() {
  // 检查是否已在扫描（通过文件锁）
  if (videoCache.isScanning()) {
    console.log('扫描已在进行中...');
    return videoCache.getVideos();
  }
  
  // 设置扫描锁
  await videoCache.setScanning(true);
  
  console.log('开始异步扫描视频目录...');
  
  const cfg = config.getConfig();
  const allVideos = [];
  
  try {
    for (const dirConfig of cfg.videoDirs) {
      const videoDir = path.resolve(dirConfig.path);
      
      let exists;
      try {
        await fs.promises.access(videoDir);
        exists = true;
      } catch {
        exists = false;
      }
      
      if (!exists) {
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
        allVideos.push(...videos);
        console.log(`✓ 扫描完成 ${dirConfig.name}: ${videos.length} 个视频`);
      } catch (err) {
        console.error(`错误: 扫描目录失败 ${dirConfig.path}: ${err.message}`);
      }
    }
    
    // 按名称排序
    allVideos.sort((a, b) => a.name.localeCompare(b.name));
    
    // 一次性写入缓存文件
    await videoCache.setVideos(allVideos);
    
    // 注册所有视频ID
    videoIdManager.registerVideos(allVideos);
    
    console.log(`=================================================`);
    console.log(`扫描完成！总计找到 ${allVideos.length} 个视频文件`);
    console.log(`=================================================`);
    
    return allVideos;
  } finally {
    // 无论成功失败，都释放扫描锁
    await videoCache.setScanning(false);
  }
}

module.exports = {
  scanDirectoryRecursively,
  scanAllDirectories,
  VIDEO_EXTENSIONS
};
