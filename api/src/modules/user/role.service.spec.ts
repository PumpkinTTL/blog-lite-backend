import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoleService } from './role.service';
import { RoleEntity } from './role.entity';

describe('RoleService', () => {
  let service: RoleService;
  let repo: any;

  const mockRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockQb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: getRepositoryToken(RoleEntity), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(RoleService);
    repo = module.get(getRepositoryToken(RoleEntity));
  });

  // ============ findAll ============
  describe('findAll', () => {
    it('should return all roles when no filters provided', async () => {
      const expected = [{ id: 1, name: 'admin' }, { id: 2, name: 'user' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll();

      expect(result).toEqual(expected);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQb.orderBy).toHaveBeenCalledWith('e.createdAt', 'DESC');
      expect(mockQb.getMany).toHaveBeenCalled();
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should filter by id', async () => {
      const expected = [{ id: 1, name: 'admin' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
    });

    it('should filter by keyword (LIKE on name and displayName)', async () => {
      const expected = [{ id: 1, name: 'admin', displayName: 'Administrator' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ keyword: 'admin' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw OR e.displayName LIKE :kw)',
        { kw: '%admin%' },
      );
    });

    it('should combine id + keyword filters', async () => {
      const expected = [{ id: 2, name: 'editor', displayName: 'Editor' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 2, keyword: 'edit' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 2 });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw OR e.displayName LIKE :kw)',
        { kw: '%edit%' },
      );
    });
  });

  // ============ findById ============
  describe('findById', () => {
    it('should return a role when it exists', async () => {
      const expected = { id: 1, name: 'admin' };
      mockRepo.findOne.mockResolvedValue(expected);

      const result = await service.findById(1);

      expect(result).toEqual(expected);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should return null when role does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 999 } });
    });
  });

  // ============ create ============
  describe('create', () => {
    it('should create and return a new role', async () => {
      const data = { name: 'moderator', displayName: 'Moderator' };
      const created = { id: 1, ...data };
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      const result = await service.create(data);

      expect(mockRepo.create).toHaveBeenCalledWith(data);
      expect(mockRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  // ============ update ============
  describe('update', () => {
    it('should update and return the updated role', async () => {
      const updatedData = { displayName: 'Super Admin' };
      const updatedEntity = { id: 1, name: 'admin', displayName: 'Super Admin' };
      mockRepo.update.mockResolvedValue(undefined);
      mockRepo.findOne.mockResolvedValue(updatedEntity);

      const result = await service.update(1, updatedData);

      expect(mockRepo.update).toHaveBeenCalledWith(1, updatedData);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(updatedEntity);
    });
  });

  // ============ remove ============
  describe('remove', () => {
    it('should delete a role by id', async () => {
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
