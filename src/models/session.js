/**
 * 会话管理模块
 */
const crypto = require('crypto');

// 会话存储 (sessionId -> 用户信息)
const sessions = new Map();

// 会话有效期 (24小时)
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * 创建会话
 * @param {string} username 用户名
 * @returns {string} 会话ID
 */
function createSession(username) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY
  });
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
}

/**
 * 清理过期会话
 */
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}

// 每小时清理过期会话
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions
};
