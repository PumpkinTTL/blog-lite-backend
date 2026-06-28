# R10 前端表单校验补全

## 问题

v2 前端表单普遍缺失正则校验。v1 版本的 LoginModal 有邮箱正则（`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`），但 v2 重写时没有移植过来。整个 `src/utils/` 下无共享校验文件，正则只能散落各组件，而 v2 组件里基本没写。

全项目唯一的输入正则曾是 `UserCenter.vue` 的手机号校验——除此之外 v2 所有表单输入都只靠 `if (!field)` 和 `.length`。

## 解决方案

### 1. 新建共享校验工具 `src/utils/validate.ts`

集中维护正则，避免散落：

```ts
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isEmail = (v) => EMAIL_RE.test(v.trim())

export const CODE_RE = /^\d{6}$/
export const isVerificationCode = (v) => CODE_RE.test(v.trim())

export const MIN_PASSWORD_LEN = 6
export const isValidPassword = (v) => v.length >= MIN_PASSWORD_LEN

export const PHONE_RE = /^1[3-9]\d{9}$/
export const isPhone = (v) => PHONE_RE.test(v.trim())

export const isLoginAccount = (v) => /^\d+$/.test(s) || isEmail(s)  // 邮箱或纯数字 ID
export const isValidNickname = (v) => v.length >= 2 && v.length <= 20
```

### 2. LoginModal 补齐（4 个表单）

| 表单 | 字段 | 补充前 | 补充后 |
|------|------|--------|--------|
| 密码登录 | account | 仅非空 | isLoginAccount（邮箱/数字 ID 判定） |
| 验证码登录 | email | 仅非空 | **isEmail** |
| 验证码登录 | code | 仅非空 | **isVerificationCode（6位数字）** |
| 注册 | nickname | 手写长度 | isValidNickname |
| 注册 | email | 仅非空 | **isEmail** |
| 注册 | password | 仅 length<6 | isValidPassword |
| 忘记密码 | email | 仅非空 | **isEmail** |
| 忘记密码 | code | 仅非空 | **isVerificationCode** |
| 忘记密码 | newPassword | 仅 length<6 | isValidPassword |

### 3. UserCenter 补齐

| 字段 | 补充前 | 补充后 |
|------|--------|--------|
| 昵称 | 无最小长度 | isValidNickname（2-20） |
| 简介 | **无任何校验** | 长度上限 200 |
| 手机号 | 宽松正则 `/^[0-9+\-\s]{6,20}$/` | **isPhone（从严 ^1[3-9]\d{9}$）** |
| 改密-邮箱 | 仅非空 | isEmail |
| 改密-验证码 | 仅非空 | isVerificationCode |
| 改密-新密码 | **完全无长度校验** | isValidPassword |
| 换绑-新邮箱 | 仅非空 | isEmail |
| 换绑-验证码 | 仅非空 | isVerificationCode |

## 设计原则

- **校验归 UI 层**：API 层（`apis/user.ts`）不做校验，职责分离
- **正则集中维护**：统一在 `validate.ts`，避免多组件重复
- **与后端 DTO 对齐**：密码 ≥6 位（后端 `@MinLength(6)`）、昵称 2-20（后端 `@MinLength(2) @MaxLength(20)`）
- **trim 处理**：邮箱类输入先 trim 再校验，避免首尾空格

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/utils/validate.ts` | **新建**，共享校验工具 |
| `src/components/v2/auth/LoginModal.vue` | 4 个表单补齐校验 |
| `src/components/v2/user/UserCenter.vue` | 昵称/简介/手机号/改密/换绑补齐校验 |
