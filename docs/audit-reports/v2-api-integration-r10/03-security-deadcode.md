# R10 PII 泄漏修复 + username 死代码清理

## 一、PII 泄漏修复（安全）

### 问题

文章列表/详情接口的 author 对象返回完整用户信息：

```ts
// 原代码（post.service.ts）
.leftJoinAndSelect('p.author', 'author')  // 无 select 限制，返回所有字段
```

`leftJoinAndSelect` 默认拿关联实体的**所有列**，包括 `email`、`status` 等敏感字段。**任何人浏览文章都能拿到作者的 email**——这是公开接口的 PII（个人身份信息）泄漏。

### 验证（修复前）

```json
{
  "author": {
    "id": 662662833,
    "nickname": "超级管理员",
    "email": "admin@blog.local",   // ← 泄漏
    "status": "active",             // ← 泄漏
    ...
  }
}
```

### 修复

改为 `leftJoin` + `addSelect` 显式指定非敏感字段：

```ts
// 修复后（两处查询都改）
.leftJoin('p.author', 'author')
.addSelect(['author.id', 'author.nickname', 'author.avatar'])
```

### 验证（修复后）

```json
{
  "author": {
    "id": "662662833",
    "nickname": "超级管理员",
    "avatar": "https://..."
  }
}
// email/status/password 全部不返回 ✅
```

### 涉及文件

`backend/api/src/modules/post/post.service.ts:88-92, 416-420`（列表查询 + 回收站查询两处）

---

## 二、username 死代码清理

### 背景

前几轮已删除后端 `users.username` 字段（改为 id + nickname 架构）。但前端大量残留：
- **类型定义**里仍有 `username` 字段（后端永不返回，死字段）
- **显示逻辑**里仍有 `nickname || username` 兜底分支（username 永远 undefined，死分支）

### 清理范围

#### 管理后台（admin）- 类型定义删 username（8 文件）

| 文件 | 改动 |
|------|------|
| `api/user.ts` | User 接口删 `username?` |
| `api/comment.ts` | CommentUser 删 username |
| `api/dashboard.ts` | RecentUser 删 username |
| `api/post.ts` | PostAuthor 删 username |
| `api/interaction.ts` | AdminInteractionUser 删 username |
| `api/media.ts` | uploader 删 username |
| `api/r2-storage.ts` | uploader 删 username |
| `api/membership.ts` | `Pick<User, 'id' \| 'username' \| 'nickname'>` → 删 username |
| `stores/tokenState.ts` | UserInfo 删 username |

#### 管理后台 - 兜底分支删 `|| username`（7 文件 9 处）

| 文件 | 位置 |
|------|------|
| `components/ai/AgentPanel.vue` | info?.nickname 兜底 |
| `views/comment/IndexView.vue` | replyToUser + user（2 处）|
| `views/dashboard/IndexView.vue` | 列表 + greeting（2 处）|
| `views/interaction/IndexView.vue` | 头像首字母 + 名称（2 处）|
| `views/media/IndexView.vue` | uploader |
| `views/membership/IndexView.vue` | user |
| `views/user/IndexView.vue` | banningUser |

#### 前端 v2

| 文件 | 改动 |
|------|------|
| `apis/post.ts` | PostAuthor 删 username + **email + status**（配合 PII 修复）|
| `components/v2/detail/ArticleComments.vue` | 删 `|| c.user?.username` 兜底 |

### 保留项（非死代码）

- `stores/user.ts` 的 `username` getter —— 已重定义为 `nickname || 用户#id` 的显示名计算属性，被多处消费，保留
- `views/LoginView.vue` 的 `autocomplete="username"` —— 浏览器登录凭证 autofill 标准属性，保留
- v1 组件 —— 按规则不动

### 涉及文件统计

共 **19 处**清理（admin 17 + v2 2），跨 **17 个文件**。
