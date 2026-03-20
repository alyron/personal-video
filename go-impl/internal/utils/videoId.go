// Package utils 工具包
package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"

	"video-server/internal/model"
)

// VideoIDManager 视频ID管理器
type VideoIDManager struct {
	idMap map[string]*model.Video // ID -> Video
	mu    sync.RWMutex
}

var (
	videoIDManager *VideoIDManager
	videoIDOnce    sync.Once
)

// GetVideoIDManager 获取视频ID管理器单例
func GetVideoIDManager() *VideoIDManager {
	videoIDOnce.Do(func() {
		videoIDManager = &VideoIDManager{
			idMap: make(map[string]*model.Video),
		}
	})
	return videoIDManager
}

// GenerateVideoID 生成确定性视频ID
func GenerateVideoID(dirName, relativePath string) string {
	data := dirName + ":" + relativePath
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])[:16]
}

// GetVideoID 获取或创建视频ID
func (vim *VideoIDManager) GetVideoID(dirName, relativePath string) string {
	videoID := GenerateVideoID(dirName, relativePath)
	
	vim.mu.Lock()
	defer vim.mu.Unlock()
	
	if _, ok := vim.idMap[videoID]; !ok {
		vim.idMap[videoID] = &model.Video{
			DirName:      dirName,
			RelativePath: relativePath,
		}
	}
	
	return videoID
}

// GetVideoByID 通过ID获取视频信息
func (vim *VideoIDManager) GetVideoByID(videoID string) *model.Video {
	vim.mu.RLock()
	defer vim.mu.RUnlock()
	
	video, ok := vim.idMap[videoID]
	if !ok {
		return nil
	}
	return video
}

// RegisterVideos 批量注册视频
func (vim *VideoIDManager) RegisterVideos(videos []model.Video) {
	vim.mu.Lock()
	defer vim.mu.Unlock()
	
	for _, video := range videos {
		videoID := GenerateVideoID(video.DirName, video.RelativePath)
		v := video // 创建副本
		vim.idMap[videoID] = &v
	}
}
