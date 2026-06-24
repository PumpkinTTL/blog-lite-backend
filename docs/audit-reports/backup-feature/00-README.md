# 数据库自动备份系统实施报告

**日期**：2026-06-24
**目标**：防云服务商跑路，定时备份 MySQL 到 Cloudflare R2，后台可视化 + 可手动触发

---

## 一、功能概述

完整的数据库备份系统，三层闭环：

- **自动备份**：多个定时器，预设选项（每N分钟/每天/每周）+ 时间点，可启停/增删
- **手动备份**：一键立即触发
- **R2 存储**：dump → gzip → 上传 R2 → HEAD 校验大小
- **可视化**：admin 后台「数据备份」页，备份历史 + 定时器配置 + 下载 + 校验
- **过期清理**：每个定时器独立保留天数，超期自动从 R2 删除
- **安全下载**：后端生成 R2 presigned URL（5分钟有效）→ 302 跳转，鉴权 + 省带宽

---

## 二、文件清单

### 后端 backend/api（6 文件）
| 文件 | 作用 |
|---|---|
| `modules/backup/backup-log.entity.ts` | BackupLogEntity（11 字段 + 3 索引） |
| `modules/backup/backup.service.ts` | 备份执行：dump→gzip→R2→HEAD校验→清理 |
| `modules/backup/backup-schedule.service.ts` | 多定时器调度：动态 cron 增删改 + 启停 |
| `modules/backup/backup.dto.ts` | 定时器 CRUD 的 DTO |
| `modules/backup/backup.controller.ts` | 全套 API（历史/手动/校验/下载/定时器CRUD） |
| `modules/backup/backup.module.ts` | 模块注册 |
| `modules/media/storage.provider.ts` | **改动**：加 presignGet（下载用） |
| `app.module.ts` | 注册 ScheduleModule.forRoot + BackupModule |

### Admin backend/admin（3 文件）
| 文件 | 作用 |
|---|---|
| `api/backup.ts` | API 封装 + 类型定义 |
| `views/backup/IndexView.vue` | 双 Tab GUI（备份历史 + 定时器配置） |
| `router/index.ts` + `layout/AdminLayout.vue` | 路由 + 菜单 + 面包屑 |

---

## 三、数据库表设计

### backup_logs（每次备份的历史记录）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | 记录 ID |
| trigger | varchar(20) | schedule=定时器 / manual=手动 |
| schedule_name | varchar(100) NULL | 触发的定时器名称 |
| r2_key | varchar(255) NULL | R2 对象 key（如 backup/2026-06-24_030000.sql.gz） |
| size | bigint NULL | 压缩后大小（字节） |
| status | varchar(20) | running/success/failed |
| error_message | varchar(500) NULL | 失败原因 |
| duration_ms | int NULL | 耗时（毫秒） |
| r2_verified | boolean | HEAD 校验是否通过 |
| created_at | datetime | 创建时间 |

**定时器配置不建独立表**：复用 settings 表（group=backup），每个定时器一条 record，value 存 JSON。

---

## 四、API 接口

### 备份历史 & 操作
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/backup/logs` | 历史列表（分页） |
| POST | `/backup/run` | 手动触发备份 |
| POST | `/backup/logs/:id/verify` | 重新校验 R2 是否存在 |
| GET | `/backup/logs/:id/download` | 下载（302→R2 presigned URL） |
| DELETE | `/backup/logs/:id` | 删除记录 + R2 文件 |

### 定时器管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/backup/schedules` | 列出所有定时器 |
| POST | `/backup/schedules` | 新建定时器 |
| PUT | `/backup/schedules/:id` | 更新（含启停） |
| DELETE | `/backup/schedules/:id` | 删除定时器 |
| POST | `/backup/schedules/:id/run` | 按该定时器配置立即执行 |

---

## 五、关键设计

1. **密码安全**：mysqldump 的 DB 密码通过 `MYSQL_PWD` 环境变量传子进程，不出现在命令行参数（防 ps 泄露）
2. **dump 参数**：`--single-transaction`（InnoDB 一致性快照不锁表）+ `--quick`（流式不占内存）+ `--routines --triggers`
3. **gzip 压缩**：实测 6MB 库 → 0.86MB，传输快、存储省
4. **HEAD 校验**：上传后立即 HEAD 校验大小匹配，记 r2_verified 字段
5. **过期清理**：每次定时备份成功后，按该定时器的 retainDays 清理 R2 过期文件
6. **动态 cron**：SchedulerRegistry 动态增删 CronJob，改配置不停机
7. **下载安全**：后端鉴权后生成 5 分钟有效 presigned URL，302 跳转，不暴露 R2 密钥
8. **失败容错**：备份失败记 errorMessage，不中断后续；定时器逻辑失败不崩溃

