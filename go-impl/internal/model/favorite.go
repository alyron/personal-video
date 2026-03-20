package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Favorite 收藏信息
type Favorite struct {
	VideoID  string `json:"videoId"`
	DirName  string `json:"dirName"`
	Filename string `json:"filename"`
	AddedAt  int64  `json:"addedAt"`
}

// FavoriteManager 收藏管理器
type FavoriteManager struct {
	filePath string
	data     map[string][]Favorite
	cacheTTL time.Duration
	cacheMu  sync.RWMutex
	mu       sync.RWMutex
}

var (
	favoriteManager *FavoriteManager
	favoriteOnce    sync.Once
)

// GetFavoriteManager 获取收藏管理器单例
func GetFavoriteManager() *FavoriteManager {
	favoriteOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		favoriteManager = &FavoriteManager{
			filePath: filepath.Join(baseDir, "data", "favorites.json"),
			data:     make(map[string][]Favorite),
			cacheTTL: 5 * time.Minute,
		}
		favoriteManager.load()
	})
	return favoriteManager
}

func (fm *FavoriteManager) load() {
	data, err := os.ReadFile(fm.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			fm.data = make(map[string][]Favorite)
			return
		}
		return
	}
	json.Unmarshal(data, &fm.data)
}

func (fm *FavoriteManager) save() {
	os.MkdirAll(filepath.Dir(fm.filePath), 0755)
	data, _ := json.MarshalIndent(fm.data, "", "  ")
	os.WriteFile(fm.filePath, data, 0644)
}

// GetFavorites 获取用户收藏列表
func (fm *FavoriteManager) GetFavorites(username string) []Favorite {
	fm.mu.RLock()
	defer fm.mu.RUnlock()
	
	return fm.data[username]
}

// AddFavorite 添加收藏
func (fm *FavoriteManager) AddFavorite(username string, fav Favorite) bool {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	
	if fm.data[username] == nil {
		fm.data[username] = []Favorite{}
	}
	
	// 检查是否已收藏
	for _, f := range fm.data[username] {
		if f.VideoID == fav.VideoID {
			return false
		}
	}
	
	fav.AddedAt = time.Now().UnixMilli()
	fm.data[username] = append(fm.data[username], fav)
	fm.save()
	return true
}

// RemoveFavorite 移除收藏
func (fm *FavoriteManager) RemoveFavorite(username, videoID string) bool {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	
	favorites := fm.data[username]
	if favorites == nil {
		return false
	}
	
	for i, f := range favorites {
		if f.VideoID == videoID {
			fm.data[username] = append(favorites[:i], favorites[i+1:]...)
			fm.save()
			return true
		}
	}
	return false
}

// IsFavorite 检查是否已收藏
func (fm *FavoriteManager) IsFavorite(username, videoID string) bool {
	fm.mu.RLock()
	defer fm.mu.RUnlock()
	
	favorites := fm.data[username]
	if favorites == nil {
		return false
	}
	
	for _, f := range favorites {
		if f.VideoID == videoID {
			return true
		}
	}
	return false
}
