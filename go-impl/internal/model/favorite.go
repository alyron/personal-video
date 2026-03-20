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
	data     sync.Map // username -> []Favorite
	dirty    chan struct{}
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
			dirty:    make(chan struct{}, 1),
		}
		favoriteManager.load()
		go favoriteManager.autoSave()
	})
	return favoriteManager
}

func (fm *FavoriteManager) load() {
	data, err := os.ReadFile(fm.filePath)
	if err != nil {
		return
	}

	var favs map[string][]Favorite
	if json.Unmarshal(data, &favs) == nil {
		for user, f := range favs {
			fm.data.Store(user, f)
		}
	}
}

func (fm *FavoriteManager) save() {
	favs := make(map[string][]Favorite)
	fm.data.Range(func(key, value interface{}) bool {
		favs[key.(string)] = value.([]Favorite)
		return true
	})

	os.MkdirAll(filepath.Dir(fm.filePath), 0755)
	data, _ := json.MarshalIndent(favs, "", "  ")
	os.WriteFile(fm.filePath, data, 0644)
}

func (fm *FavoriteManager) autoSave() {
	for range fm.dirty {
		fm.save()
	}
}

func (fm *FavoriteManager) markDirty() {
	select {
	case fm.dirty <- struct{}{}:
	default:
	}
}

// GetFavorites 获取用户收藏列表
func (fm *FavoriteManager) GetFavorites(username string) []Favorite {
	value, ok := fm.data.Load(username)
	if !ok {
		return nil
	}
	return value.([]Favorite)
}

// AddFavorite 添加收藏
func (fm *FavoriteManager) AddFavorite(username string, fav Favorite) bool {
	value, _ := fm.data.LoadOrStore(username, []Favorite{})
	favorites := value.([]Favorite)

	// 检查是否已收藏
	for _, f := range favorites {
		if f.VideoID == fav.VideoID {
			return false
		}
	}

	fav.AddedAt = time.Now().UnixMilli()
	fm.data.Store(username, append(favorites, fav))
	fm.markDirty()
	return true
}

// RemoveFavorite 移除收藏
func (fm *FavoriteManager) RemoveFavorite(username, videoID string) bool {
	value, ok := fm.data.Load(username)
	if !ok {
		return false
	}

	favorites := value.([]Favorite)
	for i, f := range favorites {
		if f.VideoID == videoID {
			newFavs := make([]Favorite, 0, len(favorites)-1)
			newFavs = append(newFavs, favorites[:i]...)
			newFavs = append(newFavs, favorites[i+1:]...)
			fm.data.Store(username, newFavs)
			fm.markDirty()
			return true
		}
	}
	return false
}

// IsFavorite 检查是否已收藏
func (fm *FavoriteManager) IsFavorite(username, videoID string) bool {
	value, ok := fm.data.Load(username)
	if !ok {
		return false
	}

	favorites := value.([]Favorite)
	for _, f := range favorites {
		if f.VideoID == videoID {
			return true
		}
	}
	return false
}
