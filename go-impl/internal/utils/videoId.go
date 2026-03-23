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
	idMap sync.Map // ID -> *model.Video
}

var (
	videoIDManager *VideoIDManager
	videoIDOnce    sync.Once
)

// GetVideoIDManager 获取视频ID管理器单例
func GetVideoIDManager() *VideoIDManager {
	videoIDOnce.Do(func() {
		videoIDManager = &VideoIDManager{}
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
	return GenerateVideoID(dirName, relativePath)
}

// GetVideoByID 通过ID获取视频信息
func (vim *VideoIDManager) GetVideoByID(videoID string) *model.Video {
	if value, ok := vim.idMap.Load(videoID); ok {
		return value.(*model.Video)
	}
	return nil
}

// RegisterVideos 批量注册视频（扫描或加载缓存时调用）
func (vim *VideoIDManager) RegisterVideos(videos []model.Video) {
	for i := range videos {
		videoID := videos[i].ID
		if videoID == "" {
			videoID = GenerateVideoID(videos[i].DirName, videos[i].RelativePath)
			videos[i].ID = videoID
		}
		v := videos[i]
		vim.idMap.Store(videoID, &v)
	}
}
