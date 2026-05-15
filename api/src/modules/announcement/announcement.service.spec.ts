import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnnouncementService } from './announcement.service';
import { AnnouncementEntity } from './announcement.entity';

describe('AnnouncementService', () => {
  let service: AnnouncementService;
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
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module = await Test.createTestingModule({
      providers: [
        AnnouncementService,
        { provide: getRepositoryToken(AnnouncementEntity), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(AnnouncementService);
    repo = module.get(getRepositoryToken(AnnouncementEntity));
  });

  // ============ findAll ============
  describe('findAll', () => {
    it('should return all announcements when no filters provided', async () => {
      const expected = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll();

      expect(result).toEqual(expected);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQb.orderBy).toHaveBeenCalledWith('e.sortOrder', 'ASC');
      expect(mockQb.addOrderBy).toHaveBeenCalledWith('e.createdAt', 'DESC');
      expect(mockQb.getMany).toHaveBeenCalled();
      // No filters → no andWhere calls from applyFilters
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should filter by id', async () => {
      const expected = [{ id: 1, title: 'A' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
    });

    it('should filter by keyword (LIKE on title)', async () => {
      const expected = [{ id: 1, title: 'test title' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ keyword: 'test' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.title LIKE :kw)',
        { kw: '%test%' },
      );
    });

    it('should filter by status', async () => {
      const expected = [{ id: 1, title: 'A', status: 1 }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ status: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'e.status = :e_status',
        { e_status: 1 },
      );
    });

    it('should combine id + keyword + status filters', async () => {
      const expected = [{ id: 1, title: 'hello', status: 1 }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1, keyword: 'hello', status: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.status = :e_status', { e_status: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.title LIKE :kw)',
        { kw: '%hello%' },
      );
    });
  });

  // ============ findById ============
  describe('findById', () => {
    it('should return an announcement when it exists', async () => {
      const expected = { id: 1, title: 'A' };
      mockRepo.findOne.mockResolvedValue(expected);

      const result = await service.findById(1);

      expect(result).toEqual(expected);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should return null when announcement does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 999 } });
    });
  });

  // ============ create ============
  describe('create', () => {
    it('should create and return a new announcement', async () => {
      const data = { title: 'New', content: 'Content' };
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
    it('should update and return the updated announcement', async () => {
      const updatedData = { title: 'Updated' };
      const updatedEntity = { id: 1, title: 'Updated', content: 'C' };
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
    it('should delete an announcement by id', async () => {
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
