// Package model 数据模型
package model

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Session 会话信息
type Session struct {
	Username  string `json:"username"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
}

// SessionManager 会话管理器
type SessionManager struct {
	filePath    string
	sessions    sync.Map // sessionID -> *Session
	sessionExpy time.Duration
	dirty       atomic.Bool
}

var (
	sessionManager *SessionManager
	sessionOnce    sync.Once
)

// GetSessionManager 获取会话管理器单例
func GetSessionManager() *SessionManager {
	sessionOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		sessionManager = &SessionManager{
			filePath:    filepath.Join(baseDir, "data", "sessions.json"),
			sessionExpy: 7 * 24 * time.Hour,
		}
		sessionManager.load()
		go sessionManager.startCleanup()
	})
	return sessionManager
}

func (sm *SessionManager) load() {
	data, err := os.ReadFile(sm.filePath)
	if err != nil {
		return
	}

	var sessions map[string]*Session
	if json.Unmarshal(data, &sessions) == nil {
		for id, s := range sessions {
			sm.sessions.Store(id, s)
		}
	}
}

func (sm *SessionManager) save() {
	sessions := make(map[string]*Session)
	sm.sessions.Range(func(key, value interface{}) bool {
		sessions[key.(string)] = value.(*Session)
		return true
	})

	os.MkdirAll(filepath.Dir(sm.filePath), 0755)
	data, _ := json.MarshalIndent(sessions, "", "  ")
	os.WriteFile(sm.filePath, data, 0644)
	sm.dirty.Store(false)
}

// CreateSession 创建会话
func (sm *SessionManager) CreateSession(username string) (string, error) {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	sessionID := hex.EncodeToString(bytes)

	now := time.Now()
	sm.sessions.Store(sessionID, &Session{
		Username:  username,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(sm.sessionExpy).UnixMilli(),
	})

	sm.dirty.Store(true)
	go sm.save() // 异步保存

	return sessionID, nil
}

// GetSession 获取会话
func (sm *SessionManager) GetSession(sessionID string) *Session {
	if sessionID == "" {
		return nil
	}

	value, ok := sm.sessions.Load(sessionID)
	if !ok {
		return nil
	}

	session := value.(*Session)
	if time.Now().UnixMilli() > session.ExpiresAt {
		return nil
	}

	return session
}

// DeleteSession 删除会话
func (sm *SessionManager) DeleteSession(sessionID string) {
	sm.sessions.Delete(sessionID)
	sm.dirty.Store(true)
	go sm.save()
}

func (sm *SessionManager) startCleanup() {
	ticker := time.NewTicker(time.Hour)
	for range ticker.C {
		sm.cleanup()
	}
}

func (sm *SessionManager) cleanup() {
	now := time.Now().UnixMilli()
	changed := false

	sm.sessions.Range(func(key, value interface{}) bool {
		session := value.(*Session)
		if now > session.ExpiresAt {
			sm.sessions.Delete(key)
			changed = true
		}
		return true
	})

	if changed {
		sm.save()
	}
}
