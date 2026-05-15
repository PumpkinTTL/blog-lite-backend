# Auth Center API 文档

## 通用说明

### 响应格式

所有接口统一返回：

```json
// 成功
{ "success": true, "data": {...}, "message": "..." }

// 失败
{ "success": false, "message": "错误描述", "errors": [...] }  // errors 仅参数校验失败时出现
```

### 鉴权方式

| 类型 | 方式 |
|------|------|
| 管理员接口 | 先调用 `POST /admin/login` 获取 Token（存储在 httpOnly Cookie），后续请求自动携带 Cookie，或使用 `Authorization: Bearer <token>` 头 |
| Token 接口 | 请求体携带 `clientId` + `clientSecret` |

---

## 基础接口

### GET /health

健康检查，返回服务状态及 DB/Redis 连接状态。

```json
{
  "status": "ok",
  "service": "auth-center",
  "version": "1.1.0",
  "db": "connected",
  "redis": "connected",
  "timestamp": "2025-05-13T10:00:00.000Z"
}
```

### GET /jwks/.well-known/jwks.json

JWKS 公钥端点，子端获取公钥后可本地验签 JWT。响应缓存 1 小时。

---

## Token 服务

### 调用方说明

| 接口 | 调用方 | 原因 |
|------|--------|------|
| `/auth/token`（签发） | **子端后端** | 需要 `clientSecret`，不能暴露给前端 |
| `/auth/refresh`（续签） | 子端前端或后端 | 只需 `refreshToken`，无需 secret |
| `/auth/revoke`（吊销） | 子端前端或后端 | 只需 `refreshToken`，无需 secret |
| `/auth/verify`（验签） | 不推荐调用 | 子端应通过 JWKS 公钥本地验签 |

### POST /auth/token

签发双 Token。**必须由子端后端调用**，不能从前端直接请求（会暴露 clientSecret）。

子端后端流程：验证自己用户身份 → 调用此接口 → 将返回的双 Token 交给前端。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| clientSecret | 是 | 子端应用密钥 |
| userId | 是 | 用户 ID |
| deviceId | 是 | 设备 ID |
| accessCustomData | 否 | Access Token 自定义数据（对象） |
| refreshCustomData | 否 | Refresh Token 自定义数据（对象） |
| accessTtl | 否 | Access Token 过期时间（秒），默认应用配置 |
| refreshTtl | 否 | Refresh Token 过期时间（秒），默认应用配置 |

**返回：**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "v4.public...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### POST /auth/refresh

续签 Token。Access Token 过期后使用 Refresh Token 换取新的双 Token。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| refreshToken | 是 | 旧的 Refresh Token |
| deviceId | 是 | 设备 ID |
| accessTtl | 否 | 新 Access Token 过期时间（秒） |
| refreshTtl | 否 | 新 Refresh Token 过期时间（秒） |
| accessCustomData | 否 | 覆盖 Access Token 自定义数据 |
| refreshCustomData | 否 | 覆盖 Refresh Token 自定义数据 |

**返回：** 同 `/auth/token`。续签时旧的 Refresh Token 自动失效。

### POST /auth/revoke

吊销 Token（登出）。无需 accessToken 鉴权，Token 过期后仍可正常登出。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| refreshToken | 是 | 要吊销的 Refresh Token |

**返回：**

```json
{ "success": true, "message": "Token 已吊销" }
```

### POST /auth/verify ⚠️ 调试接口

中心化验签 Token。生产环境建议子端通过 JWKS 公钥本地验签，不依赖此接口。

**请求头：** `Authorization: Bearer <access_token>`

**返回：**

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

---

## 管理员认证

### POST /admin/login

管理员登录，获取管理后台访问 Token。Token 存储在 httpOnly Cookie 中，有效期 1 小时，绑定设备指纹（IP + User-Agent）。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| secret | 是 | 管理员密钥（环境变量 `ADMIN_SECRET_KEY`） |

**返回：**
```json
{ "success": true, "message": "登录成功" }
```

