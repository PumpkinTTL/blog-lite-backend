import { randomInt } from 'node:crypto';

/**
 * 用户 ID 生成器：9 位随机数字（首位非 0）。
 *
 * 设计目的：
 * - 防推算注册顺序/用户总量（不连续，无法通过 id 反推用户规模）
 * - 防爬虫遍历用户列表
 * - 仍为纯数字，不破坏现有 number 类型 / 路由 / JWT / 外键
 *
 * 范围：100000000 ~ 999999999（约 9 亿种组合）。用户体量小（几百~几万），
 * 碰撞概率极低（生日悖论：约 3.7 万用户才有 50% 碰撞）。万一冲突，
 * exists 回调返回 true 时重新生成，最多重试 maxAttempts 次。
 *
 * 注意：调用方需保证原子性（生成→插入在同一事务内）。
 * 并发场景下理论上仍可能撞，但由 users.id 主键约束兜底——插入冲突时
 * service 层捕获并重试。这里 exists 检查主要规避"明显已占用"的高频命中。
 */
const MIN_ID = 100_000_000; // 9 位下界（首位非 0）
const MAX_ID = 999_999_999; // 9 位上界
const RANGE = MAX_ID - MIN_ID + 1;

/**
 * 生成单个 9 位随机 id（不查库）。
 */
export function randomUserId(): number {
  // CSPRNG（红队 V3 顺手加固）：id 是登录账号名的一部分（Casdoor name=u<id>），
  // 可预测的 id 序列降低抢注/枚举成本。碰撞仍由调用方查重兜底。
  return randomInt(MIN_ID, MAX_ID + 1);
}

/**
 * 生成一个数据库中不存在的 9 位随机用户 id。
 * @param exists 查重回调：返回 true 表示 id 已被占用。传 manager 的查询以保持事务一致性。
 * @param maxAttempts 最大重试次数（默认 10，足够覆盖极小概率碰撞）
 * @returns 未被占用的随机 id
 * @throws 超过 maxAttempts 仍碰撞时抛错（理论几乎不可能发生）
 */
export async function generateUniqueUserId(
  exists: (id: number) => Promise<boolean>,
  maxAttempts = 10,
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const id = randomUserId();
    if (!(await exists(id))) {
      return id;
    }
  }
  throw new Error(
    `生成用户 ID 失败：连续 ${maxAttempts} 次生成的随机 id 均已存在，请重试`,
  );
}
