import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DyAccounts, GUEST_PARTITION } from './accounts'
import type { DyUser } from './types'

let dir = ''
let clock = 1_000
let clearPartition: ReturnType<typeof vi.fn<(partition: string) => Promise<void>>>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dy-accounts-'))
  clock = 1_000
  clearPartition = vi.fn(async () => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

const make = (): DyAccounts => new DyAccounts(dir, { clearPartition, now: () => clock })
const saved = (): { current?: string; accounts: Record<string, unknown>[] } => JSON.parse(readFileSync(join(dir, 'accounts.json'), 'utf8'))
const user = (n: number, over: Partial<DyUser> = {}): DyUser => ({
  uid: `uid-${n}`,
  sec_uid: `SEC-test-user-${n}-abcdef`,
  nickname: `测试用户${n}`,
  unique_id: `handle${n}`,
  avatar_thumb: { url_list: ['', `https://img.example/${n}.jpg`] },
  ...over
})
const login = async (a: DyAccounts, u: DyUser): Promise<{ id: string; partition: string }> => {
  const slot = a.prepare()
  await a.commit(slot.id, u)
  return slot
}

describe('读取记录', () => {
  it('没有记录时是空的', () => {
    const a = make()
    expect(a.snapshot()).toEqual({ current: undefined, accounts: [] })
    expect(a.current()).toBeUndefined()
  })

  it('丢掉缺了 id、分区或 sec_uid 的条目；当前账号不在列表里时不选', () => {
    const good = { id: 'a', partition: 'persist:douyin-a', secUid: 'sa', uid: '1', name: '甲', addedAt: 1, status: 'ready' }
    writeFileSync(
      join(dir, 'accounts.json'),
      JSON.stringify({ current: 'gone', accounts: [good, null, { ...good, id: '' }, { ...good, id: 'b', partition: '' }, { ...good, id: 'c', secUid: '' }] })
    )
    const a = make()
    expect(a.snapshot().accounts.map((x) => x.id)).toEqual(['a'])
    expect(a.current()).toBeUndefined()
  })

  it('保留上次选的账号；坏文件和没有列表的文件当作空的', () => {
    writeFileSync(join(dir, 'accounts.json'), JSON.stringify({ current: 'a', accounts: [{ id: 'a', partition: 'p', secUid: 's' }] }))
    expect(make().current()).toBe('a')
    writeFileSync(join(dir, 'accounts.json'), '{}')
    expect(make().snapshot().accounts).toEqual([])
    writeFileSync(join(dir, 'accounts.json'), '{oops')
    expect(make().snapshot().accounts).toEqual([])
  })
})

describe('登录', () => {
  it('每次登录分一个新分区，确认身份前就能按临时 id 取到；不登录和不认识的账号用访客分区', () => {
    const a = make()
    const first = a.prepare()
    const second = a.prepare()
    expect(first.partition).toBe(`persist:douyin-${first.id}`)
    expect(second.id).not.toBe(first.id)
    expect(a.partition(first.id)).toBe(first.partition)
    expect(a.partition(null)).toBe(GUEST_PARTITION)
    expect(a.partition('nobody')).toBe(GUEST_PARTITION)
    expect(a.snapshot().accounts).toEqual([])
    expect(a.identity(first.id)).toBeUndefined()
  })

  it('确认身份后记成账号并选中它；快照里不带分区和抖音 id；发出 changed 和 login', async () => {
    const a = make()
    const changed = vi.fn()
    const loggedIn = vi.fn()
    a.on('changed', changed)
    a.on('login', loggedIn)
    const { id, partition } = a.prepare()
    const snapshot = await a.commit(id, user(1))
    expect(snapshot).toEqual({
      current: id,
      accounts: [{ id, name: '测试用户1', handle: 'handle1', avatar: 'https://img.example/1.jpg', addedAt: 1_000, checkedAt: 1_000, status: 'ready' }]
    })
    expect(changed).toHaveBeenCalledWith(snapshot)
    expect(loggedIn).toHaveBeenCalledWith(id)
    expect(a.partition(id)).toBe(partition)
    expect(a.identity(id)).toEqual({ secUid: 'SEC-test-user-1-abcdef', uid: 'uid-1' })
    expect(saved().accounts[0]).toMatchObject({ id, partition, secUid: 'SEC-test-user-1-abcdef', uid: 'uid-1' })
    expect(make().current()).toBe(id)
    expect(clearPartition).not.toHaveBeenCalled()
  })

  it('没有昵称时用抖音号，再没有就用 sec_uid 末尾；没有抖音号用短号；没有 uid 记空串', async () => {
    const a = make()
    await login(a, user(1, { nickname: '', uid: undefined }))
    await login(a, user(2, { nickname: undefined, unique_id: undefined, short_id: '7788', avatar_thumb: undefined }))
    await login(a, user(3, { nickname: '', unique_id: '', short_id: '' }))
    expect(a.snapshot().accounts.map((x) => [x.name, x.handle, x.avatar])).toEqual([
      ['handle1', 'handle1', 'https://img.example/1.jpg'],
      ['abcdef', '7788', undefined],
      ['abcdef', undefined, 'https://img.example/3.jpg']
    ])
    expect(a.identity(a.snapshot().accounts[0].id)!.uid).toBe('')
  })

  it('同一个抖音账号重新登录：保留原 id 和添加时间，换成新分区并清掉旧的', async () => {
    const a = make()
    const first = await login(a, user(1))
    const other = await login(a, user(2))
    a.markExpired(first.id)
    clock = 5_000
    const again = a.prepare()
    const loggedIn = vi.fn()
    a.on('login', loggedIn)
    const snapshot = await a.commit(again.id, user(1, { nickname: '改名了' }))
    expect(snapshot.current).toBe(first.id)
    expect(snapshot.accounts.map((x) => x.id)).toEqual([first.id, other.id])
    expect(snapshot.accounts[0]).toMatchObject({ name: '改名了', addedAt: 1_000, checkedAt: 5_000, status: 'ready' })
    expect(a.partition(first.id)).toBe(again.partition)
    expect(a.partition(again.id)).toBe(GUEST_PARTITION)
    expect(clearPartition).toHaveBeenCalledExactlyOnceWith(first.partition)
    expect(loggedIn).toHaveBeenCalledWith(first.id)
  })

  it('不传时钟时用系统时间', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(42_000)
    const a = new DyAccounts(dir, { clearPartition })
    const { id } = await login(a, user(1))
    vi.setSystemTime(43_000)
    a.update(id, user(1))
    expect(a.snapshot().accounts[0]).toMatchObject({ addedAt: 42_000, checkedAt: 43_000 })
  })

  it('没有在登录中的 id、或资料里没有 sec_uid 时报登录已失效', async () => {
    const a = make()
    await expect(a.commit('nobody', user(1))).rejects.toThrow('抖音登录已失效')
    const { id } = a.prepare()
    await expect(a.commit(id, user(1, { sec_uid: undefined }))).rejects.toThrow('抖音登录已失效')
    expect(a.snapshot().accounts).toEqual([])
    // 还能丢掉这个没确认成的分区
    await a.discard(id)
    expect(clearPartition).toHaveBeenCalledExactlyOnceWith(`persist:douyin-${id}`)
  })

  it('放弃登录时清掉分区；放弃两次或不认识的 id 什么都不做', async () => {
    const a = make()
    const { id, partition } = a.prepare()
    await a.discard(id)
    await a.discard(id)
    await a.discard('nobody')
    expect(clearPartition).toHaveBeenCalledExactlyOnceWith(partition)
    expect(a.partition(id)).toBe(GUEST_PARTITION)
  })
})

