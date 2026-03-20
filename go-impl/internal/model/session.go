// Package model 数据模型
package model

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
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
	sessions    map[string]*Session
	cache       map[string]*Session
	cacheTime   time.Time
	cacheTTL    time.Duration
	sessionExpy time.Duration
	mu          sync.RWMutex
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
			sessions:    make(map[string]*Session),
			cache:       make(map[string]*Session),
			cacheTTL:    5 * time.Second,
			sessionExpy: 7 * 24 * time.Hour,
		}
		sessionManager.load()
		// 启动清理协程
		go sessionManager.startCleanup()
	})
	return sessionManager
}

func (sm *SessionManager) load() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	data, err := os.ReadFile(sm.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			sm.sessions = make(map[string]*Session)
			return
		}
		return
	}
	
	json.Unmarshal(data, &sm.sessions)
}

func (sm *SessionManager) save() {
	// 确保目录存在
	os.MkdirAll(filepath.Dir(sm.filePath), 0755)
	
	data, _ := json.MarshalIndent(sm.sessions, "", "  ")
	os.WriteFile(sm.filePath, data, 0644)
}

// CreateSession 创建会话
func (sm *SessionManager) CreateSession(username string) (string, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	// 生成随机 session ID
	bytes := make([]byte, 32)
	rand.Read(bytes)
	sessionID := hex.EncodeToString(bytes)
	
	now := time.Now()
	sm.sessions[sessionID] = &Session{
		Username:  username,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(sm.sessionExpy).UnixMilli(),
	}
	
	sm.save()
	return sessionID, nil
}

// GetSession 获取会话
func (sm *SessionManager) GetSession(sessionID string) *Session {
	if sessionID == "" {
		return nil
	}
	
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil
	}
	
	// 检查过期
	if time.Now().UnixMilli() > session.ExpiresAt {
		return nil
	}
	
	return session
}

// DeleteSession 删除会话
func (sm *SessionManager) DeleteSession(sessionID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	delete(sm.sessions, sessionID)
	sm.save()
}

func (sm *SessionManager) startCleanup() {
	ticker := time.NewTicker(time.Hour)
	for range ticker.C {
		sm.cleanup()
	}
}

func (sm *SessionManager) cleanup() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	now := time.Now().UnixMilli()
	changed := false
	
	for id, session := range sm.sessions {
		if now > session.ExpiresAt {
			delete(sm.sessions, id)
			changed = true
		}
	}
	
	if changed {
		sm.save()
	}
}
