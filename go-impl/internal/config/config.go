// Package config 配置加载模块
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// HTTPSConfig HTTPS 配置
type HTTPSConfig struct {
	Enabled bool   `json:"enabled"`
	Key     string `json:"key"`
	Cert    string `json:"cert"`
}

// User 用户配置
type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// VideoDir 视频目录配置
type VideoDir struct {
	Name         string   `json:"name"`
	Path         string   `json:"path"`
	AllowedUsers []string `json:"allowedUsers,omitempty"`
}

// Config 完整配置
type Config struct {
	Users     []User     `json:"users"`
	Port      int        `json:"port"`
	Host      string     `json:"host"`
	Debug     bool       `json:"debug"`
	HTTPS     HTTPSConfig `json:"https"`
	VideoDirs []VideoDir `json:"videoDirs"`
	Source    string     `json:"_source"`
}

var (
	cfg     *Config
	cfgOnce sync.Once
)

// LoadConfig 加载配置
func LoadConfig() (*Config, error) {
	var err error
	cfgOnce.Do(func() {
		cfg, err = loadConfigInternal()
	})
	return cfg, err
}

func loadConfigInternal() (*Config, error) {
	// 获取可执行文件目录
	execPath, err := os.Executable()
	if err != nil {
		return nil, err
	}
	baseDir := filepath.Dir(execPath)
	
	// 优先级: data/config.json > config.json
	dataConfigPath := filepath.Join(baseDir, "data", "config.json")
	rootConfigPath := filepath.Join(baseDir, "config.json")
	
	var configPath string
	var configSource string
	
	// 检查 data/config.json
	if _, err := os.Stat(dataConfigPath); err == nil {
		configPath = dataConfigPath
		configSource = "data/config.json"
		fmt.Println("使用配置文件: data/config.json (自定义配置)")
	} else if _, err := os.Stat(rootConfigPath); err == nil {
		configPath = rootConfigPath
		configSource = "config.json"
		fmt.Println("使用配置文件: config.json (默认配置)")
	} else {
		return nil, fmt.Errorf("配置文件不存在，请创建 config.json 或 data/config.json")
	}
	
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}
	
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	
	// 设置默认值
	if c.Port == 0 {
		c.Port = 18899
	}
	if c.Host == "" {
		c.Host = "::"
	}
	
	c.Source = configSource
	
	return &c, nil
}

// GetConfig 获取配置（线程安全）
func GetConfig() *Config {
	if cfg == nil {
		LoadConfig()
	}
	return cfg
}

// ReloadConfig 重新加载配置
func ReloadConfig() (*Config, error) {
	cfg = nil
	cfgOnce = sync.Once{}
	return LoadConfig()
}
