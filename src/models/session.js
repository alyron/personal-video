/**
 * 会话管理模块 - 异步 I/O 版本
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// 会话数据文件路径
const SESSIONS_FILE = path.join(__dirname, '../../data/sessions.json');

// 会话有效期 (7天)
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// 内存缓存
let sessionsCache = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5秒缓存

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  const dataDir = path.dirname(SESSIONS_FILE);
  await fs.mkdir(dataDir, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/**
 * 读取所有会话（带缓存）
 */
async function readSessions() {
  // 缓存命中
  if (sessionsCache !== null && (Date.now() - cacheTime) < CACHE_TTL) {
    return sessionsCache;
  }
  
  try {
    const data = await fs.readFile(SESSIONS_FILE, 'utf8');
    sessionsCache = JSON.parse(data);
    cacheTime = Date.now();
    return sessionsCache;
  } catch (err) {
    if (err.code === 'ENOENT') {
      sessionsCache = {};
      cacheTime = Date.now();
      return sessionsCache;
    }
    throw err;
  }
}

/**
 * 保存所有会话
 */
async function writeSessions(sessions) {
  await ensureDataDir();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  // 更新缓存
  sessionsCache = sessions;
  cacheTime = Date.now();
}

/**
 * 创建会话
 * @param {string} username 用户名
 * @returns {Promise<string>} 会话ID
 */
async function createSession(username) {
  const sessions = await readSessions();
  const sessionId = crypto.randomBytes(32).toString('hex');
  
  sessions[sessionId] = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY
  };
  
  await writeSessions(sessions);
  return sessionId;
}

/**
 * 获取会话
 * @param {string} sessionId 会话ID
 * @returns {Promise<object|null>} 会话信息
 */
async function getSession(sessionId) {
  if (!sessionId) return null;
  
  const sessions = await readSessions();
  const session = sessions[sessionId];
  
  if (!session) return null;
  
  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    delete sessions[sessionId];
    await writeSessions(sessions);
    return null;
  }
  
  return session;
}

/**
 * 删除会话
 * @param {string} sessionId 会话ID
 */
async function deleteSession(sessionId) {
  const sessions = await readSessions();
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    await writeSessions(sessions);
  }
}

/**
 * 清理过期会话
 */
async function cleanExpiredSessions() {
  const sessions = await readSessions();
  const now = Date.now();
  let changed = false;
  
  for (const [id, session] of Object.entries(sessions)) {
    if (now > session.expiresAt) {
      delete sessions[id];
      changed = true;
    }
  }
  
  if (changed) {
    await writeSessions(sessions);
    console.log('已清理过期会话');
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  sessionsCache = null;
  cacheTime = 0;
}

// 每小时清理过期会话
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions,
  clearCache
};
