package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
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
}

// CacheData 缓存数据
type CacheData struct {
	Videos       []Video `json:"videos"`
	LastScanTime int64   `json:"lastScanTime"`
}

// VideoCache 视频缓存
type VideoCache struct {
	filePath    string
	lockPath    string
	data        *CacheData
	isScanning  bool
	scanLockMu  sync.Mutex
	mu          sync.RWMutex
}

var (
	videoCache  *VideoCache
	cacheOnce   sync.Once
)

// GetVideoCache 获取视频缓存单例
func GetVideoCache() *VideoCache {
	cacheOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		videoCache = &VideoCache{
			filePath:   filepath.Join(baseDir, "data", "videoCache.json"),
			lockPath:   filepath.Join(baseDir, "data", ".scan-lock"),
			data:       &CacheData{Videos: []Video{}},
			isScanning: false,
		}
	})
	return videoCache
}

// LoadCache 加载缓存
func (vc *VideoCache) LoadCache() bool {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	
	data, err := os.ReadFile(vc.filePath)
	if err != nil {
		return false
	}
	
	if err := json.Unmarshal(data, vc.data); err != nil {
		return false
	}
	
	if len(vc.data.Videos) > 0 {
		return true
	}
	return false
}

// SaveCache 保存缓存
func (vc *VideoCache) SaveCache() {
	vc.mu.RLock()
	data := vc.data
	vc.mu.RUnlock()
	
	os.MkdirAll(filepath.Dir(vc.filePath), 0755)
	jsonData, _ := json.MarshalIndent(data, "", "  ")
	os.WriteFile(vc.filePath, jsonData, 0644)
}

// GetVideos 获取视频列表
func (vc *VideoCache) GetVideos() []Video {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	
	if vc.data == nil {
		return []Video{}
	}
	return vc.data.Videos
}

// SetVideos 设置视频列表
func (vc *VideoCache) SetVideos(videos []Video) {
	vc.mu.Lock()
	vc.data.Videos = videos
	vc.data.LastScanTime = time.Now().UnixMilli()
	data := vc.data // 复制引用
	vc.mu.Unlock()

	// 保存到文件（不持有锁）
	os.MkdirAll(filepath.Dir(vc.filePath), 0755)
	jsonData, _ := json.MarshalIndent(data, "", "  ")
	os.WriteFile(vc.filePath, jsonData, 0644)
}

// IsScanning 是否正在扫描
func (vc *VideoCache) IsScanning() bool {
	vc.scanLockMu.Lock()
	defer vc.scanLockMu.Unlock()
	
	if !vc.isScanning {
		return false
	}
	
	// 检查锁文件是否超时
	data, err := os.ReadFile(vc.lockPath)
	if err != nil {
		vc.isScanning = false
		return false
	}
	
	var lockData struct {
		LockedAt int64 `json:"lockedAt"`
	}
	if json.Unmarshal(data, &lockData) != nil {
		vc.isScanning = false
		return false
	}
	
	// 10分钟超时
	if time.Now().UnixMilli()-lockData.LockedAt > 10*60*1000 {
		os.Remove(vc.lockPath)
		vc.isScanning = false
		return false
	}
	
	return true
}

// SetScanning 设置扫描状态
func (vc *VideoCache) SetScanning(scanning bool) {
	vc.scanLockMu.Lock()
	defer vc.scanLockMu.Unlock()
	
	vc.isScanning = scanning
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
	vc.mu.RLock()
	videoCount := len(vc.data.Videos)
	lastScanTime := vc.data.LastScanTime
	vc.mu.RUnlock()

	vc.scanLockMu.Lock()
	scanning := vc.isScanning
	vc.scanLockMu.Unlock()

	return map[string]interface{}{
		"isScanning":   scanning,
		"videoCount":   videoCount,
		"lastScanTime": lastScanTime,
	}
}
