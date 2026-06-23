# nginx 层下沉设计（黑名单同步 + 限流）

> 本文档定义 nginx/OpenResty 层的配置方案。
> 这是**部署阶段**的工作（运维 + 配置），不在应用代码里。
> 前提：P0 + P1 的应用层改造已完成，下沉接口已就绪。

---

## 设计原则

1. **nginx 层是执行层，不是决策层**：黑名单从哪来？应用层判定后写入 Redis，nginx 只负责"读到就拦"
2. **定时拉，不实时查**：每 5-10 秒拉一次 Redis 写入 shared_dict，请求只查内存（纳秒级），不为每请求查 Redis
3. **粗粒度限流在 nginx，细粒度在应用层**：nginx 做全局 IP QPS（挡洪水），应用层做 userId + 接口级（挡滥用）
4. **独立工作**：即使应用层下沉接口挂了，nginx 自己的 limit_req 仍能挡洪水

---

## 1. nginx 基础限流（limit_req + limit_conn）

挡中等强度洪水（Tier 2），不依赖应用层。

### 1.1 请求速率限流（limit_req_zone）

```nginx
# http 块
# 按 IP 限流：每 IP 每秒 10 个请求，突发桶 20（延迟排队）
limit_req_zone $binary_remote_addr zone=req_limit:10m rate=10r/s;

# 连接数限流：每 IP 最多 50 个并发连接（防慢连接耗尽）
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:5100;

        # 限流：突发 20 个请求排队，超出直接 503
        limit_req zone=req_limit burst=20 nodelay;
        # 连接数限制
        limit_conn conn_limit 50;

        # 限流触发时返回 429（而非默认 503）
        limit_req_status 429;
        limit_conn_status 429;

        # 标准反代头（关键：trust proxy 依赖这些）
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # 必须！不能是 $http_x_forwarded_for
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**关键点**：
- `X-Forwarded-For` 必须用 `$proxy_add_x_forwarded_for`（追加客户端 IP），**不能用 `$http_x_forwarded_for`**（原样透传客户端伪造的值）
- `rate=10r/s` 是全站默认，敏感接口（登录/兑换）靠应用层限流再精细控制
- `burst=20 nodelay`：允许瞬间 20 个请求不排队，超过立即拒（而非排队等待）

### 1.2 部署前必须确认的 nginx 配置

```nginx
# 必须是追加，不是覆盖（否则客户端伪造的 XFF 会直达后端）
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

**这是 trust proxy 闭环成立的关键**。如果配错（用 `$http_x_forwarded_for`），应用层 trust proxy 取到的就是攻击者伪造的值，整个 IP 限流失效。

**部署 P0 前必须 grep 确认 nginx 配置的这一行。**

---

## 2. 黑名单下沉（OpenResty + lua + shared_dict）

应用层判定的恶意 IP，下沉到 nginx 在网络层秒拒（不进应用）。

### 2.1 架构

```
应用层判定恶意 → Redis SADD nginx:blacklist:ip <ip>
                          ↓
nginx lua（每 5s 定时器）→ 拉取黑名单 → 写入 shared_dict
                          ↓
每请求 access_by_lua → 查 shared_dict → 命中返回 444
                          ↓
Redis detail key TTL 到期 → IP 从 set 移除 → nginx 下次拉取不再有它 → 自动解封
```

### 2.2 lua 配置（OpenResty）

```nginx
# http 块
# 共享内存区（worker 间共享），存黑名单 IP，10MB 足够几十万 IP
lua_shared_dict nginx_blacklist 10m;

# 初始化定时器：每 5 秒从 Redis 拉取黑名单
init_worker_by_lua_block {
    local dict = ngx.shared.nginx_blacklist
    local http = require "resty.http"
    local cjson = require "cjson"

    local function sync_blacklist()
        -- 调用应用层内部接口
        local httpc = http.new()
        local res, err = httpc:request_uri("http://127.0.0.1:5100/api/internal/nginx-blacklist", {
            method = "GET",
            headers = { ["Authorization"] = "Bearer " .. os.getenv("NGINX_SINK_TOKEN") },
        })

        if not res or res.status ~= 200 then
            ngx.log(ngx.ERR, "拉取黑名单失败: ", err or res and res.status)
            return
        end

        local list = cjson.decode(res.body)
        -- 写入 shared_dict（全量覆盖：先清旧的非永久项，再写新的）
        -- 简化：直接写入，TTL 由 detail key 控制（应用层已处理过期清理）
        for _, item in ipairs(list) do
            dict:set("ip:" .. item.ip, 1, item.ttl)  -- 带 TTL，自动过期
        end
    end

    -- 每 5 秒执行一次
    local ok, err = ngx.timer.every(5, function(premature)
        if premature then return end
        sync_blacklist()
    end)
    if not ok then
        ngx.log(ngx.ERR, "启动黑名单同步定时器失败: ", err)
    end
}

server {
    location /api/ {
        # 每请求先查黑名单
        access_by_lua_block {
            local dict = ngx.shared.nginx_blacklist
            -- 取真实 IP（nginx 自己取的，不受客户端伪造影响）
            local ip = ngx.var.binary_remote_addr or ngx.var.remote_addr
            if ip and dict:get("ip:" .. ngx.var.remote_addr) then
                ngx.exit(444)  -- 444 = 无响应直接关闭连接，最省资源
            end
        }

        proxy_pass http://127.0.0.1:5100;
        # ... 其他反代配置
    }
}
```

