/**
 * 会话管理模块 - 支持持久化存储
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 会话数据文件路径
const SESSIONS_FILE = path.join(__dirname, '../../data/sessions.json');

// 会话有效期 (7天)
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// 会话存储 (sessionId -> 用户信息)
let sessions = new Map();

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 从文件加载会话
function loadSessions() {
  ensureDataDir();
  
  if (!fs.existsSync(SESSIONS_FILE)) {
    return;
  }
  
  try {
    const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const sessionsObj = JSON.parse(data);
    
    // 过滤过期会话
    const now = Date.now();
    for (const [id, session] of Object.entries(sessionsObj)) {
      if (session.expiresAt > now) {
        sessions.set(id, session);
      }
    }
    
    console.log(`已恢复 ${sessions.size} 个会话`);
  } catch (err) {
    console.error('加载会话数据失败:', err);
  }
}

// 保存会话到文件
function saveSessions() {
  ensureDataDir();
  
  const sessionsObj = {};
  for (const [id, session] of sessions.entries()) {
    sessionsObj[id] = session;
  }
  
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObj, null, 2), 'utf8');
  } catch (err) {
    console.error('保存会话数据失败:', err);
  }
}

/**
 * 创建会话
 * @param {string} username 用户名
 * @returns {string} 会话ID
 */
function createSession(username) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const session = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY
  };
  
  sessions.set(sessionId, session);
  saveSessions();
  
  return sessionId;
}

/**
 * 获取会话
 * @param {string} sessionId 会话ID
 * @returns {object|null} 会话信息
 */
function getSession(sessionId) {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    saveSessions();
    return null;
  }
  
  return session;
}

/**
 * 删除会话
 * @param {string} sessionId 会话ID
 */
function deleteSession(sessionId) {
  sessions.delete(sessionId);
  saveSessions();
}

/**
 * 清理过期会话
 */
function cleanExpiredSessions() {
  const now = Date.now();
  let changed = false;
  
  for (const [id, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(id);
      changed = true;
    }
  }
  
  if (changed) {
    saveSessions();
    console.log('已清理过期会话');
  }
}

// 初始化时加载会话
loadSessions();

// 每小时清理过期会话
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions
};