---

## 六、验证结果

- ✅ 后端 `tsc --noEmit` 零错误
- ✅ Admin `vue-tsc --noEmit` backup 相关零错误
- ✅ 装了 `@nestjs/schedule` + `cron` 依赖

---

## 七、测试步骤

### ⚠️ 前置：mysqldump 必须可用

备份依赖 `mysqldump` 命令。**如果不在 PATH，需配置 `MYSQL_DUMP_BIN` 环境变量**指向正确路径：

```bash
# Linux/Docker（Dockerfile 需装 mysql-client）
# apt-get install default-mysql-client

# Windows（找到 mysql 安装目录）
# .env 加：MYSQL_DUMP_BIN=D:/path/to/mysqldump.exe
```

### 测试流程

1. **重启后端**（schedule 模块 + backup 表自动建）
2. **admin → 数据备份 → 立即备份** → 看「备份历史」出现一条 running→success
3. 检查记录的 size（应有数值）、r2_verified（应为 true）
4. **下载** → 浏览器下载 .sql.gz 文件
5. **新建定时器**（如：每天 03:00，保留 30 天）→ 看出现在列表，状态"启用"
6. **暂停/启用** 定时器 → 状态切换
7. **立即执行** 定时器 → 历史出现新记录
8. **校验** 按钮 → 重新 HEAD 检查 R2

---

## 八、mysqldump 路径自动发现（三级 fallback）

备份依赖 `mysqldump` 命令。不同环境它的位置不同，代码三级自动发现：

| 优先级 | 方式 | 适用场景 |
|---|---|---|
| 1 | `MYSQL_DUMP_BIN` 环境变量 | 显式指定（任何环境） |
| 2 | 查 MySQL `@@basedir` → 拼 `bin/mysqldump(.exe)` + **fs.access 验证存在** | Windows phpstudy/wamp/xampp（数据库本地装） |
| 3 | 默认 `mysqldump`（走 PATH） | Linux/Docker 容器内装了 mysql-client |

**关键：fs.access 验证**。生产环境 DB_HOST 是独立 MariaDB 容器，查到的 `@@basedir` 是 MariaDB 容器内的路径，在 NestJS 容器里不存在（跨容器文件系统隔离）。验证失败自动跳到第 3 级走 PATH。

### 各环境配置

**开发环境（Windows phpstudy）**：无需配置，第 2 级自动发现 `D:\phpstudy_pro\...\bin\mysqldump.exe`。

**生产环境（Docker）**：Dockerfile 装 mysql-client（第 3 级 PATH 生效）：
```dockerfile
RUN apt-get update && apt-get install -y default-mysql-client && rm -rf /var/lib/apt/lists/*
```
.env 配置（连公共 MariaDB 容器）：
```env
DB_HOST=mariadb          # docker network 里的容器名
DB_PORT=3306
R2_*                     # R2 配置（已有）
```

---

## 九、与 1Panel 的关系（重要）

生产环境会用 1Panel 管理面板，它自带数据库定时备份。两者的分工：

| | 1Panel 备份 | 我们的备份系统 |
|---|---|---|
| dump 数据库 | ✅ | ✅ |
| **推 R2（防跑路）** | ❌ 只存服务器本地 | ✅ **核心价值** |
| admin 可视化 | ❌（在 1Panel 里） | ✅（在项目后台） |
| 校验/下载 | ❌ | ✅ |
| 作用 | 服务器在、库误删 → 第二层保险 | **服务器商跑路 → R2 兜底恢复** |

**结论：两者互补，不能互相替代。**
- 1Panel 备份存服务器本地，服务商跑路 = 全没，**解决不了你最担心的"跑路"**
- 我们的系统推 R2（Cloudflare，互联网半壁江山不会跑），**这才是防跑路的核心**
- 1Panel 当"服务器还在但操作失误"的快层恢复；我们的当"异地灾备"

---

## 十、待办 / 已知限制

- **Dockerfile 待建**：项目暂无 Dockerfile，Docker 化时记得装 mysql-client（见第八节）
- **没有通知**：备份失败目前只记日志，未接邮件/webhook（可后续加）
- **整库备份**：当前 mysqldump 全库，未做按表/分库选择性备份（博客体量不需要）
- **跨容器 basedir**：已用 fs.access 处理，不会误用 MariaDB 容器路径
