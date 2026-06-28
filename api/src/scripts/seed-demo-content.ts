/**
 * 演示内容数据种子脚本（纯 SQL，不依赖 TypeORM 实体元数据）。
 *
 * 用途：在干净的库（仅有 admin 用户）里补充分类、标签、文章、媒体、友链、评论等
 * 虚拟数据，便于前端 UI 联调。
 *
 * 运行：npx ts-node -r tsconfig-paths/register src/scripts/seed-demo-content.ts
 *
 * 设计：
 * - 幂等：用 INSERT IGNORE / 先查后插，重复运行不会报错也不会产生重复数据
 * - 作者/上传者统一用 admin（库内第一个用户）
 * - status 全部用合法字符串值（published/approved/visible 等），不用数字
 * - slug 保证唯一（带后缀，避免冲突）
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'blog-lite',
    multipleStatements: false,
  });

  // 简单封装：返回 rows（INSERT 返回 ResultSetHeader，SELECT 返回数组）
  const Q = async <T = any>(sql: string, params: any[] = []): Promise<T> => {
    const [rows] = await conn.query(sql, params);
    return rows as T;
  };

  // 取 admin id（所有内容的作者/上传者）
  const users: Array<{ id: number }> = await Q(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`,
  );
  if (users.length === 0) {
    throw new Error('库内无用户，请先运行基础 seed.ts 创建 admin');
  }
  const adminId = users[0].id;
  console.log(`使用 admin id 作为作者: ${adminId}`);

  // ========== 1. 分类 ==========
  const categories = [
    { name: '技术笔记', slug: 'tech', description: '编程与开发实战笔记', sortOrder: 0 },
    { name: '前端开发', slug: 'frontend', description: 'Vue / React / CSS 等', sortOrder: 1 },
    { name: '后端架构', slug: 'backend', description: 'Node.js / NestJS / 数据库', sortOrder: 2 },
    { name: '设计随笔', slug: 'design', description: 'UI / UX / 视觉设计', sortOrder: 3 },
    { name: '生活杂谈', slug: 'life', description: '日常思考与随笔', sortOrder: 4 },
  ];
  for (const c of categories) {
    await Q(
      `INSERT IGNORE INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [c.name, c.slug, c.description, c.sortOrder],
    );
  }
  const cats: Array<{ id: number; slug: string }> = await Q(
    `SELECT id, slug FROM categories`,
  );
  const catId = (slug: string) => cats.find((c) => c.slug === slug)?.id ?? null;
  console.log(`分类已就绪: ${cats.length} 个`);

  // ========== 2. 标签 ==========
  const tags = [
    { name: 'Vue 3', slug: 'vue3' },
    { name: 'NestJS', slug: 'nestjs' },
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'CSS 动画', slug: 'css-animation' },
    { name: '性能优化', slug: 'performance' },
    { name: 'MySQL', slug: 'mysql' },
    { name: 'TypeORM', slug: 'typeorm' },
    { name: '工具推荐', slug: 'tools' },
    { name: '随笔', slug: 'essay' },
  ];
  for (const t of tags) {
    await Q(
      `INSERT IGNORE INTO tags (name, slug, created_at) VALUES (?, ?, NOW())`,
      [t.name, t.slug],
    );
  }
  const tagRows: Array<{ id: number; slug: string }> = await Q(
    `SELECT id, slug FROM tags`,
  );
  const tagId = (slug: string) => tagRows.find((t) => t.slug === slug)?.id ?? null;
  console.log(`标签已就绪: ${tagRows.length} 个`);

  // ========== 3. 文章 ==========
  const posts = [
    {
      title: 'Vue 3 组合式 API 实战：从 ref 到 composables',
      subtitle: '告别 Options API，拥抱函数式组合',
      slug: 'vue3-composition-api-guide',
      summary: '深入理解 ref/reactive/computed，并封装可复用的 composables，写出更清晰的组件逻辑。',
      catSlug: 'frontend',
      tagSlugs: ['vue3', 'typescript'],
      cover: 'https://picsum.photos/seed/vue3-composition/1200/630',
      content: `# Vue 3 组合式 API 实战\n\nVue 3 的组合式 API（Composition API）是这次大版本最重磅的特性。它让我们能够更灵活地组织组件逻辑，而不是被 Options API 的固定结构束缚。\n\n## ref 与 reactive 的选择\n\n\`ref\` 适合基础类型，\`reactive\` 适合对象。但实际开发中，我更推荐统一用 \`ref\`，因为它在模板中自动解包，心智负担更小。\n\n\`\`\`ts\nconst count = ref(0)\nconst double = computed(() => count.value * 2)\n\`\`\`\n\n## 封装 composables\n\n把可复用的逻辑抽成 \`useXxx\` 函数，这是组合式 API 的精髓所在。\n\n## 总结\n\n组合式 API 不是银弹，但在中大型项目里，它的逻辑复用能力远超 mixins。\n\n> 记住：先写清楚再优化，不要过早抽象。`,
    },
    {
      title: 'NestJS 中间件与守卫的区别，你真的搞懂了吗？',
      subtitle: 'Middleware / Guard / Pipe / Interceptor 执行顺序详解',
      slug: 'nestjs-middleware-vs-guard',
      summary: '一张图理清 NestJS 请求生命周期的四个关键组件，再也不混淆。',
      catSlug: 'backend',
      tagSlugs: ['nestjs', 'typescript'],
      cover: 'https://picsum.photos/seed/nestjs-lifecycle/1200/630',
      content: `# NestJS 中间件与守卫的区别\n\n很多人分不清 NestJS 的 Middleware、Guard、Pipe、Interceptor 到底谁先执行。其实记住这个顺序就够了：\n\n## 执行顺序\n\n\`\`\`\n请求 → Middleware → Guard → Interceptor(before) → Pipe → Controller\n       → Interceptor(after) → 异常过滤器 → 响应\n\`\`\`\n\n## Guard 的核心作用\n\nGuard 决定请求**是否应该被处理**（鉴权），返回 false 直接拦截。\n\n\`\`\`ts\n@Injectable()\nexport class AuthGuard implements CanActivate {\n  canActivate(context: ExecutionContext): boolean {\n    return !!context.switchToHttp().getRequest().user\n  }\n}\n\`\`\`\n\n## Middleware 适合什么\n\n日志、CORS、body 解析等通用处理。Guard 出现后，鉴权一般不再用 Middleware。\n\n## 实战建议\n\n- 鉴权用 Guard\n- 数据转换/校验用 Pipe\n- 响应映射用 Interceptor\n- 通用预处理用 Middleware`,
    },
    {
      title: 'TypeORM 关系映射踩坑实录：cascade 与 onDelete',
      subtitle: '外键级联的那些坑',
      slug: 'typeorm-cascade-pitfalls',
      summary: 'cascade: true 和数据库 onDelete RESTRICT 到底什么关系？一次讲清楚。',
      catSlug: 'backend',
      tagSlugs: ['typeorm', 'mysql'],
      cover: 'https://picsum.photos/seed/typeorm-relations/1200/630',
      content: `# TypeORM 关系映射踩坑实录\n\n用 TypeORM 定义关联时，\`cascade\` 和 \`onDelete\` 经常让人困惑。它们其实是两个层面的东西。\n\n## cascade：ORM 层面\n\n\`cascade: true\` 控制的是**保存实体时**是否级联保存关联实体，跟数据库无关。\n\n## onDelete：数据库层面\n\n\`onDelete: 'RESTRICT' | 'CASCADE' | 'SET NULL'\` 控制的是**删除记录时**数据库的级联行为。\n\n## 常见坑\n\n1. 设置了 \`onDelete: 'RESTRICT'\` 但没注意，删除父记录时报外键约束错误\n2. \`cascade: true\` 滥用导致意外保存大量关联数据\n3. 软删除与外键级联的冲突\n\n## 最佳实践\n\n- 重要的关联用 RESTRICT，强制业务层处理\n- 用不上的关联用 SET NULL，避免删除被阻塞\n- cascade 谨慎开启，只在确有需要时用`,
    },
    {
      title: 'CSS 滚动性能优化：will-change 不是万能药',
      subtitle: '从 backdrop-filter 到 will-change 的性能陷阱',
      slug: 'css-scroll-performance',
      summary: '首页滚动卡顿？可能是 will-change 滥用创建了太多 GPU 图层。',
      catSlug: 'frontend',
      tagSlugs: ['css-animation', 'performance'],
      cover: 'https://picsum.photos/seed/css-perf/1200/630',
      content: `# CSS 滚动性能优化\n\n最近遇到首页滚动卡顿的问题，排查后发现是 \`will-change\` 和 \`backdrop-filter\` 的锅。\n\n## will-change 的陷阱\n\n\`will-change: transform\` 会为元素创建独立的 GPU 图层。如果给 20 多个卡片都加 \`will-change\`，反而会让 GPU 内存爆掉，滚动更卡。\n\n正确做法：**只在动画进行时加 \`will-change\`，动画结束立刻移除**。\n\n\`\`\`js\nel.classList.add('animating')\n// 动画结束\nel.addEventListener('animationend', () => el.classList.remove('animating'))\n\`\`\`\n\n## backdrop-filter 的代价\n\n毛玻璃效果很美，但 \`backdrop-filter\` 在滚动链路上会严重拖慢渲染。能避则避。\n\n## 通用优化手段\n\n- \`transform\` / \`opacity\` 动画走合成层\n- 避免 layout thrashing\n- 滚动容器加 \`contain: layout style paint\``,
    },
    {
      title: 'MySQL 索引优化：从 EXPLAIN 看懂查询计划',
      subtitle: '别让慢查询拖垮你的接口',
      slug: 'mysql-explain-guide',
      summary: '学会读 EXPLAIN 输出，定位全表扫描、索引失效、临时表等性能问题。',
      catSlug: 'backend',
      tagSlugs: ['mysql', 'performance'],
      cover: 'https://picsum.photos/seed/mysql-index/1200/630',
      content: `# MySQL 索引优化\n\n慢查询是后端性能的头号杀手。学会用 \`EXPLAIN\` 分析查询计划，是优化的第一步。\n\n## 关键字段解读\n\n- \`type\`：访问类型。ALL = 全表扫描（危险！），ref/range = 索引查找（好）\n- \`key\`：实际用的索引。NULL 表示没用上索引\n- \`rows\`：预估扫描行数，越少越好\n- \`Extra\`：Using temporary（临时表）、Using filesort（文件排序）都是性能警告\n\n## 索引失效的常见原因\n\n1. 对索引列用函数：\`WHERE DATE(create_time) = '2026-01-01'\`\n2. 隐式类型转换\n3. 最左前缀原则没遵守\n4. OR 条件中有一侧无索引\n\n## 实战建议\n\n- 联合索引按区分度从高到低排序\n- 覆盖索引避免回表\n- 定期用 \`ANALYZE TABLE\` 更新统计信息`,
    },
    {
      title: '我的 2026 年工具清单',
      subtitle: '提升效率的 10 个必备工具',
      slug: 'my-2026-toolkit',
      summary: '从代码编辑到笔记管理，分享我每天在用的效率工具。',
      catSlug: 'tech',
      tagSlugs: ['tools'],
      cover: 'https://picsum.photos/seed/toolkit-2026/1200/630',
      content: `# 我的 2026 年工具清单\n\n工欲善其事，必先利其器。分享我这一年离不开的效率工具。\n\n## 编辑器与终端\n\n- **VS Code**：主力 IDE，配上一堆插件\n- **Warp**：现代化终端，命令记忆功能太香了\n- **Raycast**：Mac 启动器，替代 Spotlight\n\n## 笔记与知识管理\n\n- **Obsidian**：双链笔记，知识图谱可视化\n- **Notion**：团队协作和项目文档\n\n## 设计与原型\n\n- **Figma**：UI 设计首选\n- **Excalidraw**：手绘风格示意图\n\n## 效率与自动化\n\n- **Alfred / Raycast 工作流**\n- **git aliases**：常用 git 命令缩短\n\n> 工具是手段不是目的，找到适合自己的最重要。`,
    },
    {
      title: '为什么我开始写技术博客',
      subtitle: '输出的力量',
      slug: 'why-i-start-blogging',
      summary: '写博客不是给别人看，而是逼自己把知识理清楚。',
      catSlug: 'life',
      tagSlugs: ['essay'],
      cover: 'https://picsum.photos/seed/blogging-essay/1200/630',
      content: `# 为什么我开始写技术博客\n\n坚持写博客这件事，我犹豫了很久。直到有一天我意识到：**能讲清楚，才是真懂了**。\n\n## 费曼学习法\n\n教是最好的学。当你试图把一个技术点讲给小白听，你会发现自己其实有无数个"似懂非懂"的角落。\n\n## 知识的复利\n\n每篇文章都是一颗种子。三年后回看，那些碎片会连成网络。\n\n## 不要怕写得"浅"\n\n新手向的文章反而最受欢迎——因为你自己刚踩过坑，最懂新手会卡在哪。\n\n> 开始写，比写得好更重要。\n\n共勉。`,
    },
    {
      title: 'TypeScript 类型体操入门：从基础到进阶',
      subtitle: '泛型、条件类型、映射类型一网打尽',
      slug: 'typescript-type-gymnastics',
      summary: '看不懂别人写的复杂泛型？这篇带你从零掌握 TypeScript 类型编程。',
      catSlug: 'frontend',
      tagSlugs: ['typescript'],
      cover: 'https://picsum.photos/seed/ts-types/1200/630',
      content: `# TypeScript 类型体操入门\n\nTypeScript 的类型系统本身就是图灵完备的，能玩出很多花样。但初学者容易被各种"类型体操"吓到。其实拆开来看，核心概念就那么几个。\n\n## 泛型：类型的参数\n\n\`\`\`ts\nfunction identity<T>(x: T): T { return x }\n\`\`\`\n\nT 就是一个"类型占位符"，调用时再确定。\n\n## 条件类型\n\n\`\`\`ts\ntype IsString<T> = T extends string ? true : false\n\`\`\`\n\n相当于类型层面的三元表达式。\n\n## 映射类型\n\n\`\`\`ts\ntype Readonly<T> = { readonly [K in keyof T]: T[K] }\n\`\`\`\n\n遍历一个类型的所有 key，生成新类型。\n\n## 实战建议\n\n- 不要为了炫技写复杂的类型，可读性第一\n- 工具类型（Partial/Pick/Omit）够用就别造轮子\n- 类型推导不出来就明确标注`,
    },
  ];

  for (const p of posts) {
    // 幂等：slug 唯一，已存在则跳过
    const exist: Array<{ id: number }> = await Q(
      `SELECT id FROM posts WHERE slug = ?`,
      [p.slug],
    );
    let postId: number;
    if (exist.length > 0) {
      postId = exist[0].id;
      console.log(`  文章已存在，跳过: ${p.title} (#${postId})`);
    } else {
      const result: any = await Q(
        `INSERT INTO posts (title, subtitle, slug, content, summary, cover_image, status, author_id, category_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, NOW(), NOW(), NOW())`,
        [p.title, p.subtitle, p.slug, p.content, p.summary, p.cover, adminId, catId(p.catSlug)],
      );
      postId = result.insertId;
      // 关联标签
      for (const ts of p.tagSlugs) {
        const tid = tagId(ts);
        if (tid) {
          await Q(
            `INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`,
            [postId, tid],
          );
        }
      }
      console.log(`  文章已创建: ${p.title} (#${postId})`);
    }
  }

  // ========== 4. 媒体（3 条占位）==========
  const medias = [
    { filename: 'cover-vue3.jpg', originalName: 'vue3-cover.jpg', mime: 'image/jpeg', size: 245678, url: 'https://picsum.photos/seed/media-vue3/1200/630' },
    { filename: 'cover-nestjs.jpg', originalName: 'nestjs-cover.jpg', mime: 'image/jpeg', size: 198432, url: 'https://picsum.photos/seed/media-nestjs/1200/630' },
    { filename: 'avatar-default.png', originalName: 'default-avatar.png', mime: 'image/png', size: 32145, url: 'https://picsum.photos/seed/media-avatar/200/200' },
  ];
  for (const m of medias) {
    const exist: Array<{ id: number }> = await Q(
      `SELECT id FROM media WHERE filename = ?`,
      [m.filename],
    );
    if (exist.length === 0) {
      await Q(
        `INSERT INTO media (filename, original_name, mime_type, size, hash, url, storage_type, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'local', ?, NOW())`,
        [m.filename, m.originalName, m.mime, m.size, 'demo' + m.filename.padEnd(56, '0').slice(0, 64), m.url, adminId],
      );
    }
  }
  console.log(`媒体已就绪`);

  // ========== 5. 友链 ==========
  const links = [
    { name: '掘金', url: 'https://juejin.cn', logo: 'https://juejin.cn/favicon.ico', description: '稀土掘金，开发者社区', category: 'friend' },
    { name: '阮一峰的博客', url: 'https://www.ruanyifeng.com/blog/', description: '科技爱好者周刊', category: 'blog' },
    { name: 'MDN Web Docs', url: 'https://developer.mozilla.org', description: 'Web 开发权威文档', category: 'learn' },
    { name: 'Can I Use', url: 'https://caniuse.com', description: '浏览器兼容性查询', category: 'tool' },
    { name: 'GitHub', url: 'https://github.com', description: '全球最大代码托管平台', category: 'tool' },
  ];
  for (const l of links) {
    await Q(
      `INSERT IGNORE INTO friend_links (name, url, logo, description, category, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'visible', NOW(), NOW())`,
      [l.name, l.url, l.logo || null, l.description || null, l.category],
    );
  }
  console.log(`友链已就绪: ${links.length} 个`);

  // ========== 6. 评论（给前 2 篇文章各加几条）==========
  const firstPosts: Array<{ id: number }> = await Q(
    `SELECT id FROM posts ORDER BY id ASC LIMIT 2`,
  );
  const comments = [
    { idx: 0, content: '写得太清楚了，组合式 API 终于搞明白了！', status: 'approved' },
    { idx: 0, content: 'composables 的封装思路学到了，感谢分享。', status: 'approved' },
    { idx: 0, content: '想问下 ref 和 reactive 在大型项目里到底怎么选？', status: 'approved' },
    { idx: 1, content: 'Guard 和 Middleware 的区别困扰我很久，这下懂了。', status: 'approved' },
    { idx: 1, content: '执行顺序那张图太实用了，收藏了！', status: 'approved' },
  ];
  for (const cm of comments) {
    const postId = firstPosts[cm.idx]?.id;
    if (!postId) continue;
    const exist: Array<{ id: number }> = await Q(
      `SELECT id FROM comments WHERE entity_type = 'post' AND entity_id = ? AND content = ? LIMIT 1`,
      [postId, cm.content],
    );
    if (exist.length === 0) {
      await Q(
        `INSERT INTO comments (entity_type, entity_id, user_id, content, status, created_at, updated_at) VALUES ('post', ?, ?, ?, ?, NOW(), NOW())`,
        [postId, adminId, cm.content, cm.status],
      );
    }
  }
  console.log(`评论已就绪`);

  // ========== 7. 修补 resources 悬空 uploader_id ==========
  const updResult: any = await Q(
    `UPDATE resources SET uploader_id = ? WHERE uploader_id IS NULL`,
    [adminId],
  );
  console.log(`资源 uploader_id 已补全: ${updResult.affectedRows} 条`);

  // ========== 8. 统计 ==========
  const stats = [
    ['categories', `SELECT COUNT(*) c FROM categories`],
    ['tags', `SELECT COUNT(*) c FROM tags`],
    ['posts', `SELECT COUNT(*) c FROM posts`],
    ['media', `SELECT COUNT(*) c FROM media`],
    ['friend_links', `SELECT COUNT(*) c FROM friend_links`],
    ['comments', `SELECT COUNT(*) c FROM comments`],
    ['resources', `SELECT COUNT(*) c FROM resources`],
  ] as const;
  console.log('\n=== 数据统计 ===');
  for (const [name, sql] of stats) {
    const rows: any = await Q(sql);
    console.log(`  ${name}: ${rows[0].c}`);
  }

  await conn.end();
  console.log('\n演示内容数据写入完成 ✓');
}

main().catch((err) => {
  console.error('写入失败:', err);
  process.exit(1);
});
