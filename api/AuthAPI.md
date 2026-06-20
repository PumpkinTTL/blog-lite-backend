# Auth Center API 文档

> 统一鉴权中心对外接口说明（子端对接参考）。本文档以鉴权中心源码实现为准。
> 本项目（blog-lite）作为子端，使用其中标注「子端调用」的接口。

## 通用说明

### 响应格式

所有接口统一返回 JSON：

```json
// 成功
{ "success": true, "data": {...}, "message": "...", "timestamp": "ISO 8601" }

// 失败
{ "success": false, "message": "错误描述", "timestamp": "ISO 8601" }
// 参数校验失败时额外返回 details 字段
```

### 鉴权方式

| 接口类型 | 鉴权方式 | 说明 |
|---------|---------|------|
| **公开接口** | 无 | `/health`、`/jwks/*` |
| **Token 接口** | 请求体 `clientId` + `clientSecret` | `/auth/*`，子端服务端调用，**绝不暴露给前端** |
| **管理员接口** | 管理员 Token（Cookie 或 Bearer） | `/app`、`/tokenadmin`、`/keyadmin`、`/logadmin`、`/configadmin`、`/dashboard` |

**关于管理员 Token 的两种传递方式**（源码 `middleware/auth.js` 的 `adminAuth`）：
- 优先从 httpOnly Cookie `admin_token` 读取（浏览器场景，登录后自动携带）
- 兼容 `Authorization: Bearer <token>` 头（API 调用、Postman 等场景）

---

## 基础接口（公开）

### GET /health

健康检查，返回服务状态及 DB/Redis 连接状态。

```json
{
  "status": "ok",
  "service": "auth-center",
  "db": "connected",
  "redis": "connected",
  "timestamp": "..."
}
```

### GET /jwks/.well-known/jwks.json

JWKS 公钥端点。子端获取公钥后用 EdDSA 算法本地验签 JWT，**推荐子端缓存此结果**（鉴权中心内部已做 5 分钟 JWKS 缓存）。

---

## Token 服务（子端接口，`/auth`）

> **所有 `/auth` 接口由子端服务端调用**，`clientSecret` 绝不能出现在前端代码中。

### POST /auth/token

签发或刷新双 Token。**必须由子端后端调用**。

**两种用法：**

#### 1. 签发（用户登录）

子端验证自己用户身份后，调用此接口换取双 Token。

| 字段 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| clientSecret | 是 | 子端应用密钥 |
| userId | 是 | 用户 ID |
| deviceId | 是 | 设备 ID |
| accessCustomData | 否 | Access Token 自定义数据（对象，子端可存角色/昵称等） |
| refreshCustomData | 否 | Refresh Token 自定义数据（对象） |
| accessTtl | 否 | Access Token 过期时间（秒），上限 1 天 |
| refreshTtl | 否 | Refresh Token 过期时间（秒），上限 30 天 |

#### 2. 续签（Access Token 过期后）

传 `grantType: 'refresh_token'` + `refreshToken` + `deviceId`，续签时旧 Refresh Token 自动失效。

| 字段 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| clientSecret | 是 | 子端应用密钥 |
| grantType | 是 | 固定 `refresh_token` |
| refreshToken | 是 | 旧的 Refresh Token |
| deviceId | 是 | 设备 ID（必须与签发时一致） |
| accessTtl / refreshTtl | 否 | 覆盖默认过期时间 |
| accessCustomData / refreshCustomData | 否 | 覆盖自定义数据 |

**返回：**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",      // JWT，EdDSA 签名
    "refreshToken": "v4.public...",  // 随机字符串
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

> ⚠️ **文档勘误**：早期版本将续签描述为独立的 `POST /auth/refresh` 端点。实际实现中续签复用 `POST /auth/token`（带 `grantType`），无独立 `/auth/refresh` 端点。

### POST /auth/verify ⚠️ 调试接口

中心化验签 Access Token。**生产环境建议子端通过 JWKS 公钥本地验签**，不依赖此接口（减少对鉴权中心的依赖）。

**请求头：** `Authorization: Bearer <access_token>`

```json
{
  "success": true,
  "data": {
    "userId": "u001",
    "clientId": "93e1f309-...",
    "valid": true,
    "payload": { ... }
  }
}
```

### POST /auth/revoke

吊销单个 Refresh Token（用户登出场景）。

**特点：无需任何鉴权**（不要求 accessToken 或 admin token），AT 过期时仍可正常登出。

| 字段 | 必填 | 说明 |
|------|:----:|------|
| refreshToken | 是 | 要吊销的 Refresh Token |

