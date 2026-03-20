/**
 * PIN码登录会话管理 - 异步 I/O 版本
 */
const fs = require('fs').promises;
const path = require('path');

// PIN码有效期 (5分钟)
const PIN_EXPIRY = 5 * 60 * 1000;

// 数据文件路径
const PIN_FILE = path.join(__dirname, '../../data/pinSessions.json');

// 状态枚举
const PINStatus = {
  PENDING: 'pending',
  USED: 'used',
  EXPIRED: 'expired'
};

// 内存缓存
let pinCache = null;
let cacheTime = 0;
const CACHE_TTL = 2000; // 2秒缓存

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  const dataDir = path.dirname(PIN_FILE);
  await fs.mkdir(dataDir, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/**
 * 读取所有PIN码会话（带缓存）
 */
async function readPinSessions() {
  // 缓存命中
  if (pinCache !== null && (Date.now() - cacheTime) < CACHE_TTL) {
    return pinCache;
  }
  
  try {
    const data = await fs.readFile(PIN_FILE, 'utf8');
    pinCache = JSON.parse(data);
    cacheTime = Date.now();
    return pinCache;
  } catch (err) {
    if (err.code === 'ENOENT') {
      pinCache = {};
      cacheTime = Date.now();
      return pinCache;
    }
    throw err;
  }
}

/**
 * 保存所有PIN码会话
 */
async function writePinSessions(sessions) {
  await ensureDataDir();
  await fs.writeFile(PIN_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  // 更新缓存
  pinCache = sessions;
  cacheTime = Date.now();
}

/**
 * 生成4位数字PIN码
 */
function generatePinCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 创建PIN码会话
 * @param {string} username 用户名
 * @returns {Promise<object>} { pin, expiresAt }
 */
async function createPinSession(username) {
  const sessions = await readPinSessions();
  
  // 删除该用户之前所有未使用的PIN码
  for (const [pin, session] of Object.entries(sessions)) {
    if (session.username === username && session.status === PINStatus.PENDING) {
      delete sessions[pin];
    }
  }
  
  // 生成唯一PIN码
  let pin = generatePinCode();
  while (sessions[pin]) {
    pin = generatePinCode();
  }
  
  const pinSession = {
    pin,
    username,
    status: PINStatus.PENDING,
    createdAt: Date.now(),
    expiresAt: Date.now() + PIN_EXPIRY
  };
  
  sessions[pin] = pinSession;
  await writePinSessions(sessions);
  
  return { pin, expiresAt: pinSession.expiresAt };
}

/**
 * 获取PIN码会话
 * @param {string} pin 
 * @returns {Promise<object|null>}
 */
async function getPinSession(pin) {
  if (!pin) return null;
  
  const sessions = await readPinSessions();
  const pinSession = sessions[pin];
  
  if (!pinSession) return null;
  
  // 检查是否过期
  if (Date.now() > pinSession.expiresAt) {
    pinSession.status = PINStatus.EXPIRED;
    sessions[pin] = pinSession;
    await writePinSessions(sessions);
  }
  
  return pinSession;
}

/**
 * 使用PIN码登录
 * @param {string} pin 
 * @returns {Promise<object|null>} { username } 或 null
 */
async function usePinCode(pin) {
  const sessions = await readPinSessions();
  const pinSession = sessions[pin];
  
  // PIN码不存在
  if (!pinSession) return null;
  
  // 已使用
  if (pinSession.status !== PINStatus.PENDING) return null;
  
  // 已过期
  if (Date.now() > pinSession.expiresAt) {
    pinSession.status = PINStatus.EXPIRED;
    sessions[pin] = pinSession;
    await writePinSessions(sessions);
    return null;
  }
  
  // 标记为已使用
  pinSession.status = PINStatus.USED;
  sessions[pin] = pinSession;
  await writePinSessions(sessions);
  
  return { username: pinSession.username };
}

/**
 * 删除PIN码会话
 * @param {string} pin 
 */
async function deletePinSession(pin) {
  const sessions = await readPinSessions();
  if (sessions[pin]) {
    delete sessions[pin];
    await writePinSessions(sessions);
  }
}

/**
 * 清理过期会话
 */
async function cleanExpiredPinSessions() {
  const sessions = await readPinSessions();
  const now = Date.now();
  let changed = false;
  
  for (const [pin, session] of Object.entries(sessions)) {
    if (now > session.expiresAt) {
      delete sessions[pin];
      changed = true;
    }
  }
  
  if (changed) {
    await writePinSessions(sessions);
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  pinCache = null;
  cacheTime = 0;
}

// 每5分钟清理过期会话
setInterval(cleanExpiredPinSessions, 5 * 60 * 1000);

module.exports = {
  createPinSession,
  getPinSession,
  usePinCode,
  deletePinSession,
  cleanExpiredPinSessions,
  clearCache,
  PINStatus
};