Cookie 会自动设置，后续访问管理员接口时会自动携带。

---

### POST /admin/logout

管理员登出，清除 Cookie。

**返回：**
```json
{ "success": true, "message": "登出成功" }
```

---

## 子端应用管理

所有接口需要管理员 Token（通过 `/admin/login` 获取）。

### POST /app

注册新子端应用。`clientSecret` 仅在创建和重置时返回，不会存储明文。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| name | 是 | 应用名称（1-64 字符） |
| description | 否 | 应用描述（最长 255 字符） |
| allowedOrigins | 否 | 允许的来源列表（数组） |
| maxDevices | 否 | 单用户最大设备数（1-100，默认 5） |

**返回：**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "My App",
    "clientId": "93e1f309-ba02-4f3b-b374-ff0f7335b0a7",
    "clientSecret": "原始密钥，仅展示一次",
    "status": 1,
    "maxDevices": 5
  },
  "message": "应用注册成功，clientSecret 仅展示一次请妥善保管"
}
```

### GET /app

获取所有子端应用列表。返回数据不含 `clientSecret`。

### GET /app/:id

获取单个应用详情。返回数据不含 `clientSecret`。

### PUT /app/:id

更新应用信息，同创建时的字段（均为可选）。

### PATCH /app/:id/status

启用/禁用应用。

**请求体：** `{ "status": 0 }` 或 `{ "status": 1 }`

### POST /app/:id/reset-secret

重置应用密钥。新 `clientSecret` 仅返回一次。

---

## Token 管理（管理员）

所有接口需要管理员 Token（通过 `/admin/login` 获取）。

### GET /tokenadmin/tokens

获取所有活跃的 Refresh Token 列表。

### DELETE /tokenadmin/tokens

吊销指定用户的 Refresh Token。

**Query 参数：**

| 参数 | 必填 | 说明 |
|------|:----:|------|
| clientId | 是 | 子端应用 ID |
| userId | 是 | 用户 ID |
| deviceId | 否 | 传则吊销指定设备，不传则吊销该用户所有设备 |

---

## 密钥管理（管理员）

所有接口需要管理员 Token（通过 `/admin/login` 获取）。

### GET /keyadmin/keys

获取所有密钥列表（含状态和公钥）。

### POST /keyadmin/keys

生成新的 Ed25519 密钥对，初始状态为 `ready`。

### PATCH /keyadmin/keys/:kid/status

更新密钥状态。

**请求体：** `{ "status": "active|ready|retired|deprecated" }`

状态流转：`ready` → `active` → `retired` → `deprecated` → 删除

### DELETE /keyadmin/keys/:kid

删除密钥。仅 `ready` 或 `deprecated` 状态可删除。

---

## 日志管理（管理员）

所有接口需要管理员 Token（通过 `/admin/login` 获取）。

### GET /logadmin/files

获取所有日志文件列表。

**返回：**

```json
{
  "success": true,
  "data": [
    { "type": "auth", "name": "auth-2025-05-13.log", "size": 20480, "modifiedAt": "..." }
  ]
}
```

### GET /logadmin/content

读取日志文件内容，支持筛选。

**Query 参数：**

| 参数 | 必填 | 说明 |
|------|:----:|------|
| type | 是 | `auth` 或 `system` |
| date | 是 | 日期，格式 `YYYY-MM-DD` |
| level | 否 | 日志级别过滤：`info` / `warn` / `error` |
| search | 否 | 关键词搜索 |
| limit | 否 | 返回条数，默认 200 |

**返回：**

```json
{
  "success": true,
  "data": {
    "lines": [ { "level": "info", "message": "...", "timestamp": "..." } ],
    "total": 150
  }
}
```

### GET /logadmin/export

下载原始日志文件。

**Query 参数：** `type`（auth/system）、`name`（文件名）

返回文件流，浏览器直接下载。

---

## 仪表盘（管理员）

需要管理员 Token（通过 `/admin/login` 获取）。

### GET /dashboard/stats

获取服务器、进程、Redis、应用的综合统计数据。

**返回：**
```json
{
  "success": true,
  "data": {
    "server": {
      "hostname": "server-01",
      "platform": "linux",
      "arch": "x64",
      "nodeVersion": "v20.0.0",
      "cpuCount": 4,
      "cpuModel": "Intel(R) Core(TM) i5-10200H CPU @ 2.40GHz",
      "cpuUsage": 15.2,
      "memTotal": 16384,
      "memUsed": 8192,
      "memPercent": 50.0,
      "uptime": 86400,
      "loadAvg": [0.5, 0.6, 0.55]
    },
    "process": {
      "rss": 256,
      "heapUsed": 128,
      "heapTotal": 256,
      "pid": 12345,
      "uptime": 3600
    },
    "redis": {
      "usedMemory": "256M",
      "peakMemory": "512M",
      "maxMemory": "1G",
      "connectedClients": 5,
      "totalKeys": 1024
    },
    "app": {
      "totalApps": 10,
      "activeApps": 8,
      "activeTokens": 256
    }
  }
}
```

- 活跃 Token 数量有 30 秒缓存（避免频繁全量 SCAN）
- 单位：内存 MB、时间 秒、CPU 使用率 百分比

---

## 系统配置管理（管理员）

需要管理员 Token（通过 `/admin/login` 获取）。

### GET /configadmin/configs

获取所有系统配置项（限流配置、Token 过期时间等）。

**返回：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "configKey": "rate_limit_global_limit",
      "configValue": "200",
      "description": "全局限流次数（15分钟）"
    },
    {
      "id": 2,
      "configKey": "rate_limit_global_window",
      "configValue": "900000",
      "description": "全局限流时间窗口（毫秒）"
    }
  ]
}
```