```json
{ "success": true, "data": null, "message": "Token 已吊销" }
```

### POST /auth/revoke-by-user 🆕

按 userId 批量吊销 Token（**封禁用户场景，子端服务端调用**）。

**设计动机**：子端封禁用户时需要立即吊销其所有会话，防止被封用户用旧 Refresh Token 无限续签消耗鉴权中心资源。本接口让子端用**自身凭据**（clientId/secret）吊销**自己应用内**的指定用户 Token，无需管理员密钥，作用域受限、安全可控。

| 字段 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| clientSecret | 是 | 子端应用密钥 |
| userId | 是 | 要吊销的用户 ID |
| deviceId | 否 | 传则只吊销该设备；不传吊销该用户所有设备 |

**鉴权**：用 clientId + clientSecret 校验子端身份（与 `/auth/token` 一致），**无需管理员密钥**。

**作用域限制**：只能吊销该 `clientId` 下该 `userId` 的 Token，**跨不了子端**。

**典型流程（子端封禁用户）：**

```
子端管理员点"封禁"
  → ① 子端更新 user.status = disabled
  → ② 子端调用 POST /auth/revoke-by-user { clientId, clientSecret, userId }
  → 鉴权中心删除该用户在该应用下的所有 Refresh Token
  → 被封用户的旧 Access Token 15 分钟内自然过期，Refresh Token 已失效无法续签
  → 彻底闭环，无攻击窗口
```

```json
{ "success": true, "data": null, "message": "Token 已吊销" }
```

**错误码：**

| HTTP | 说明 |
|------|------|
| 400 | 参数校验失败（缺 clientId/clientSecret/userId） |
| 401 | 无效的 clientId 或 clientSecret |
| 403 | 应用已被禁用 |

---

## 管理员认证

### POST /admin/login

管理员登录，获取管理员 Token。Token 通过 httpOnly Cookie 下发（`admin_token`），有效期 1 小时，**绑定 IP + User-Agent 指纹**（IP 或 UA 变化会导致 Token 失效）。

| 字段 | 必填 | 说明 |
|------|:----:|------|
| secret | 是 | 管理员密钥（环境变量 `ADMIN_SECRET_KEY`） |

```json
{ "success": true, "data": { "expiresIn": 3600, "tokenType": "Bearer" }, "message": "登录成功" }
```

> ⚠️ 管理员 Token 是鉴权中心最高权限，能管理所有子端、密钥、配置。**严禁泄露，严禁分发给子端业务系统使用**。子端封禁用户应使用 `/auth/revoke-by-user`，而非管理员接口。

### POST /admin/logout

清除管理员 Cookie。

---

## 子端应用管理（管理员，`/app`）

所有接口需要管理员 Token。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /app | 注册新子端应用（clientSecret 仅展示一次） |
| GET | /app | 获取所有子端应用列表 |
| GET | /app/:id | 获取单个应用详情（不含 clientSecret） |
| PUT | /app/:id | 更新应用信息 |
| PATCH | /app/:id/status | 启用/禁用应用（`{ status: 0 或 1 }`） |
| POST | /app/:id/reset-secret | 重置应用密钥（新密钥仅展示一次） |

---

## Token 管理（管理员，`/tokenadmin`）

所有接口需要管理员 Token。

### GET /tokenadmin/tokens

获取所有活跃的 Refresh Token 列表（SCAN 遍历 Redis）。

### DELETE /tokenadmin/tokens

吊销指定用户的 Refresh Token。

**Query 参数：**

| 参数 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| userId | 是 | 用户 ID |
| deviceId | 否 | 传则吊销指定设备，不传吊销该用户所有设备 |

> 💡 **此接口与 `/auth/revoke-by-user` 的区别**：
> - `/tokenadmin/tokens`：管理员接口，可操作**任意子端**的任意用户（跨子端权限）
> - `/auth/revoke-by-user`：子端接口，只能操作**自己**的用户（作用域受限）
>
> **子端封禁用户应优先用 `/auth/revoke-by-user`**，无需持有管理员密钥。

---

## 密钥管理（管理员，`/keyadmin`）

所有接口需要管理员 Token。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /keyadmin/keys | 获取所有密钥列表 |
| POST | /keyadmin/keys | 生成新 Ed25519 密钥对（状态 ready） |
| PATCH | /keyadmin/keys/:kid/status | 更新密钥状态（ready→active→retired→deprecated） |
| DELETE | /keyadmin/keys/:kid | 删除密钥（仅 ready/deprecated 可删） |

