// Package model 数据模型
package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Video 视频信息
type Video struct {
	Name         string `json:"name"`
	RelativePath string `json:"relativePath"`
	FullPath     string `json:"fullPath"`
	DirName      string `json:"dirName"`
	Size         string `json:"size"`
	SizeBytes    int64  `json:"sizeBytes"`
	Modified     string `json:"modified"`
	ModifiedTime int64  `json:"modifiedTime"`
	ID           string `json:"id"` // 预计算的ID
}

// CacheData 缓存数据
type CacheData struct {
	Videos       []Video `json:"videos"`
	LastScanTime int64   `json:"lastScanTime"`
}

// VideoCache 视频缓存
type VideoCache struct {
	filePath   string
	lockPath   string
	data       atomic.Pointer[CacheData]
	isScanning atomic.Bool

	// 预序列化的JSON缓存
	jsonCache atomic.Pointer[[]byte]
}

var (
	videoCache *VideoCache
	cacheOnce  sync.Once
)

// GetVideoCache 获取视频缓存单例
func GetVideoCache() *VideoCache {
	cacheOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		videoCache = &VideoCache{
			filePath: filepath.Join(baseDir, "data", "videoCache.json"),
			lockPath: filepath.Join(baseDir, "data", ".scan-lock"),
		}
		videoCache.data.Store(&CacheData{Videos: []Video{}})
	})
	return videoCache
}

// LoadCache 加载缓存
func (vc *VideoCache) LoadCache() bool {
	fileData, err := os.ReadFile(vc.filePath)
	if err != nil {
		return false
	}

	var data CacheData
	if err := json.Unmarshal(fileData, &data); err != nil {
		return false
	}

	if len(data.Videos) > 0 {
		// 为每个视频计算ID
		for i := range data.Videos {
			if data.Videos[i].ID == "" {
				data.Videos[i].ID = GenerateVideoID(data.Videos[i].DirName, data.Videos[i].RelativePath)
			}
		}
		vc.data.Store(&data)
		return true
	}
	return false
}

// GenerateVideoID 生成视频ID
func GenerateVideoID(dirName, relativePath string) string {
	data := dirName + ":" + relativePath
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])[:16]
}

// GetVideos 获取视频列表
func (vc *VideoCache) GetVideos() []Video {
	data := vc.data.Load()
	if data == nil {
		return []Video{}
	}
	return data.Videos
}

// SetVideos 设置视频列表
func (vc *VideoCache) SetVideos(videos []Video) {
	data := &CacheData{
		Videos:       videos,
		LastScanTime: time.Now().UnixMilli(),
	}
	vc.data.Store(data)

	// 清除JSON缓存
	vc.jsonCache.Store(nil)

	// 异步保存
	go func() {
		os.MkdirAll(filepath.Dir(vc.filePath), 0755)
		jsonData, _ := json.MarshalIndent(data, "", "  ")
		os.WriteFile(vc.filePath, jsonData, 0644)
	}()
}

// IsScanning 是否正在扫描
func (vc *VideoCache) IsScanning() bool {
	if !vc.isScanning.Load() {
		return false
	}

	data, err := os.ReadFile(vc.lockPath)
	if err != nil {
		vc.isScanning.Store(false)
		return false
	}

	var lockData struct {
		LockedAt int64 `json:"lockedAt"`
	}
	if json.Unmarshal(data, &lockData) != nil {
		vc.isScanning.Store(false)
		return false
	}

	if time.Now().UnixMilli()-lockData.LockedAt > 10*60*1000 {
		os.Remove(vc.lockPath)
		vc.isScanning.Store(false)
		return false
	}

	return true
}

// SetScanning 设置扫描状态
func (vc *VideoCache) SetScanning(scanning bool) {
	vc.isScanning.Store(scanning)
	os.MkdirAll(filepath.Dir(vc.lockPath), 0755)

	if scanning {
		lockData, _ := json.Marshal(map[string]int64{"lockedAt": time.Now().UnixMilli()})
		os.WriteFile(vc.lockPath, lockData, 0644)
	} else {
		os.Remove(vc.lockPath)
	}
}

// GetStatus 获取状态
func (vc *VideoCache) GetStatus() map[string]interface{} {
	data := vc.data.Load()
	videoCount := 0
	lastScanTime := int64(0)
	if data != nil {
		videoCount = len(data.Videos)
		lastScanTime = data.LastScanTime
	}

	return map[string]interface{}{
		"isScanning":   vc.isScanning.Load(),
		"videoCount":   videoCount,
		"lastScanTime": lastScanTime,
	}
}
