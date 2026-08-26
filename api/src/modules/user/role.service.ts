import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { RoleEntity } from './role.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    // user_roles 是 TypeORM 自动建的联结表（无 entity），占用计数走裸 SQL
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.roleRepo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name', 'e.displayName'] },
    });
    qb.loadRelationCountAndMap('e.userCount', 'e.users');
    qb.orderBy('e.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: number) {
    return this.roleRepo.findOne({ where: { id } });
  }

  async create(data: Partial<RoleEntity>) {
    const role = this.roleRepo.create(data);
    return this.roleRepo.save(role);
  }

  async update(id: number, data: Partial<RoleEntity>) {
    // 排除关联字段，只更新纯字段
    const { users: _omitUsers, ...updateData } = data as Partial<RoleEntity> & { users?: unknown };
    const existing = await this.roleRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('角色不存在');
    await this.roleRepo.update(id, updateData as any);
    return this.findById(id);
  }

  async remove(id: number) {
    const role = await this.roleRepo.findOne({ where: { id } });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    // 守卫前置：默认角色判定不依赖任何数据加载，最先拦
    if (role.name === 'admin' || role.name === 'user') {
      throw new BadRequestException('默认角色不可删除');
    }

    // COUNT 判定用户占用（不具象化用户行：曾是 relations:['users'] 全量加载，
    // 大角色一次拉几万行完整 users 含密码哈希进内存，只为判断 length>0）
    const [cntRow] = await this.dataSource.query(
      'SELECT COUNT(*) AS cnt FROM user_roles WHERE role_id = ?',
      [id],
    );
    const userCount = Number(cntRow?.cnt ?? 0);
    if (userCount > 0) {
      throw new BadRequestException(`该角色下有 ${userCount} 个用户，无法删除`);
    }

    await this.roleRepo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    const roles = await this.roleRepo.find({ where: { id: In(ids) } });

    for (const role of roles) {
      if (role.name === 'admin' || role.name === 'user') {
        throw new BadRequestException(
          `默认角色「${role.displayName}」不可删除`,
        );
      }
    }

    // 批量 COUNT 一次拿全部占用（GROUP BY），不再逐角色具象化 users
    const rows = await this.dataSource.query(
      'SELECT role_id AS roleId, COUNT(*) AS cnt FROM user_roles WHERE role_id IN (?) GROUP BY role_id',
      [ids],
    );
    const cntMap = new Map(
      (rows as Array<{ roleId: number; cnt: string }>).map((r) => [Number(r.roleId), Number(r.cnt)]),
    );

    for (const role of roles) {
      const cnt = cntMap.get(role.id) ?? 0;
      if (cnt > 0) {
        throw new BadRequestException(
          `角色「${role.displayName}」下有 ${cnt} 个用户，无法删除`,
        );
      }
    }

    await this.roleRepo.delete(ids);
  }
}
