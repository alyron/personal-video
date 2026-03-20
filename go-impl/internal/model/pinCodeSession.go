package model

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// PINStatus PIN码状态
type PINStatus string

const (
	PINStatusPending PINStatus = "pending"
	PINStatusUsed    PINStatus = "used"
	PINStatusExpired PINStatus = "expired"
)

// PINSession PIN码会话
type PINSession struct {
	PIN       string    `json:"pin"`
	Username  string    `json:"username"`
	Status    PINStatus `json:"status"`
	CreatedAt int64     `json:"createdAt"`
	ExpiresAt int64     `json:"expiresAt"`
}

// PINCodeManager PIN码管理器
type PINCodeManager struct {
	filePath string
	sessions map[string]*PINSession
	mu       sync.RWMutex
	expiry   time.Duration
}

var (
	pinCodeManager *PINCodeManager
	pinOnce        sync.Once
)

// GetPINCodeManager 获取PIN码管理器单例
func GetPINCodeManager() *PINCodeManager {
	pinOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		pinCodeManager = &PINCodeManager{
			filePath: filepath.Join(baseDir, "data", "pinSessions.json"),
			sessions: make(map[string]*PINSession),
			expiry:   5 * time.Minute,
		}
		pinCodeManager.load()
		go pinCodeManager.startCleanup()
	})
	return pinCodeManager
}

func (pm *PINCodeManager) load() {
	data, err := os.ReadFile(pm.filePath)
	if err != nil {
		return
	}
	json.Unmarshal(data, &pm.sessions)
}

func (pm *PINCodeManager) save() {
	os.MkdirAll(filepath.Dir(pm.filePath), 0755)
	data, _ := json.MarshalIndent(pm.sessions, "", "  ")
	os.WriteFile(pm.filePath, data, 0644)
}

// generatePIN 生成4位数字PIN码
func generatePIN() string {
	return fmt.Sprintf("%04d", 1000+rand.Intn(9000))
}

// CreatePINSession 创建PIN码会话
func (pm *PINCodeManager) CreatePINSession(username string) (string, int64) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	
	// 删除该用户之前未使用的PIN码
	for pin, session := range pm.sessions {
		if session.Username == username && session.Status == PINStatusPending {
			delete(pm.sessions, pin)
		}
	}
	
	// 生成唯一PIN码
	pin := generatePIN()
	for _, exists := pm.sessions[pin]; exists; {
		pin = generatePIN()
		_, exists = pm.sessions[pin]
	}
	
	now := time.Now()
	session := &PINSession{
		PIN:       pin,
		Username:  username,
		Status:    PINStatusPending,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(pm.expiry).UnixMilli(),
	}
	
	pm.sessions[pin] = session
	pm.save()
	
	return pin, session.ExpiresAt
}

// GetPINSession 获取PIN码会话
func (pm *PINCodeManager) GetPINSession(pin string) *PINSession {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	
	session, ok := pm.sessions[pin]
	if !ok {
		return nil
	}
	
	// 检查过期
	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = PINStatusExpired
	}
	
	return session
}

// UsePINCode 使用PIN码
func (pm *PINCodeManager) UsePINCode(pin string) *string {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	
	session, ok := pm.sessions[pin]
	if !ok || session.Status != PINStatusPending {
		return nil
	}
	
	// 检查过期
	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = PINStatusExpired
		pm.save()
		return nil
	}
	
	session.Status = PINStatusUsed
	pm.save()
	
	return &session.Username
}

// DeletePINSession 删除PIN码会话
func (pm *PINCodeManager) DeletePINSession(pin string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	
	delete(pm.sessions, pin)
	pm.save()
}

func (pm *PINCodeManager) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		pm.cleanup()
	}
}

func (pm *PINCodeManager) cleanup() {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	
	now := time.Now().UnixMilli()
	for pin, session := range pm.sessions {
		if now > session.ExpiresAt {
			delete(pm.sessions, pin)
		}
	}
	pm.save()
}
