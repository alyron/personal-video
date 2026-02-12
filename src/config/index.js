/**
 * 配置加载模块
 */
const fs = require('fs');
const path = require('path');

let config = null;

function loadConfig() {
  const configPath = path.join(__dirname, '../../config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('配置文件 config.json 不存在');
  }
  
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  
  // 设置默认值
  config.port = config.port || 18899;
  config.host = config.host || '::';
  
  return config;
}

function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

module.exports = {
  loadConfig,
  getConfig
};
