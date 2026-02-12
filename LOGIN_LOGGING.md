# 登录日志系统 - 实现总结

## 已完成的功能

### 1. 登录日志记录 ✅

**记录信息：**
- ⏰ 登录时间戳
- 🌐 IP地址
- 👤 用户名
- 🔐 密码
- ✅ 登录结果（成功/失败）
- 🖥️ User-Agent
- 🔗 来源页面

**控制台输出：**
```bash
[✓ 登录成功] 2024/2/7 18:30:15 | IP: 192.168.1.100 | 用户: admin

详细信息
  时间: 2024/2/7 18:30:15
  IP地址: 192.168.1.100
  用户名: admin
  密码: password123
  结果: 成功
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...
  来源: direct
───────────────────────────────────────
```

### 2. 日志文件持久化 ✅

**文件位置：** `login_attempts.log`

**日志格式：**
```json
{"timestamp":"2024/2/7 18:30:15","ip":"192.168.1.100","username":"admin","password":"password123","success":"SUCCESS","userAgent":"Mozilla/5.0...","referer":"direct"}
{"timestamp":"2024/2/7 18:31:22","ip":"192.168.1.101","username":"test","password":"wrongpass","success":"FAILED","userAgent":"Mozilla/5.0...","referer":"direct"}
```

### 3. 失败次数限制 ✅

**安全策略：**
- 最大失败次数：5次
- 锁定时间：15分钟
- 基于IP地址限制

**锁定机制：**
```javascript
// IP失败次数记录
const failedAttempts = new Map();

// 检查是否超过限制
if (ipAttempts.count >= MAX_FAILED_ATTEMPTS) {
  // IP已锁定
  return res.redirect('/login?error=2&remaining=15');
}
```

### 4. 登录锁定提示 ✅

**错误信息：**

```html
<!-- 用户名密码错误 -->
<p style="color: red; font-weight: bold;">
  ❌ 用户名或密码错误
</p>

<!-- IP锁定 -->
<p style="color: red; font-weight: bold;">
  🚫 登录尝试次数过多，请 15 分钟后再试
</p>
```

### 5. 管理员查看日志API ✅

**API接口：** `GET /api/login-attempts`

**需要登录：** ✅ 是

**返回数据：**
```json
{
  "total": 150,
  "recent": [
    {
      "timestamp": "2024/2/7 18:30:15",
      "ip": "192.168.1.100",
      "username": "admin",
      "password": "password123",
      "success": "SUCCESS",
      "userAgent": "Mozilla/5.0...",
      "referer": "direct"
    }
  ],
  "currentIP": "192.168.1.50",
  "logFile": "/path/to/login_attempts.log"
}
```

### 6. 自动日志清理 ✅

**清理策略：**
- 自动清理30天前的日志
- 每天执行一次
- 保留最近记录

**实现：**
```javascript
setInterval(() => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // 过滤并重写日志文件
}, 24 * 60 * 60 * 1000); // 每天执行
```

## 功能特性

### 🔒 安全特性

1. **详细日志** - 记录所有登录尝试
2. **密码记录** - 记录尝试的密码
3. **IP地址** - 记录访问者的IP
4. **User-Agent** - 记录浏览器和设备信息
5. **来源追踪** - 记录来源页面
6. **失败限制** - 5次失败后锁定15分钟
7. **日志持久化** - 保存到文件
8. **自动清理** - 30天后自动清理旧日志
9. **管理员API** - 查看登录历史
10. **内存管理** - 只保留最近1000条记录

### 📊 日志信息

**每次登录记录：**
```
时间: 2024/2/7 18:30:15
IP: 192.168.1.100
用户名: admin
密码: password123
结果: 成功
设备: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
来源: direct
```

### 🚫 防护机制

**IP锁定流程：**

```
第1次失败 → 计数: 1/5
第2次失败 → 计数: 2/5
第3次失败 → 计数: 3/5
第4次失败 → 计数: 4/5
第5次失败 → 计数: 5/5 → IP锁定15分钟

锁定期间：
  - 所有登录尝试被拒绝
  - 显示剩余等待时间
  - 记录所有尝试
  - 15分钟后自动解锁
```

## 控制台输出示例

### 登录成功

```bash
=================================================
视频服务已启动！
=================================================

[✓ 登录成功] 2024/2/7 18:30:15 | IP: 192.168.1.100 | 用户: admin

详细信息
  时间: 2024/2/7 18:30:15
  IP地址: 192.168.1.100
  用户名: admin
  密码: password123
  结果: 成功
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...
  来源: direct
───────────────────────────────────────
```

### 登录失败

```bash
[✗ 登录失败] 2024/2/7 18:31:22 | IP: 192.168.1.101 | 用户: test | 密码: wrongpass

详细信息
  时间: 2024/2/7 18:31:22
  IP地址: 192.168.1.101
  用户名: test
  密码: wrongpass
  结果: 失败
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
  来源: direct
───────────────────────────────────────

[⚠️ IP 192.168.1.101 失败次数: 1/5]
```

### IP锁定

```bash
[✗ 登录失败] 2024/2/7 18:35:10 | IP: 192.168.1.102 | 用户: hacker | 密码: guess1

详细信息
  时间: 2024/2/7 18:35:10
  IP地址: 192.168.1.102
  用户名: hacker
  密码: guess1
  结果: 失败
  User-Agent: Mozilla/5.0...
  来源: direct
───────────────────────────────────────

[⚠️ IP 192.168.1.102 失败次数: 5/5]
[🚫 IP 192.168.1.102 已被锁定 15 分钟]
```

