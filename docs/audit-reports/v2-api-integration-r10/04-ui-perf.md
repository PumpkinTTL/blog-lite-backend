# R10 UI 优化 + 性能微优化

## 一、UI 优化：文章列表页分类列改 NTag

### 问题

文章列表页（管理后台 `post/IndexView.vue`）的「分类」列是纯文本显示，而同表的「标签」列是 NTag 蓝色标签样式，视觉不统一。

### 修复

```ts
// 原代码
{ title: '分类', key: 'category', width: 100, render: (row) => row.category?.name || '-' }

// 修复后
{
  title: '分类',
  key: 'category',
  width: 110,
  render: (row) =>
    row.category?.name
      ? h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => row.category.name })
      : h('span', { style: 'color:#bbb' }, '-'),
}
```

分类列现在显示为蓝色 NTag 标签，与标签列视觉一致。无分类时显示灰色 `-`。

### 涉及文件

`backend/admin/src/views/post/IndexView.vue:71-77`

---

## 二、性能微优化：UserCenter 收藏缩略图懒加载

### 问题

UserCenter（个人中心）的收藏列表缩略图 `<img>` 未加 `loading="lazy"`，用户打开收藏标签页时所有缩略图立即加载，即使用户没滚动到。

### 修复

```html
<!-- 原代码 -->
<img :src="item.cover" :alt="item.title" class="h-12 w-16 ..." />

<!-- 修复后 -->
<img :src="item.cover" :alt="item.title" loading="lazy" class="h-12 w-16 ..." />
```

加了 `loading="lazy"`，浏览器原生懒加载——只在缩略图接近视口时才加载，减少首屏图片请求数。

### 涉及文件

`src/components/v2/user/UserCenter.vue:1266`

---

## 三、性能现状评估（无需立项的项）

经全面排查，前后端架构层面已做好分页/缓存/批量查询/懒加载，目前无高优先级性能债：

| 检查项 | 现状 |
|--------|------|
| 后端 N+1 查询 | ✅ 已规避（post/interaction/user 都用批量 IN 查询） |
| 后端索引 | ✅ 齐全（status/createdAt/email 都有索引） |
| dashboard 缓存 | ✅ 60s Redis 缓存 + Promise.all 并行 |
| 列表分页 | ✅ 全部分页（skip/take） |
| 前端图片懒加载 | ✅ 全面使用 loading="lazy"（本轮补了 UserCenter 一处遗漏） |
| 大列表虚拟滚动 | ✅ 首页真分页（每页 12 条），评论 100 条前端切片，无需虚拟滚动 |
| 重复请求防护 | ✅ 竞态守卫 + TTL 缓存 + 请求去重 |

### 唯一的轻微 N+1（低优先级，未修）

`post.service.ts:398-407` 硬删文章时 `deleteMediaByUrls` 循环内逐条查删——仅删除时触发、非高频，量大时可改批量 `In(urls)`。优先级低，本轮未动。
