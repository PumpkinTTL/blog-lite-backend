# 广告推广（Ad）完整功能实施报告

**日期**：2026-06-24
**范围**：后端 API + Admin GUI + v2 前端展示，跨三层完整闭环

---

## 一、功能概述

实现完整的广告推广系统：
- **三种投放位置**：侧边栏卡片（sidebar）、首页 Modal 弹窗（popup）、右下角浮窗（popup_toast）
- **样式**：图文卡片（card），复用现有 AdCard.vue 组件，组件本身未改动
- **排期投放**：startAt/endAt 支持时间窗口投放，null=不限
- **手动开关**：status (active/inactive)
- **统计追踪**：impressions/clicks 基础计数（原子自增，无独立事件表）
- **后台备注**：adminNote（含收益说明，仅管理可见，不对用户展示）

---

## 二、文件清单

### 后端 backend/api（7 文件）
| 文件 | 作用 |
|---|---|
| `modules/ad/ad.entity.ts` | AdEntity（17 字段 + 3 索引） |
| `modules/ad/ad.dto.ts` | CreateAdDto/UpdateAdDto/BatchIdsDto/TrackAdDto |
| `modules/ad/ad.service.ts` | findAll/findPublic/CRUD/toggleStatus/track（原子自增） |
| `modules/ad/ad-public.controller.ts` | @Public：GET /ad/public/list + POST /ad/public/track |
| `modules/ad/ad.controller.ts` | @Roles('admin')：CRUD + toggle-status + batch（batch 在 :id 前） |
| `modules/ad/ad.module.ts` | 模块注册 |
| `app.module.ts` | 注册 AdModule |

### Admin backend/admin（4 文件）
| 文件 | 作用 |
|---|---|
| `api/ad.ts` | API 封装 + Ad 接口类型 |
| `views/ad/IndexView.vue` | CRUD GUI（列表/筛选/弹窗表单/图片上传/启停切换） |
| `router/index.ts` | 注册 /ads 路由 |
| `layout/AdminLayout.vue` | 菜单项 + 面包屑（顺手补了缺失的 audit-logs 面包屑） |

### v2 前端（6 文件，2 新 4 改）
| 文件 | 作用 |
|---|---|
| `apis/ad.ts` | getPublicAds + trackAd |
| `components/v2/ad/AdPopup.vue` | **新建** 首页 Modal 弹窗（8s 自动关 + 当天去重） |
| `components/v2/ad/AdToast.vue` | **新建** 右下角浮窗（当天去重） |
| `stores/site.ts` | 加 ads 三元组 + fetchAds（照搬 announcements 缓存模式） |
| `components/v2/home/Sidebar.vue` | 硬编码 AdCard → 遍历 sidebar 广告 + 点击埋点 |
| `views/v2/Home.vue` | 挂载 AdPopup + AdToast |
| `components/v2/common/AdCard.vue` | **未改动**（按约定） |

---

## 三、字段设计（ads 表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | 广告 ID |
| title | varchar(100) | 标题（用户可见） |
| subtitle | varchar(255) NULL | 副标题/描述（用户可见） |
| image_url | varchar(500) NULL | 封面图 URL |
| button_text | varchar(50) default '了解详情' | CTA 按钮文字 |
| href | varchar(500) | 跳转链接（邀请码隐式拼在此） |
| position | varchar(20) | sidebar / popup / popup_toast |
| type | varchar(20) default 'card' | 样式类型（预留扩展） |
| status | varchar(20) default 'inactive' | active / inactive |
| start_at | datetime NULL | 排期开始（null=立即） |
| end_at | datetime NULL | 排期结束（null=长期） |
| sort_order | int default 0 | 同位置内排序（小在前） |
| impressions | int default 0 | 曝光计数 |
| clicks | int default 0 | 点击计数 |
| admin_note | varchar(500) NULL | 后台备注（含收益说明，不对用户展示） |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

**索引**：(position, status) 公开热路径 / sortOrder 排序 / createdAt 管理排序

---

## 四、API 接口

### 公开接口（@Public）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ad/public/list?position=sidebar` | 取投放中的广告（脱敏，无 adminNote） |
| POST | `/ad/public/track` | 埋点 `{id, type:'impression'|'click'}` |

### 管理接口（@Roles('admin')）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ad` | 列表（分页 + position/status/keyword 筛选） |
| GET | `/ad/:id` | 详情 |
| POST | `/ad` | 新建 |
| PUT | `/ad/:id` | 更新 |
| PUT | `/ad/:id/toggle-status` | active↔inactive 切换 |
| DELETE | `/ad/batch` | 批量删除（在 :id 之前） |
| DELETE | `/ad/:id` | 删除 |

---

## 五、关键设计决策

1. **公开查询脱敏**：findPublic 用 select 显式列，不返回 adminNote（后台备注含收益信息，绝不外泄）
2. **排期过滤在后端**：`startAt<=NOW() AND endAt>=NOW()`，前端不用判断时间
3. **埋点原子自增**：`qb.update().set({clicks: ()=> 'clicks + 1'})`，并发安全
4. **埋点容错**：广告被删后 track 静默返回（不打 error），前台 fire-and-forget 不受影响
5. **当天去重**：AdPopup/AdToast 用 localStorage `ad_popup_dismissed_{id}_{date}` 按天去重
6. **缓存复用**：ads 走 site store 的 ensure 缓存（5 分钟 TTL），sidebar + popup + toast 共享同一份数据
7. **batch 在 :id 前**：`@Delete('batch')` 必须在 `@Delete(':id')` 之前（避免 ParseIntPipe 把 batch 当 id）
8. **DTO 时间转换**：controller normalizeDto 把 DTO 的 string 时间转 entity 的 Date（解决类型摩擦）

---

## 六、验证结果

- ✅ 后端 `tsc --noEmit` 全量通过（零错误）
- ✅ Admin `vue-tsc --noEmit` ad 相关文件零错误
- ✅ v2 前端 `vue-tsc --noEmit` ad 相关文件零错误

---

## 七、手动测试步骤

### 后端（你起进程后，表 synchronize 自动建）

1. **Admin 建 sidebar 广告**：
   ```
   POST /ad  (带 admin token)
   { "title":"测试广告","href":"https://example.com","position":"sidebar","status":"active" }
   ```

2. **公开接口验证**：
   ```
   GET /ad/public/list?position=sidebar
   → 应返回刚建的广告，且无 adminNote 字段
   ```

3. **埋点验证**：
   ```
   POST /ad/public/track { "id":1, "type":"click" }
   → 再查 admin 列表，clicks 应 +1
   ```

### Admin GUI
- 登录后台 → 侧栏「广告推广」→ 新建广告（上传图片/填表单/选位置/排期/备注）→ 列表可见 → 切换启停

### v2 前端
- **侧边栏**：首页右侧 Sidebar 显示 sidebar 广告卡片
- **弹窗**：首页加载后 popup 广告 Modal 弹出（8s 自动关，当天再进不弹）
- **浮窗**：首页右下角 popup_toast 广告滑入
- 点击广告 → 新标签打开 href + clicks 计数 +1