### 2.3 为什么用 444

- `444`（Nginx 自定义）：直接关闭连接，不返回任何响应头/体
- 对比 `403`：403 还要构造响应，消耗一点资源
- 对比 `503`：语义不对
- **444 是 nginx 层拒绝的最高效方式**，恶意请求连一个字节的响应都拿不到

### 2.4 同步延迟的影响

5 秒拉一次意味着：新封的 IP 最多 5 秒后才在 nginx 生效。这 5 秒内该 IP 的请求仍会进应用层（但应用层黑名单 Guard 会拦）。

**可接受**：
- 应用层 BlacklistGuard 是第一道（即时生效）
- nginx shared_dict 是第二道（5 秒后生效，挡持续请求）
- 5 秒延迟换来"每请求只查内存不查 Redis"，性能收益远大于延迟代价

---

## 3. Cloudflare 层（独立运维，非必须）

### 3.1 免费版基础防护（always on，推荐立即挂）

- **L7 DDoS 缓解**：免费，自动挡大流量
- **Managed Challenge**：可疑流量要求 JS Challenge
- **Bot Fight Mode**：基础机器人识别

**操作**：DNS 解析切到 Cloudflare，开启代理（橙云）。零代码改动。

### 3.2 Under Attack 模式（急救，被攻击时临时开）

- 被大流量攻击时，CF 控制台一键开启
- 所有访客需通过 JS Challenge + 拿 cf_clearance cookie
- **不能常开**（影响真实用户体验）
- 挡得住：脚本刷、无头浏览器（大部分）、洪水
- 挡不住：有效 token + 高级指纹浏览器慢刷（这种靠应用层 P1 熔断）

---

## 4. 三层协同时序

```
请求到达
    │
    ▼
[Cloudflare] L7 DDoS 缓解 + Challenge（挡洪水和脚本）
    │  漏过的（正常流量或高级攻击）
    ▼
[nginx] access_by_lua 查 shared_dict 黑名单
    ├─ 命中 → 444（不进应用）✅ 已封 IP 零成本拒绝
    └─ 未命中 → limit_req 检查
         ├─ 超全局限流 → 429（挡中等洪水）
         └─ 通过 → 转发应用层
              │
              ▼
[应用层] Guard 链：鉴权 → 限流(userId) → 黑名单 → 角色
    ├─ userId 超限 → 429 + 记录超限次数
    ├─ IP/userId 在黑名单 → 403
    └─ 通过 → 业务逻辑
         └─ 兑换失败 → 失败计数 INCR → 达阈值 → 拉黑 + 下沉 Redis
              │
              ▼
         nginx 5s 内拉取 → 写入 shared_dict → 该 IP 下次 nginx 层 444 ✅
```

---

## 5. 部署清单（运维侧）

| 序号 | 项目 | 类型 | 依赖 |
|---|---|---|---|
| 1 | 确认 nginx `X-Forwarded-For` 用 `$proxy_add_x_forwarded_for` | 检查 | 无（P0 前必须确认）|
| 2 | nginx 加 `limit_req_zone` + `limit_conn` | 配置 | 无 |
| 3 | 安装 OpenResty（或 nginx + lua-nginx-module + lua-resty-http）| 运维 | 无 |
| 4 | 部署 lua 黑名单同步脚本 | 配置 | 应用层 P1 下沉接口就绪 |
| 5 | 配置 `NGINX_SINK_TOKEN` 环境变量（应用 + nginx 共享）| 配置 | 应用层 P1 |
| 6 | DNS 切到 Cloudflare + 开启代理 | 运维 | 无（可独立做）|

**注意**：第 1 项是 P0 代码改动能生效的前提，部署前必须确认。

---

## 6. 监控与可观测（建议，非必须）

部署后建议加简单监控，发现问题：

- nginx 侧：`limit_req` 触发次数、444 次数（日志聚合）
- 应用层侧：429 次数、自动拉黑次数、黑名单 set 大小（已有 pino 日志）
- Redis 侧：黑名单 set 成员数、detail key 数量

**博客项目可不建完整监控体系**，但至少保留日志，出问题时能查。
