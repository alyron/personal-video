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
function requireAuth(req, res, next) {
  const sessionId = req.cookies.sessionId;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    // API请求返回JSON，页面请求重定向
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: '未授权' });
    }
    return res.redirect('/login');
  }
  
  req.session = session;
  next();
}

module.exports = {
  requireAuth
};