describe('切换和删除', () => {
  it('切换账号发出 login；选不登录只发 changed；不认识的账号报错', async () => {
    const a = make()
    const first = await login(a, user(1))
    await login(a, user(2))
    const loggedIn = vi.fn()
    const changed = vi.fn()
    a.on('login', loggedIn)
    a.on('changed', changed)
    expect(a.select(first.id).current).toBe(first.id)
    expect(loggedIn).toHaveBeenCalledExactlyOnceWith(first.id)
    expect(a.select(undefined).current).toBeUndefined()
    expect(loggedIn).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(saved().current).toBeUndefined()
    expect(() => a.select('nobody')).toThrow('没有这个抖音账号')
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('删掉当前账号时换到第一个没失效的；清掉它的分区', async () => {
    const a = make()
    const first = await login(a, user(1))
    const second = await login(a, user(2))
    const third = await login(a, user(3))
    a.markExpired(first.id)
    const removed = vi.fn()
    a.on('removed', removed)
    const snapshot = await a.remove(third.id)
    expect(snapshot.current).toBe(second.id)
    expect(snapshot.accounts.map((x) => x.id)).toEqual([first.id, second.id])
    expect(removed).toHaveBeenCalledWith(third.id)
    expect(clearPartition).toHaveBeenCalledWith(third.partition)
  })

  it('删掉别的账号时当前账号不变；只剩失效账号时不选任何账号', async () => {
    const a = make()
    const first = await login(a, user(1))
    const second = await login(a, user(2))
    expect((await a.remove(first.id)).current).toBe(second.id)
    const third = await login(a, user(3))
    a.markExpired(second.id)
    expect((await a.remove(third.id)).current).toBeUndefined()
  })

  it('删不认识的账号什么都不做', async () => {
    const a = make()
    const removed = vi.fn()
    a.on('removed', removed)
    expect(await a.remove('nobody')).toEqual({ current: undefined, accounts: [] })
    expect(removed).not.toHaveBeenCalled()
    expect(clearPartition).not.toHaveBeenCalled()
  })
})

describe('状态', () => {
  it('查过资料后更新名字头像并标记可用', async () => {
    const a = make()
    const { id } = await login(a, user(1))
    a.markExpired(id)
    clock = 9_000
    const snapshot = a.update(id, user(1, { nickname: '新名字', avatar_thumb: { url_list: ['https://img.example/new.jpg'] } }))
    expect(snapshot.accounts[0]).toMatchObject({ name: '新名字', avatar: 'https://img.example/new.jpg', checkedAt: 9_000, status: 'ready' })
  })

  it('资料里没有名字头像时沿用原来的', async () => {
    const a = make()
    const { id } = await login(a, user(1))
    expect(a.update(id, { sec_uid: 's' }).accounts[0]).toMatchObject({ name: '测试用户1', avatar: 'https://img.example/1.jpg' })
  })

  it('更新不认识的账号不写文件', async () => {
    const a = make()
    const changed = vi.fn()
    a.on('changed', changed)
    expect(a.update('nobody', user(1)).accounts).toEqual([])
    expect(changed).not.toHaveBeenCalled()
  })

  it('标记失效只在状态变化时保存一次；不认识的账号忽略', async () => {
    const a = make()
    const { id } = await login(a, user(1))
    const changed = vi.fn()
    a.on('changed', changed)
    a.markExpired('nobody')
    a.markExpired(id)
    a.markExpired(id)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(saved().accounts[0].status).toBe('expired')
  })
})
