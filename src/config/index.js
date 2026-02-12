/**
 * 配置加载模块
 *
 * 配置文件优先级:
 * 1. data/config.json (优先级高，适合自定义配置)
 * 2. config.json (根目录，默认配置)
 */
const fs = require('fs');
const path = require('path');

let config = null;

function loadConfig() {
  const dataConfigPath = path.join(__dirname, '../../data/config.json');
  const rootConfigPath = path.join(__dirname, '../../config.json');

  let configPath;
  let configSource;

  // 优先使用 data/config.json
  if (fs.existsSync(dataConfigPath)) {
    configPath = dataConfigPath;
    configSource = 'data/config.json';
    console.log('使用配置文件: data/config.json (自定义配置)');
  } else if (fs.existsSync(rootConfigPath)) {
    configPath = rootConfigPath;
    configSource = 'config.json';
    console.log('使用配置文件: config.json (默认配置)');
  } else {
    throw new Error('配置文件不存在，请创建 config.json 或 data/config.json');
  }

  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);

  // 设置默认值
  config.port = config.port || 18899;
  config.host = config.host || '::';

  // 记录配置来源
  config._source = configSource;

  return config;
}

function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

function reloadConfig() {
  config = null;
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfig,
  reloadConfig
};
