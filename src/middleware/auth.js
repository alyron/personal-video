/**
 * 认证中间件
 */
const sessionManager = require('../models/session');

/**
 * 认证中间件
 * @param {object} req Express请求对象
 * @param {object} res Express响应对象
 * @param {function} next 下一个中间件
 */
async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies.sessionId;
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      // API 请求 (/api/*) 返回 JSON，页面请求重定向
      if (req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ error: '未授权', needLogin: true });
      }
      return res.redirect('/login');
    }
    
    req.session = session;
    next();
  } catch (err) {
    console.error('认证中间件错误:', err);
    if (req.originalUrl.startsWith('/api')) {
      return res.status(500).json({ error: '认证失败' });
    }
    res.redirect('/login');
  }
}

module.exports = {
  requireAuth
};
