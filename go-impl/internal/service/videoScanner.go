// Package service 服务包
package service

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"video-server/internal/config"
	"video-server/internal/model"
	"video-server/internal/utils"
)

// 支持的视频扩展名
var videoExtensions = map[string]bool{
	".mp4":  true,
	".mkv":  true,
	".avi":  true,
	".mov":  true,
	".webm": true,
}

// VideoScanner 视频扫描服务
type VideoScanner struct {
	cache *model.VideoCache
}

var (
	videoScanner *VideoScanner
	scannerOnce  sync.Once
)

// GetVideoScanner 获取视频扫描服务单例
func GetVideoScanner() *VideoScanner {
	scannerOnce.Do(func() {
		videoScanner = &VideoScanner{
			cache: model.GetVideoCache(),
		}
	})
	return videoScanner
}

// formatFileSize 格式化文件大小
func formatFileSize(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%.2f KB", float64(bytes)/1024)
	}
	if bytes < 1024*1024*1024 {
		return fmt.Sprintf("%.2f MB", float64(bytes)/(1024*1024))
	}
	return fmt.Sprintf("%.2f GB", float64(bytes)/(1024*1024*1024))
}

// formatDate 格式化日期
func formatDate(t time.Time) string {
	return t.Format("2006/01/02 15:04")
}

// scanDirectoryRecursively 递归扫描目录
func (vs *VideoScanner) scanDirectoryRecursively(dirPath, dirName string) ([]model.Video, error) {
	var videos []model.Video
	visitedDirs := make(map[string]bool)
	
	var scan func(currentPath, relativePath string) error
	
	scan = func(currentPath, relativePath string) error {
		// 解析真实路径
		realPath, err := filepath.EvalSymlinks(currentPath)
		if err != nil {
			return nil // 无法解析路径，跳过
		}
		
		// 防止循环
		if visitedDirs[realPath] {
			return nil
		}
		visitedDirs[realPath] = true
		
		// 读取目录
		entries, err := os.ReadDir(currentPath)
		if err != nil {
			return err
		}
		
		for _, entry := range entries {
			// 跳过隐藏文件
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			
			itemPath := filepath.Join(currentPath, entry.Name())
			var relItemPath string
			if relativePath != "" {
				relItemPath = filepath.Join(relativePath, entry.Name())
			} else {
				relItemPath = entry.Name()
			}
			
			info, err := entry.Info()
			if err != nil {
				continue
			}
			
			if entry.IsDir() {
				scan(itemPath, relItemPath)
			} else {
				ext := strings.ToLower(filepath.Ext(entry.Name()))
				if videoExtensions[ext] {
					videos = append(videos, model.Video{
						Name:         entry.Name(),
						RelativePath: relItemPath,
						FullPath:     itemPath,
						DirName:      dirName,
						Size:         formatFileSize(info.Size()),
						SizeBytes:    info.Size(),
						Modified:     formatDate(info.ModTime()),
						ModifiedTime: info.ModTime().UnixMilli(),
					})
				}
			}
		}
		
		return nil
	}
	
	err := scan(dirPath, "")
	return videos, err
}

// ScanAllDirectories 扫描所有配置的目录
func (vs *VideoScanner) ScanAllDirectories() ([]model.Video, error) {
	// 检查是否已在扫描
	if vs.cache.IsScanning() {
		fmt.Println("扫描已在进行中...")
		return vs.cache.GetVideos(), nil
	}
	
	// 设置扫描锁
	vs.cache.SetScanning(true)
	defer vs.cache.SetScanning(false)
	
	fmt.Println("开始异步扫描视频目录...")
	
	cfg := config.GetConfig()
	var allVideos []model.Video
	
	for _, dirConfig := range cfg.VideoDirs {
		videoDir, err := filepath.Abs(dirConfig.Path)
		if err != nil {
			fmt.Printf("警告: 无法解析路径 - %s\n", dirConfig.Path)
			continue
		}
		
		// 检查目录是否存在
		if _, err := os.Stat(videoDir); os.IsNotExist(err) {
			fmt.Printf("警告: 目录不存在 - %s\n", videoDir)
			continue
		}
		
		// 检查是否是目录
		info, err := os.Stat(videoDir)
		if err != nil || !info.IsDir() {
			fmt.Printf("警告: 路径不是目录 - %s\n", videoDir)
			continue
		}
		
		fmt.Printf("正在扫描目录: %s...\n", dirConfig.Name)
		videos, err := vs.scanDirectoryRecursively(videoDir, dirConfig.Name)
		if err != nil {
			fmt.Printf("错误: 扫描目录失败 %s: %v\n", dirConfig.Path, err)
			continue
		}
		
		allVideos = append(allVideos, videos...)
		fmt.Printf("✓ 扫描完成 %s: %d 个视频\n", dirConfig.Name, len(videos))
	}
	
	// 按名称排序
	sort.Slice(allVideos, func(i, j int) bool {
		return allVideos[i].Name < allVideos[j].Name
	})

	// 注册视频ID（会设置 video.ID）
	utils.GetVideoIDManager().RegisterVideos(allVideos)

	// 保存到缓存
	vs.cache.SetVideos(allVideos)
	
	fmt.Println("=================================================")
	fmt.Printf("扫描完成！总计找到 %d 个视频文件\n", len(allVideos))
	fmt.Println("=================================================")
	
	return allVideos, nil
}
