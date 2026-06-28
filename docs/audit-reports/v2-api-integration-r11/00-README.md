# 第十一轮代码审计与优化（R11）

> 日期：2026-06-28
> 范围：上线前敏感接口安全审计（越权/IDOR/权限/注入/限流/信息泄漏/业务逻辑）
> 重点：上线前最后的安全把关

---

## 审计结论

**上线阻断项（高危）：无。** 🎉

代码安全工程水平很高，五类核心风险均已正确防护：
- 越权（IDOR）：所有受保护操作从 JWT `req.user.sub` 取身份，无 `req.body.userId`
- 权限：34 个 Controller 的 `@Roles('admin')` / `@Public()` 装饰器齐全
- 注入：全参数化 SQL + LIKE 转义 + 排序白名单
- 限流：所有高风险接口覆盖 Redis 双层限流 + 违规自动拉黑
- 信息泄漏：错误响应屏蔽内部细节 + PII 多处脱敏 + 日志无明文凭证

## 本轮修复项

| # | 问题 | 严重度 | 修复 | 文件 |
|---|------|--------|------|------|
| 1 | toggleInteract 用裸 `@Body()` 无 DTO，`forbidNonWhitelisted` 不生效 | 低 | 抽 `ToggleInteractDto`（`@IsIn(['like','favorite'])`），与其他接口风格统一 | `post.dto.ts` + `post.controller.ts:213-225` |

## 确认安全的设计（值得固化）

| 设计 | 位置 | 说明 |
|------|------|------|
| 恒定时间 bcrypt 比较 | `user.service.ts:122` | 防登录时序攻击 |
| `forbidNonWhitelisted` 全局开启 | `main.ts:39` | 拒绝 DTO 外的额外字段 |
| 兑换码条件 UPDATE 防超发 | `code.service.ts:185-214` | `usedCount < maxUses` + affected 检查 |
| grant 悲观锁防并发 | `membership.service.ts:287` | `setLock('pessimistic_write')` |
| 验证码用完即焚 | `email-code.service.ts:107` | 校验成功/达上限后 `redis.del` |
| PII 脱敏 | comment/resource/post 多处 | sanitizeUser 只返回 id/nickname/avatar |
| 错误响应屏蔽 | `all-exceptions.filter.ts:40-48` | 原生错误吞成「服务器内部错误」 |
| 限流违规自动拉黑 | `rate-limit.guard.ts:104-132` | 累计违规触发黑名单 |

## 已知限制（非阻断，上线后优化）

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | 兑换码 useCode 与 grant 的 TOCTOU 窗口 | 中 | 极端并发下码可能被消耗但未开通；grant 内部已有事务二次校验兜底，降级场景已 preCheck 拦截，影响面有限。修复需重构事务边界（useCode 移进 grant 事务），风险 > 收益，上线后优化 |
| 2 | settings 表无敏感字段掩码 | 低-中 | 若运营写入 SMTP/支付密钥到 settings，会明文返回 admin。当前无实际敏感数据，需配合运维规范 |
| 3 | 9router API key 历史泄漏 | 低（运维） | 代码已改用环境变量，但旧明文 key 需在 9router 后台作废轮换 |
| 4 | 默认管理员密码 admin123 | 低（运维） | seed 写入的 bootstrap 密码，上线 checklist 强制改密 |
| 5 | codes.code 唯一性 | ✅ 已确认 | DB 层有 unique 索引兜底，batchCreate 并发碰撞会被 DB 拦截 |

## 上线前运维 checklist

- [ ] 改默认管理员密码（admin123 → 强密码）
- [ ] 轮换 9router API key（旧明文 key 已泄漏）
- [ ] 确认 SMTP/支付/存储密钥不写入 settings 表（用环境变量）
- [ ] 确认生产 Redis 版本（hmset 已全版本兼容，无阻断）

## 验证

| 检查项 | 结果 |
|--------|------|
| 后端 `tsc --noEmit` | ✅ |
| codes.code unique 索引 | ✅ 已确认存在 |
| toggleInteract DTO 校验 | ✅ IsIn 白名单生效 |