---

## 日志管理（管理员，`/logadmin`）

所有接口需要管理员 Token。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /logadmin/files | 获取日志文件列表 |
| GET | /logadmin/content | 读取日志内容（支持 level/search/limit 筛选） |
| GET | /logadmin/export | 下载原始日志文件 |

---

## 仪表盘（管理员，`/dashboard`）

需要管理员 Token。

### GET /dashboard/stats

服务器、进程、Redis、应用综合统计。活跃 Token 数有 30 秒缓存。

---

## 系统配置管理（管理员，`/configadmin`）

需要管理员 Token。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /configadmin/configs | 获取所有配置项（限流、Token TTL 等） |
| PUT | /configadmin/configs/:key | 更新配置项（修改限流配置会自动清缓存立即生效） |

---

## 子端接入指南

### 接入流程

```
┌──────────┐     登录请求      ┌──────────┐    POST /auth/token      ┌──────────────┐
│  子端前端  │ ──────────────→ │  子端后端  │ ──────────────────────→ │  鉴权中心      │
│          │ ←────────────── │          │ ←────────────────────── │              │
│          │   返回双 Token    │          │   accessToken(JWT) +    │              │
│          │                  │          │   refreshToken(随机串)   │              │
└──────────┘                  └──────────┘                          └──────────────┘
      │                                                                    │
      │  1. 携带 accessToken 访问资源                                       │
      │  2. 子端通过 JWKS 公钥本地验签（推荐）                               │
      │  3. accessToken 过期 → 子端后端调 POST /auth/token 续签            │
      │  4. 登出 → 子端前端/后端调 POST /auth/revoke                        │
      │  5. 封禁用户 → 子端后端调 POST /auth/revoke-by-user                │
      └────────────────────────────────────────────────────────────────────┘
```

### 步骤

1. **管理员注册应用**：`POST /app` 获取 `clientId` 和 `clientSecret`
2. **用户登录**：子端前端 → 子端后端 → `POST /auth/token`（后端调用，不暴露 secret）
3. **验签 Token**：子端通过 `GET /jwks/.well-known/jwks.json` 获取公钥，本地验签 JWT
4. **刷新 Token**：子端后端调 `POST /auth/token`（带 `grantType: refresh_token`）
5. **登出**：调 `POST /auth/revoke`（公开接口，前端或后端均可）
6. **封禁用户**：子端后端调 `POST /auth/revoke-by-user`（用 clientId/secret，无需管理员密钥）

### 安全注意事项

- `clientSecret` 只能存在于子端后端，**绝对不能暴露给前端**
- 签发、续签、按用户吊销接口必须走子端后端中转
- 登出接口（`/auth/revoke`）可前端直接调
- 验签建议通过 JWKS 公钥本地完成，减少对鉴权中心的依赖
- `refreshToken` 建议存储在 httpOnly Cookie，避免存 localStorage（XSS 风险）
- **不要用管理员密钥（`ADMIN_SECRET_KEY`）做子端业务**——封禁用户请用 `/auth/revoke-by-user`

---

## 接口总览

| 接口 | 方法 | 鉴权 | 用途 |
|------|------|------|------|
| /health | GET | 无 | 健康检查 |
| /jwks/.well-known/jwks.json | GET | 无 | JWKS 公钥 |
| /auth/token | POST | clientId/secret | 签发 + 续签双 Token |
| /auth/verify | POST | accessToken | 验签（调试用） |
| /auth/revoke | POST | 无 | 吊销单个 Refresh Token |
| /auth/revoke-by-user | POST | clientId/secret | 按 userId 批量吊销（封禁场景）🆕 |
| /admin/login | POST | ADMIN_SECRET_KEY | 管理员登录 |
| /admin/logout | POST | 无 | 管理员登出 |
| /app | GET/POST | admin | 子端应用管理 |
| /app/:id | GET/PUT | admin | 单个应用 |
| /app/:id/status | PATCH | admin | 启用/禁用应用 |
| /app/:id/reset-secret | POST | admin | 重置密钥 |
| /tokenadmin/tokens | GET/DELETE | admin | Token 管理（跨子端） |
| /keyadmin/keys | GET/POST | admin | 密钥管理 |
| /keyadmin/keys/:kid | PATCH/DELETE | admin | 单个密钥 |
| /logadmin/* | GET | admin | 日志管理 |
| /dashboard/stats | GET | admin | 仪表盘 |
| /configadmin/configs | GET/PUT | admin | 系统配置 |