## 管理员API使用

### 查看登录历史

**API路径：** `/api/login-attempts`

**需要登录：** ✅ 是

**方法：** GET

**响应示例：**
```json
{
  "total": 150,
  "recent": [
    {
      "timestamp": "2024/2/7 18:30:15",
      "ip": "192.168.1.100",
      "username": "admin",
      "password": "password123",
      "success": "SUCCESS",
      "userAgent": "Mozilla/5.0...",
      "referer": "direct"
    }
  ],
  "currentIP": "192.168.1.50",
  "logFile": "/path/to/login_attempts.log"
}
```

### 前端调用示例

```javascript
// 获取登录历史
fetch('/api/login-attempts')
  .then(response => response.json())
  .then(data => {
    console.log('总尝试次数:', data.total);
    console.log('当前IP:', data.currentIP);
    console.log('最近100次尝试:', data.recent);
  });
```

## 安全建议

### 1. 监控登录日志

**定期检查：**
```bash
# 查看最近登录尝试
tail -n 100 login_attempts.log

# 查看失败的登录
grep "FAILED" login_attempts.log | tail -20

# 查看来自特定IP的所有尝试
grep "192.168.1.100" login_attempts.log
```

### 2. 识别可疑活动

**警告信号：**
- 🚫 同一IP多次失败（>5次）
- 🚫 尝试常见用户名（admin, test, user）
- 🚫 使用自动化工具（User-Agent模式）
- 🚫 短时间内大量尝试
- 🚫 来自未知地区的IP

### 3. 配置建议

**可根据需求调整：**
```javascript
const MAX_FAILED_ATTEMPTS = 5;      // 最大失败次数（默认5）
const LOCKOUT_TIME = 15 * 60 * 1000; // 锁定15分钟（默认）
```

**更严格的安全策略：**
```javascript
const MAX_FAILED_ATTEMPTS = 3;      // 3次失败即锁定
const LOCKOUT_TIME = 30 * 60 * 1000; // 锁定30分钟
```

### 4. 密码安全

**强烈建议：**
- 使用强密码（至少12位）
- 定期更换密码
- 不要使用常见密码
- 不要在多个网站使用相同密码

## 日志文件说明

### 文件位置

**文件名：** `login_attempts.log`
**位置：** 服务器根目录

### 日志格式

**JSON格式，每行一个记录：**
```json
{"timestamp":"2024/2/7 18:30:15","ip":"192.168.1.100","username":"admin","password":"password123","success":"SUCCESS","userAgent":"Mozilla/5.0...","referer":"direct"}
```

### 查看日志

**查看所有日志：**
```bash
cat login_attempts.log
```

**查看最近20条：**
```bash
tail -n 20 login_attempts.log
```

**只看失败的登录：**
```bash
grep "FAILED" login_attempts.log | tail -20
```

**只看成功的登录：**
```bash
grep "SUCCESS" login_attempts.log | tail -20
```

**查看特定IP的尝试：**
```bash
grep "192.168.1.100" login_attempts.log
```

### 日志清理

**自动清理：**
- 每天自动清理30天前的日志
- 保留最近的活动记录

**手动清理：**
```bash
# 清空日志
> login_attempts.log

# 删除日志文件
rm login_attempts.log
```

## 防护效果

### 攻击场景1：暴力破解

```
攻击者尝试多个密码
第1次：admin/password1 → 失败 (1/5)
第2次：admin/password2 → 失败 (2/5)
第3次：admin/password3 → 失败 (3/5)
第4次：admin/password4 → 失败 (4/5)
第5次：admin/password5 → 失败 (5/5) → 🚫 IP锁定15分钟

✅ 防护有效：5次失败后即被阻止
```

### 攻击场景2：字典攻击

```
攻击者尝试常见密码列表
第1次：admin/admin → 失败 (1/5)
第2次：admin/test → 失败 (2/5)
...
第100次：admin/qwerty → 失败 (5/5) → 🚫 IP锁定15分钟

✅ 防护有效：早期即被阻止
```

### 攻击场景3：多IP轮换

```
攻击者使用多个IP
IP1: 失败5次 → 锁定
IP2: 失败5次 → 锁定
IP3: 失败5次 → 锁定
...

📊 日志清晰显示：多个IP同时攻击
✅ 每个IP都被独立阻止
```

## 总结

✅ 已完成：登录日志记录系统
✅ 已完成：详细信息记录（时间、IP、用户名、密码）
✅ 已完成：日志文件持久化
✅ 已完成：失败次数限制（5次后锁定15分钟）
✅ 已完成：IP锁定机制
✅ 已完成：管理员查看API
✅ 已完成：自动日志清理（30天）
✅ 已完成：彩色控制台输出
✅ 已完成：内存管理（保留最近1000条）

**安全效果：**
- 🚫 防止暴力破解攻击
- 🚫 防止字典攻击
- 🚫 防止频繁尝试
- 📊 记录所有登录活动
- 🔍 便于安全审计
- 🛡️ 有效的IP锁定机制

现在你的视频服务具有完整的登录安全保护！所有登录尝试都会被详细记录，可疑活动会被及时发现和阻止。