---

### PUT /configadmin/configs/:key

更新单个配置项。

**请求体：**

| 字段 | 必填 | 说明 |
|------|:----:|------|
| value | 是 | 配置值（字符串） |
| description | 否 | 配置描述（可选） |

**特殊行为：**
- 修改限流配置（`rate_limit_*`）会自动清除限流器缓存，使新配置立即生效

**返回：**
```json
{ "success": true, "message": "配置已更新" }
```

---

## 子端接入指南

### 接入流程

```
┌──────────┐     登录请求      ┌──────────┐    POST /auth/token     ┌──────────────┐
│  子端前端  │ ──────────────→ │  子端后端  │ ──────────────────────→ │  鉴权中心      │
│          │ ←────────────── │          │ ←────────────────────── │              │
│          │   返回双 Token    │          │    返回 accessToken +   │              │
│          │                  │          │    refreshToken          │              │
└──────────┘                  └──────────┘                          └──────────────┘
      │                                                                    │
      │  1. 携带 accessToken 访问资源                                       │
      │  2. 通过 JWKS 公钥本地验签（推荐）                                   │
      │  3. accessToken 过期后 POST /auth/refresh 续签                     │
      │  4. 登出时 POST /auth/revoke                                       │
      └────────────────────────────────────────────────────────────────────┘
```

### 步骤

1. **管理员注册应用**：调用 `POST /app` 获取 `clientId` 和 `clientSecret`
2. **用户登录**：子端前端 → 子端后端 → 鉴权中心 `POST /auth/token`（后端调用，不暴露 secret）
3. **验签 Token**：子端通过 `GET /jwks/.well-known/jwks.json` 获取公钥，本地验签 JWT
4. **刷新 Token**：前端直接调用 `POST /auth/refresh`，无需 secret
5. **登出**：前端直接调用 `POST /auth/revoke`

### 注意事项

- `clientSecret` 只能存在于子端后端，**绝对不能暴露给前端**
- 签发接口必须走子端后端中转，续签和吊销可以前端直接调
- 验签建议通过 JWKS 公钥本地完成，减少对鉴权中心的依赖
- `refreshToken` 应安全存储（建议 httpOnly Cookie），不要存在 localStorage
