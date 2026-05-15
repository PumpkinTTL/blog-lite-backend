import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryEntity } from './category.entity';

describe('CategoryService', () => {
  let service: CategoryService;
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
        CategoryService,
        { provide: getRepositoryToken(CategoryEntity), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(CategoryService);
    repo = module.get(getRepositoryToken(CategoryEntity));
  });

  // ============ findAll ============
  describe('findAll', () => {
    it('should return all categories when no filters provided', async () => {
      const expected = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll();

      expect(result).toEqual(expected);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQb.orderBy).toHaveBeenCalledWith('e.sortOrder', 'ASC');
      expect(mockQb.getMany).toHaveBeenCalled();
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should filter by id', async () => {
      const expected = [{ id: 1, name: 'Tech' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 1 });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 1 });
    });

    it('should filter by keyword (LIKE on name and slug)', async () => {
      const expected = [{ id: 1, name: 'javascript', slug: 'js' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ keyword: 'java' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw OR e.slug LIKE :kw)',
        { kw: '%java%' },
      );
    });

    it('should combine id + keyword filters', async () => {
      const expected = [{ id: 2, name: 'typescript', slug: 'ts' }];
      mockQb.getMany.mockResolvedValue(expected);

      const result = await service.findAll({ id: 2, keyword: 'type' });

      expect(result).toEqual(expected);
      expect(mockQb.andWhere).toHaveBeenCalledWith('e.id = :e_id', { e_id: 2 });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(e.name LIKE :kw OR e.slug LIKE :kw)',
        { kw: '%type%' },
      );
    });
  });

  // ============ findById ============
  describe('findById', () => {
    it('should return a category when it exists', async () => {
      const expected = { id: 1, name: 'Tech' };
      mockRepo.findOne.mockResolvedValue(expected);

      const result = await service.findById(1);

      expect(result).toEqual(expected);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should return null when category does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 999 } });
    });
  });

  // ============ create ============
  describe('create', () => {
    it('should create and return a new category', async () => {
      const data = { name: 'New', slug: 'new-cat', description: 'desc' };
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
    it('should update and return the updated category', async () => {
      const updatedData = { name: 'Updated' };
      const updatedEntity = { id: 1, name: 'Updated', slug: 'updated' };
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
    it('should delete a category by id', async () => {
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
