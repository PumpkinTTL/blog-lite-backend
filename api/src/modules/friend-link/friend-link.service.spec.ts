import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FriendLinkService } from './friend-link.service';
import { FriendLinkEntity } from './friend-link.entity';

describe('FriendLinkService', () => {
  let service: FriendLinkService;
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
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module = await Test.createTestingModule({
      providers: [
        FriendLinkService,
        { provide: getRepositoryToken(FriendLinkEntity), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(FriendLinkService);
    repo = module.get(getRepositoryToken(FriendLinkEntity));
  });

  // ============ findAll ============
  describe('findAll', () => {
    it('should return all friend links when no filters provided', async () => {
      const expected = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll();

      expect(result).toEqual(expected);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQb.leftJoinAndSelect).toHaveBeenCalledWith('e.post', 'post');
      expect(mockQb.orderBy).toHaveBeenCalledWith('e.sortOrder', 'ASC');
      expect(mockQb.addOrderBy).toHaveBeenCalledWith('e.createdAt', 'DESC');
      expect(mockQb.getMany).toHaveBeenCalled();
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should filter by id', async () => {
      const expected = [{ id: 1, name: 'My Blog' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
    });

    it('should filter by keyword (LIKE on name)', async () => {
      const expected = [{ id: 1, name: 'Awesome Site' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ keyword: 'Awesome' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw)',
        { kw: '%Awesome%' },
      );
    });

    it('should filter by status', async () => {
      const expected = [{ id: 1, name: 'A', status: 1 }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ status: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'e.status = :e_status',
        { e_status: 1 },
      );
    });

    it('should combine id + keyword + status filters', async () => {
      const expected = [{ id: 1, name: 'Test', status: 1 }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1, keyword: 'Test', status: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.status = :e_status', { e_status: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw)',
        { kw: '%Test%' },
      );
    });
  });

  // ============ findById ============
  describe('findById', () => {
    it('should return a friend link when it exists', async () => {
      const expected = { id: 1, name: 'My Blog', post: null };
      mockRepo.findOne.mockResolvedValue(expected);

      const result = await service.findById(1);

      expect(result).toEqual(expected);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['post'],
      });
    });

    it('should return null when friend link does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 999 },
        relations: ['post'],
      });
    });
  });

  // ============ create ============
  describe('create', () => {
    it('should create and return a new friend link', async () => {
      const data = { name: 'New Link', url: 'https://example.com' };
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
    it('should update and return the updated friend link', async () => {
      const updatedData = { name: 'Updated Link' };
      const updatedEntity = { id: 1, name: 'Updated Link', post: null };
      mockRepo.update.mockResolvedValue(undefined);
      mockRepo.findOne.mockResolvedValue(updatedEntity);

      const result = await service.update(1, updatedData);

      expect(mockRepo.update).toHaveBeenCalledWith(1, updatedData);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['post'],
      });
      expect(result).toEqual(updatedEntity);
    });
  });

  // ============ remove ============
  describe('remove', () => {
    it('should delete a friend link by id', async () => {
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
