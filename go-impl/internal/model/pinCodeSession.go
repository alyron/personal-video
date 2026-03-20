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
	sessions sync.Map // pin -> *PINSession
	expiry   time.Duration
	dirty    chan struct{}
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
			expiry:   5 * time.Minute,
			dirty:    make(chan struct{}, 1),
		}
		pinCodeManager.load()
		go pinCodeManager.startCleanup()
		go pinCodeManager.autoSave()
	})
	return pinCodeManager
}

func (pm *PINCodeManager) load() {
	data, err := os.ReadFile(pm.filePath)
	if err != nil {
		return
	}
	var sessions map[string]*PINSession
	if json.Unmarshal(data, &sessions) == nil {
		for pin, s := range sessions {
			pm.sessions.Store(pin, s)
		}
	}
}

func (pm *PINCodeManager) save() {
	sessions := make(map[string]*PINSession)
	pm.sessions.Range(func(key, value interface{}) bool {
		sessions[key.(string)] = value.(*PINSession)
		return true
	})

	os.MkdirAll(filepath.Dir(pm.filePath), 0755)
	data, _ := json.MarshalIndent(sessions, "", "  ")
	os.WriteFile(pm.filePath, data, 0644)
}

func (pm *PINCodeManager) autoSave() {
	for range pm.dirty {
		pm.save()
	}
}

func (pm *PINCodeManager) markDirty() {
	select {
	case pm.dirty <- struct{}{}:
	default:
	}
}

// generatePIN 生成4位数字PIN码
func generatePIN() string {
	return fmt.Sprintf("%04d", 1000+rand.Intn(9000))
}

// CreatePINSession 创建PIN码会话
func (pm *PINCodeManager) CreatePINSession(username string) (string, int64) {
	// 删除该用户之前未使用的PIN码
	pm.sessions.Range(func(key, value interface{}) bool {
		session := value.(*PINSession)
		if session.Username == username && session.Status == PINStatusPending {
			pm.sessions.Delete(key)
		}
		return true
	})

	// 生成唯一PIN码
	pin := generatePIN()
	for {
		if _, ok := pm.sessions.Load(pin); !ok {
			break
		}
		pin = generatePIN()
	}

	now := time.Now()
	session := &PINSession{
		PIN:       pin,
		Username:  username,
		Status:    PINStatusPending,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(pm.expiry).UnixMilli(),
	}

	pm.sessions.Store(pin, session)
	pm.markDirty()

	return pin, session.ExpiresAt
}

// GetPINSession 获取PIN码会话
func (pm *PINCodeManager) GetPINSession(pin string) *PINSession {
	value, ok := pm.sessions.Load(pin)
	if !ok {
		return nil
	}

	session := value.(*PINSession)
	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = PINStatusExpired
	}

	return session
}

// UsePINCode 使用PIN码
func (pm *PINCodeManager) UsePINCode(pin string) *string {
	value, ok := pm.sessions.Load(pin)
	if !ok {
		return nil
	}

	session := value.(*PINSession)
	if session.Status != PINStatusPending {
		return nil
	}

	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = PINStatusExpired
		pm.markDirty()
		return nil
	}

	session.Status = PINStatusUsed
	pm.markDirty()

	return &session.Username
}

// DeletePINSession 删除PIN码会话
func (pm *PINCodeManager) DeletePINSession(pin string) {
	pm.sessions.Delete(pin)
	pm.markDirty()
}

func (pm *PINCodeManager) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		pm.cleanup()
	}
}

func (pm *PINCodeManager) cleanup() {
	now := time.Now().UnixMilli()
	pm.sessions.Range(func(key, value interface{}) bool {
		session := value.(*PINSession)
		if now > session.ExpiresAt {
			pm.sessions.Delete(key)
		}
		return true
	})
	pm.markDirty()
}
