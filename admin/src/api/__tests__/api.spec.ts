import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request 模块
vi.mock('../request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import request from '../request'
import * as tagApi from '../tag'
import * as categoryApi from '../category'
import * as userApi from '../user'
import * as postApi from '../post'
import * as mediaApi from '../media'

describe('Tag API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getTags 应该调用 GET /tag', async () => {
    const mockData = { data: [{ id: 1, name: 'test', slug: 'test' }] }
    ;(request.get as any).mockResolvedValue(mockData)
    const result = await tagApi.getTags()
    expect(request.get).toHaveBeenCalledWith('/tag', { params: undefined })
    expect(result).toEqual(mockData)
  })

  it('getTags 应该传递查询参数', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await tagApi.getTags({ keyword: 'test' })
    expect(request.get).toHaveBeenCalledWith('/tag', { params: { keyword: 'test' } })
  })

  it('createTag 应该调用 POST /tag', async () => {
    ;(request.post as any).mockResolvedValue({ data: { id: 1 } })
    const data = { name: 'new-tag', slug: 'new-tag' }
    await tagApi.createTag(data as any)
    expect(request.post).toHaveBeenCalledWith('/tag', data)
  })

  it('updateTag 应该调用 PUT /tag/:id', async () => {
    ;(request.put as any).mockResolvedValue({ data: { id: 1 } })
    await tagApi.updateTag(1, { name: 'updated' })
    expect(request.put).toHaveBeenCalledWith('/tag/1', { name: 'updated' })
  })

  it('deleteTag 应该调用 DELETE /tag/:id', async () => {
    ;(request.delete as any).mockResolvedValue({})
    await tagApi.deleteTag(1)
    expect(request.delete).toHaveBeenCalledWith('/tag/1')
  })
})

describe('Category API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getCategories 应该调用 GET /category', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await categoryApi.getCategories()
    expect(request.get).toHaveBeenCalledWith('/category', { params: undefined })
  })

  it('getCategories 应该传递查询参数', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await categoryApi.getCategories({ keyword: 'tech' })
    expect(request.get).toHaveBeenCalledWith('/category', { params: { keyword: 'tech' } })
  })

  it('createCategory 应该调用 POST /category', async () => {
    ;(request.post as any).mockResolvedValue({ data: { id: 1 } })
    const data = { name: 'new-category', slug: 'new-category' }
    await categoryApi.createCategory(data as any)
    expect(request.post).toHaveBeenCalledWith('/category', data)
  })

  it('updateCategory 应该调用 PUT /category/:id', async () => {
    ;(request.put as any).mockResolvedValue({ data: { id: 1 } })
    await categoryApi.updateCategory(1, { name: 'updated' })
    expect(request.put).toHaveBeenCalledWith('/category/1', { name: 'updated' })
  })

  it('deleteCategory 应该调用 DELETE /category/:id', async () => {
    ;(request.delete as any).mockResolvedValue({})
    await categoryApi.deleteCategory(1)
    expect(request.delete).toHaveBeenCalledWith('/category/1')
  })
})

describe('User API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loginApi 应该调用 POST /user/login', async () => {
    const mockResult = {
      data: { accessToken: 'token', refreshToken: 'refresh', deviceId: 'device' },
    }
    ;(request.post as any).mockResolvedValue(mockResult)
    const params = { username: 'admin', password: '123456' }
    const result = await userApi.loginApi(params)
    expect(request.post).toHaveBeenCalledWith('/user/login', params)
    expect(result).toEqual(mockResult)
  })

  it('getUsers 应该调用 GET /user', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await userApi.getUsers()
    expect(request.get).toHaveBeenCalledWith('/user', { params: undefined })
  })

  it('getUsers 应该传递分页参数', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await userApi.getUsers({ page: 1, pageSize: 20 })
    expect(request.get).toHaveBeenCalledWith('/user', { params: { page: 1, pageSize: 20 } })
  })

  it('createUser 应该调用 POST /user', async () => {
    ;(request.post as any).mockResolvedValue({ data: { id: 1 } })
    await userApi.createUser({ username: 'newuser', nickname: 'New' })
    expect(request.post).toHaveBeenCalledWith('/user', { username: 'newuser', nickname: 'New' })
  })

  it('updateUser 应该调用 PUT /user/:id', async () => {
    ;(request.put as any).mockResolvedValue({ data: { id: 1 } })
    await userApi.updateUser(1, { nickname: 'UpdatedName' })
    expect(request.put).toHaveBeenCalledWith('/user/1', { nickname: 'UpdatedName' })
  })

  it('deleteUser 应该调用 DELETE /user/:id', async () => {
    ;(request.delete as any).mockResolvedValue({})
    await userApi.deleteUser(1)
    expect(request.delete).toHaveBeenCalledWith('/user/1')
  })
})

describe('Post API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getPosts 应该调用 GET /post', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await postApi.getPosts()
    expect(request.get).toHaveBeenCalledWith('/post', { params: undefined })
  })

  it('getPosts 应该传递分页和筛选参数', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await postApi.getPosts({ page: 1, pageSize: 10, status: 1, categoryId: 2 })
    expect(request.get).toHaveBeenCalledWith('/post', {
      params: { page: 1, pageSize: 10, status: 1, categoryId: 2 },
    })
  })

  it('createPost 应该调用 POST /post', async () => {
    ;(request.post as any).mockResolvedValue({ data: { id: 1 } })
    await postApi.createPost({ title: 'New Post', content: 'Hello' })
    expect(request.post).toHaveBeenCalledWith('/post', { title: 'New Post', content: 'Hello' })
  })

  it('updatePost 应该调用 PUT /post/:id', async () => {
    ;(request.put as any).mockResolvedValue({ data: { id: 1 } })
    await postApi.updatePost(1, { title: 'Updated Title' })
    expect(request.put).toHaveBeenCalledWith('/post/1', { title: 'Updated Title' })
  })

  it('deletePost 应该调用 DELETE /post/:id', async () => {
    ;(request.delete as any).mockResolvedValue({})
    await postApi.deletePost(1)
    expect(request.delete).toHaveBeenCalledWith('/post/1')
  })
})

describe('Media API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getMediaList 应该调用 GET /media', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await mediaApi.getMediaList()
    expect(request.get).toHaveBeenCalledWith('/media', { params: undefined })
  })

  it('getMediaList 应该传递分页参数', async () => {
    ;(request.get as any).mockResolvedValue({ data: [] })
    await mediaApi.getMediaList({ page: 1, pageSize: 20 })
    expect(request.get).toHaveBeenCalledWith('/media', { params: { page: 1, pageSize: 20 } })
  })

  it('uploadMedia 应该构建 FormData 并调用 POST /media/upload', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    const mockRes = { data: { id: 1, url: '/uploads/test.png' } }
    ;(request.post as any).mockResolvedValue(mockRes)
    const result = await mediaApi.uploadMedia(file)
    expect(request.post).toHaveBeenCalledWith(
      '/media/upload',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    expect(result).toEqual(mockRes)
  })

  it('deleteMedia 应该调用 DELETE /media/:id', async () => {
    ;(request.delete as any).mockResolvedValue({})
    await mediaApi.deleteMedia(1)
    expect(request.delete).toHaveBeenCalledWith('/media/1')
  })
})
