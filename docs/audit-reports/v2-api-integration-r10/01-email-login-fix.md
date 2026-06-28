# R10 邮箱验证码登录 500 修复

## 问题现象

调用 `POST /user/send-login-code` 发送登录验证码，接口返回：
```json
{ "success": false, "message": "服务器内部错误" }
```
HTTP 状态码 500。部分邮箱（如 163）能收到验证码邮件，但接口仍报 500；部分邮箱（如 gmail）同样报错。

## 根因定位

### 排查过程

1. 直接用 nodemailer 测试 SMTP 发送 → **成功**（SMTP 链路正常）
2. 检查 `request_logs` 表 → 记录了 500，但 `error_message` 只是被吞的「服务器内部错误」
3. 独立测试 Redis 操作 → **复现错误**：`ERR wrong number of arguments for 'hset' command`

### 根因

`emailCodeService.sendCode()` 存验证码用了 Redis 多字段 `hset` 写法：
```ts
// 原代码（email-code.service.ts）
await this.redis.hset(key, 'code', code, 'attempts', '0')
```

**开发环境的 Redis 版本 < 4.0，不支持多字段 hset 语法**（`HSET key f1 v1 f2 v2` 是 Redis 4.0+ 才支持的）。老版本只支持单字段 `HSET key field value`，多字段会报 `ERR wrong number of arguments`。

这个原生 Redis 错误不是 HttpException，被全局异常过滤器（`all-exceptions.filter.ts`）捕获后吞成了通用的「服务器内部错误」，掩盖了真实原因。

### 为什么邮件能发出但接口报 500

执行顺序：
1. `mailerService.sendVerifyCode()` 发邮件 → **成功**（邮件已投递）
2. `redis.hset(key, ...)` 存验证码 → **报错**（多字段语法不支持）
3. 错误向上抛，被全局过滤器吞成 500

所以用户收到了验证码，但接口返回 500，且后续的验证码登录也会失败（因为验证码没存进 Redis）。

## 修复方案

改用 `hmset`——**全版本兼容**（Redis 2.0+ 都支持多字段 hmset）：

```ts
// 修复后
await this.redis.hmset(key, 'code', code, 'attempts', '0')
await this.redis.pexpire(key, this.CODE_TTL)
```

### 为什么选 hmset 而不是两次单字段 hset

| 方案 | 兼容性 | 原子性 | 说明 |
|------|--------|--------|------|
| `hset(key, f1, v1, f2, v2)` | ❌ 需 4.0+ | ✅ 单命令 | 原方案，开发环境不支持 |
| `hmset(key, f1, v1, f2, v2)` | ✅ 全版本 | ✅ 单命令 | **采用**，生产 5+ 也支持 |
| 两次 `hset(key, field, value)` | ✅ 全版本 | ❌ 非原子 | 两条命令间可能被打断 |

`hmset` 是最稳的选择：一次命令设多字段，全版本兼容，保持原子性。

## 验证

```
[1] 发码 weekseven@163.com:  OK (success:true)
[2] 验证码: 309567
[3] 验证码登录: OK 登录成功
[4] profile: id=455336348 roles=["user"]
[5] membership level: null
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `backend/api/src/modules/email-code/email-code.service.ts` | `hset` 多字段 → `hmset` |
