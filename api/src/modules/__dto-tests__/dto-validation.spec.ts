import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

// ==================== Category DTOs ====================
import { CreateCategoryDto, UpdateCategoryDto } from '../category/category.dto';

describe('CreateCategoryDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateCategoryDto, {
      name: '测试分类',
      slug: 'test-category',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateCategoryDto, {
      name: '测试分类',
      slug: 'test-category',
      description: '描述',
      sortOrder: 1,
      parentId: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象（缺少必填字段）', async () => {
    const dto = plainToInstance(CreateCategoryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('name');
    expect(props).toContain('slug');
  });

  it('应该拒绝非法类型（name、slug 非字符串）', async () => {
    const dto = plainToInstance(CreateCategoryDto, { name: 123, slug: true });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('name');
    expect(props).toContain('slug');
  });

  it('应该拒绝 sortOrder 为非数字', async () => {
    const dto = plainToInstance(CreateCategoryDto, {
      name: 'test',
      slug: 'test',
      sortOrder: 'abc',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('sortOrder');
  });

  it('应该拒绝 parentId 为非整数', async () => {
    const dto = plainToInstance(CreateCategoryDto, {
      name: 'test',
      slug: 'test',
      parentId: 'not-a-number',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('parentId');
  });
});

describe('UpdateCategoryDto', () => {
  it('应该通过空对象（全部可选）', async () => {
    const dto = plainToInstance(UpdateCategoryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据', async () => {
    const dto = plainToInstance(UpdateCategoryDto, {
      name: '新分类',
      description: '新描述',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝非法类型', async () => {
    const dto = plainToInstance(UpdateCategoryDto, { sortOrder: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('sortOrder');
  });
});

// ==================== Tag DTOs ====================
import { CreateTagDto, UpdateTagDto } from '../tag/tag.dto';

describe('CreateTagDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateTagDto, { name: 'tag', slug: 'tag-slug' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateTagDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('name');
    expect(props).toContain('slug');
  });

  it('应该拒绝非法类型', async () => {
    const dto = plainToInstance(CreateTagDto, { name: 123, slug: false });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateTagDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateTagDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过部分字段', async () => {
    const dto = plainToInstance(UpdateTagDto, { name: 'new-tag' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

// ==================== Media DTOs ====================
import { CreateMediaDto } from '../media/media.dto';

describe('CreateMediaDto', () => {
  const validData = {
    filename: 'photo.jpg',
    originalName: '我的照片.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    url: 'https://example.com/photo.jpg',
  };

  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateMediaDto, validData);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateMediaDto, { ...validData, uploaderId: 1 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateMediaDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('filename');
    expect(props).toContain('originalName');
    expect(props).toContain('mimeType');
    expect(props).toContain('size');
    expect(props).toContain('url');
  });

  it('应该拒绝 size 为非正数', async () => {
    const dto = plainToInstance(CreateMediaDto, { ...validData, size: -100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('size');
  });

  it('应该拒绝 size 为非数字', async () => {
    const dto = plainToInstance(CreateMediaDto, { ...validData, size: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('size');
  });

  it('应该拒绝 url 为非法 URL', async () => {
    const dto = plainToInstance(CreateMediaDto, { ...validData, url: 'not-a-url' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('url');
  });

  it('应该拒绝 uploaderId 为非整数', async () => {
    const dto = plainToInstance(CreateMediaDto, { ...validData, uploaderId: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('uploaderId');
  });
});

// ==================== Post DTOs ====================
import { CreatePostDto, UpdatePostDto } from '../post/post.dto';

describe('CreatePostDto', () => {
  const validData = { title: '文章标题', slug: 'article-slug' };

  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreatePostDto, validData);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreatePostDto, {
      ...validData,
      content: '# 内容',
      summary: '摘要',
      coverImage: 'https://example.com/cover.jpg',
      status: 1,
      categoryId: 1,
      tagIds: [1, 2, 3],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreatePostDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('title');
    expect(props).toContain('slug');
  });

  it('应该拒绝非法的 status 值', async () => {
    const dto = plainToInstance(CreatePostDto, { ...validData, status: 3 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('应该接受 status 为 0/1/2', async () => {
    for (const s of [0, 1, 2]) {
      const dto = plainToInstance(CreatePostDto, { ...validData, status: s });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('应该拒绝 tagIds 中包含非整数元素', async () => {
    const dto = plainToInstance(CreatePostDto, { ...validData, tagIds: [1, 'a', 3] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('tagIds');
  });

  it('应该拒绝 categoryId 为非整数', async () => {
    const dto = plainToInstance(CreatePostDto, { ...validData, categoryId: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('categoryId');
  });
});

describe('UpdatePostDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdatePostDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝非法的 status', async () => {
    const dto = plainToInstance(UpdatePostDto, { status: 5 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('应该拒绝 tagIds 中包含非整数', async () => {
    const dto = plainToInstance(UpdatePostDto, { tagIds: [true, 2] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('tagIds');
  });
});

// ==================== User DTOs ====================
import { CreateUserDto, UpdateUserDto } from '../user/user.dto';

describe('CreateUserDto', () => {
  const validData = { username: 'user1', password: '123456', nickname: '用户一' };

  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateUserDto, validData);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validData,
      email: 'test@example.com',
      avatar: 'https://example.com/avatar.png',
      status: 1,
      roleIds: [1, 2],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateUserDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('username');
    expect(props).toContain('password');
    expect(props).toContain('nickname');
  });

  it('应该拒绝密码长度小于 6', async () => {
    const dto = plainToInstance(CreateUserDto, { ...validData, password: '12345' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('应该拒绝非法邮箱格式', async () => {
    const dto = plainToInstance(CreateUserDto, { ...validData, email: 'not-an-email' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('应该拒绝 roleIds 中包含非整数', async () => {
    const dto = plainToInstance(CreateUserDto, { ...validData, roleIds: [1, 'x'] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('roleIds');
  });
});

describe('UpdateUserDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateUserDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据', async () => {
    const dto = plainToInstance(UpdateUserDto, { nickname: '新昵称', email: 'test@test.com' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝密码长度小于 6', async () => {
    const dto = plainToInstance(UpdateUserDto, { password: '12345' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('应该拒绝非法邮箱格式', async () => {
    const dto = plainToInstance(UpdateUserDto, { email: 'bad' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('应该拒绝 roleIds 中包含非整数', async () => {
    const dto = plainToInstance(UpdateUserDto, { roleIds: ['a'] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('roleIds');
  });
});

// ==================== Login DTO ====================
import { LoginDto } from '../user/login.dto';

describe('LoginDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(LoginDto, { username: 'admin', password: '123456' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(LoginDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('username');
    expect(props).toContain('password');
  });

  it('应该拒绝空字符串', async () => {
    const dto = plainToInstance(LoginDto, { username: '', password: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('username');
    expect(props).toContain('password');
  });

  it('应该拒绝 username 长度小于 3', async () => {
    const dto = plainToInstance(LoginDto, { username: 'ab', password: '123456' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('username');
  });

  it('应该拒绝 password 长度小于 6', async () => {
    const dto = plainToInstance(LoginDto, { username: 'admin', password: '12345' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('应该通过含 fingerprint 的数据', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'admin',
      password: '123456',
      fingerprint: 'some-device-id',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

// ==================== Role DTOs ====================
import { CreateRoleDto, UpdateRoleDto } from '../user/role.dto';

describe('CreateRoleDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateRoleDto, { name: 'admin', displayName: '管理员' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateRoleDto, {
      name: 'admin',
      displayName: '管理员',
      description: '系统管理员',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateRoleDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('name');
    expect(props).toContain('displayName');
  });

  it('应该拒绝非法类型', async () => {
    const dto = plainToInstance(CreateRoleDto, { name: 123, displayName: true });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateRoleDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateRoleDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过部分字段', async () => {
    const dto = plainToInstance(UpdateRoleDto, { description: '新描述' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

// ==================== Setting DTOs ====================
import {
  CreateSettingDto,
  UpdateSettingDto,
  BatchUpdateSettingDto,
} from '../setting/setting.dto';

describe('CreateSettingDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateSettingDto, { key: 'site_name', value: 'My Blog' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateSettingDto, {
      key: 'site_name',
      value: 'My Blog',
      description: '站点名称',
      group: 'general',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateSettingDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('key');
    expect(props).toContain('value');
  });

  it('应该拒绝非法类型', async () => {
    const dto = plainToInstance(CreateSettingDto, { key: 123, value: true });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateSettingDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateSettingDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过部分字段', async () => {
    const dto = plainToInstance(UpdateSettingDto, { value: 'new-value' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('BatchUpdateSettingDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(BatchUpdateSettingDto, {
      items: { site_name: 'My Blog', site_desc: 'A cool blog' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(BatchUpdateSettingDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('items');
  });

  it('应该拒绝空对象作为 items', async () => {
    const dto = plainToInstance(BatchUpdateSettingDto, { items: {} });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('items');
  });

  it('应该拒绝非对象 items', async () => {
    const dto = plainToInstance(BatchUpdateSettingDto, { items: 'not-an-object' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('items');
  });
});

// ==================== Announcement DTOs ====================
import { CreateAnnouncementDto, UpdateAnnouncementDto } from '../announcement/announcement.dto';

describe('CreateAnnouncementDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: '公告标题',
      content: '公告内容',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: '公告标题',
      content: '公告内容',
      status: 1,
      sortOrder: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('title');
    expect(props).toContain('content');
  });

  it('应该拒绝非法的 status 值', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: 't',
      content: 'c',
      status: 3,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('应该接受 status 为 0 或 1', async () => {
    for (const s of [0, 1]) {
      const dto = plainToInstance(CreateAnnouncementDto, {
        title: 't',
        content: 'c',
        status: s,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('应该拒绝 sortOrder 为非整数', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: 't',
      content: 'c',
      sortOrder: 'abc',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('sortOrder');
  });
});

describe('UpdateAnnouncementDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateAnnouncementDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝非法的 status', async () => {
    const dto = plainToInstance(UpdateAnnouncementDto, { status: 2 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });
});

// ==================== FriendLink DTOs ====================
import { CreateFriendLinkDto, UpdateFriendLinkDto } from '../friend-link/friend-link.dto';

describe('CreateFriendLinkDto', () => {
  it('应该通过合法数据', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: '友链名称',
      url: 'https://example.com',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法数据（含可选字段）', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: '友链名称',
      url: 'https://example.com',
      logo: 'https://example.com/logo.png',
      description: '描述',
      status: 1,
      sortOrder: 0,
      postId: 1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝空对象', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const props = errors.map((e) => e.property);
    expect(props).toContain('name');
    expect(props).toContain('url');
  });

  it('应该拒绝非法 URL', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: 'test',
      url: 'not-a-url',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('url');
  });

  it('应该拒绝非法的 status 值', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: 'test',
      url: 'https://example.com',
      status: 3,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('应该拒绝 sortOrder 为非整数', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: 'test',
      url: 'https://example.com',
      sortOrder: 1.5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('sortOrder');
  });

  it('应该拒绝 postId 为非整数', async () => {
    const dto = plainToInstance(CreateFriendLinkDto, {
      name: 'test',
      url: 'https://example.com',
      postId: 'abc',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('postId');
  });
});

describe('UpdateFriendLinkDto', () => {
  it('应该通过空对象', async () => {
    const dto = plainToInstance(UpdateFriendLinkDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该通过合法部分更新', async () => {
    const dto = plainToInstance(UpdateFriendLinkDto, { name: '新名称', status: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('应该拒绝非法 URL', async () => {
    const dto = plainToInstance(UpdateFriendLinkDto, { url: 'bad-url' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('url');
  });

  it('应该拒绝非法的 status', async () => {
    const dto = plainToInstance(UpdateFriendLinkDto, { status: 3 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('status');
  });
});
