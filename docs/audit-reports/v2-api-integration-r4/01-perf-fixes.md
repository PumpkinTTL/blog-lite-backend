# R4 性能修复

> Redis 迁移 / N+1 / 缓存 / bundle 体积

---

## P0 性能瓶颈

### P0-1 EmailCodeService 内存 Map → Redis
- **问题**：验证码存进程内 Map，多实例部署不共享（A 发码 B 验证必失败）+ 重启丢失 + 防刷单实例维度
- **修复**：
  - 验证码用 Redis hash（code + attempts），TTL 10 分钟
  - 冷却用独立 key + `SET NX PX` 原子保证 60s 一次
  - 验证用 `HINCRBY attempts` 原子自增，防并发绕过次数上限
  - verifyCode 改 async，3 处调用方（user.controller × 2 + user.service）加 await
- **文件**：email-code.service.ts（整文件重写）+ user.controller.ts + user.service.ts

### P0-2 resource findAll N+1 查询
- **问题**：admin 列表对每个 private 资源单独查 visibility（Promise.all 只是并发，N 个 ID = N 条 SQL）
- **修复**：改用 `getVisibilityBatch`（一次 WHERE IN 查询），与 post.service 已有的批量方法对齐
- **文件**：resource.service.ts:93-116

### P0-3 dashboard getStats 20 个聚合查询无缓存
- **问题**：admin 每次刷新跑 20 个 COUNT/SUM/GROUP BY，频繁刷新压 DB
- **修复**：加 60s Redis 缓存（Redis 故障 catch 兜底直接查 DB）
- **文件**：dashboard.service.ts（注入 REDIS_CLIENT + getStats 拆成 getStats/computeStats）

### P0-4 interaction toggle + 计数原子化
- **问题**：findOne→save 并发双击触发 unique 约束；controller 的 count+update 计数竞态
- **修复**：
  - toggle 改 DELETE 优先（affected=1 已取消）+ INSERT catch unique（并发幂等）
  - 计数改原子 increment/decrement（`SET field = field + delta`），省 1 次查询 + 无竞态
- **文件**：interaction.service.ts:32-55 + post.controller.ts toggleInteract

### P0-5 setVisibility + grantAccess 并发安全
- **问题**：
  - setVisibility 的 delete+save 非事务，崩溃丢全部授权
  - grantAccess 的 read-modify-write 并发覆盖丢授权
- **修复**：
  - setVisibility 包 `dataSource.transaction`
  - 新增 `grantAccess(entityType, entityId, subjectType, subjectId)` 用 INSERT IGNORE（依赖 uq_entity_visibility 组合唯一约束）
  - resource.service.grantAccess 改调新方法
- **文件**：entity-visibility.service.ts + resource.service.ts:238-247

---

## P1 性能优化

### P1-1 LIKE 关键词转义 %/_
- **问题**：搜索 `100%` 匹配所有 `100` 开头；`_` 匹配任意单字符
- **修复**：
  - apply-filters.ts 导出 `escapeLike` 函数（转义 `\ % _`）+ LIKE 加 `ESCAPE '\\'`
  - code/comment/interaction/post 4 处手写 LIKE 全部应用
- **文件**：apply-filters.ts + code.service.ts + comment.service.ts + interaction.service.ts + post.service.ts

### P1-2 private 资源访问控制收紧（兼安全 + 性能）
- **问题**：private 资源对未授权用户返回 locked+元信息，可遍历 ID 探测
- **修复**：未授权直接返回 null（当作不存在），controller 返回 404
- **文件**：resource.service.ts findByIdForUser

---

## 前端 bundle 优化

### Font Awesome 条件加载
- **问题**：v2 用 lucide-vue-next，但 main.ts 无条件注册 ~120 个 Font Awesome 图标进 bundle
- **修复**：
  - 抽到 `src/setup/fontawesome.ts`（registerFontAwesome 函数）
  - main.ts 按 `VITE_THEME_VERSION === 'v1'` 条件动态 import，v2 部署不加载
- **文件**：src/setup/fontawesome.ts（新建）+ main.ts

### UserCenter/cropperjs 异步加载
- **问题**：UserCenter 静态 import cropperjs（~50KB），进首屏 chunk，但 99% 用户不打开个人中心
- **修复**：App.vue 改用 `defineAsyncComponent(() => import('@/components/v2/user/UserCenter.vue'))`
- **文件**：App.vue
