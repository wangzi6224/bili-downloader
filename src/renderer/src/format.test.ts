import { describe, expect, it } from 'vitest'
import { ago, checkedAgo, fmtBytes, fmtDuration, fmtEta, fmtSpeed, insertAt, thumb } from './format'

describe('fmtBytes', () => {
  it('0 显示 0 B，不到 1 KB 按字节取整', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(1023)).toBe('1023 B')
  })

  it('KB 不带小数，MB 以上保留一位', () => {
    expect(fmtBytes(1024)).toBe('1 KB')
    expect(fmtBytes(1536)).toBe('2 KB')
    expect(fmtBytes(1.5 * 1024 ** 2)).toBe('1.5 MB')
    expect(fmtBytes(1024 ** 3)).toBe('1.0 GB')
    expect(fmtBytes(2.25 * 1024 ** 4)).toBe('2.3 TB')
  })

  it('超过 TB 仍用 TB 表示', () => {
    expect(fmtBytes(1024 ** 5)).toBe('1024.0 TB')
  })

  it('速度在后面加 /s', () => {
    expect(fmtSpeed(1024)).toBe('1 KB/s')
  })
})

describe('fmtDuration', () => {
  it('没有时长时为空', () => {
    expect(fmtDuration()).toBe('')
    expect(fmtDuration(0)).toBe('')
  })

  it('不到一小时显示 分:秒，秒补零', () => {
    expect(fmtDuration(5)).toBe('0:05')
    expect(fmtDuration(61)).toBe('1:01')
    expect(fmtDuration(3599)).toBe('59:59')
  })

  it('一小时以上显示 时:分:秒，小数秒舍去', () => {
    expect(fmtDuration(3600)).toBe('1:00:00')
    expect(fmtDuration(3725.9)).toBe('1:02:05')
  })
})

describe('fmtEta', () => {
  it('无效值、0、负数和超过一天的不显示', () => {
    expect(fmtEta(NaN)).toBe('')
    expect(fmtEta(Infinity)).toBe('')
    expect(fmtEta(0)).toBe('')
    expect(fmtEta(-3)).toBe('')
    expect(fmtEta(86401)).toBe('')
  })

  it('正好一天仍按小时显示', () => {
    expect(fmtEta(86400)).toBe('24 小时 0 分')
  })

  it('不到一分钟向上取整到秒', () => {
    expect(fmtEta(0.2)).toBe('1 秒')
    expect(fmtEta(59.5)).toBe('60 秒')
  })

  it('一分钟以上显示分秒，一小时以上显示时分', () => {
    expect(fmtEta(60)).toBe('1 分 0 秒')
    expect(fmtEta(125.7)).toBe('2 分 5 秒')
    expect(fmtEta(3600)).toBe('1 小时 0 分')
    expect(fmtEta(7380)).toBe('2 小时 3 分')
  })
})

describe('thumb', () => {
  it('没有地址时返回 undefined', () => {
    expect(thumb(undefined, 96)).toBeUndefined()
    expect(thumb('', 96)).toBeUndefined()
  })

  it('http 换成 https，并加上宽度参数', () => {
    expect(thumb('http://i0.hdslb.com/bfs/face/a.jpg', 96)).toBe('https://i0.hdslb.com/bfs/face/a.jpg@96w.webp')
    expect(thumb('https://i0.hdslb.com/bfs/archive/b.jpg', 192)).toBe('https://i0.hdslb.com/bfs/archive/b.jpg@192w.webp')
  })

  it('只替换开头的 http:', () => {
    expect(thumb('//i0.hdslb.com/http:/c.jpg', 48)).toBe('//i0.hdslb.com/http:/c.jpg@48w.webp')
  })
})

describe('ago', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0).getTime()
  const before = (sec: number): number => now - sec * 1000

  it('一分钟内是刚刚，时间在未来也算刚刚', () => {
    expect(ago(now, now)).toBe('刚刚')
    expect(ago(before(59), now)).toBe('刚刚')
    expect(ago(now + 5000, now)).toBe('刚刚')
  })

  it('按分钟、小时、天的分界显示', () => {
    expect(ago(before(60), now)).toBe('1 分钟前')
    expect(ago(before(3599), now)).toBe('59 分钟前')
    expect(ago(before(3600), now)).toBe('1 小时前')
    expect(ago(before(86399), now)).toBe('23 小时前')
    expect(ago(before(86400), now)).toBe('1 天前')
    expect(ago(before(86400 * 30 - 1), now)).toBe('29 天前')
  })

  it('30 天以上显示日期', () => {
    const ms = before(86400 * 30)
    expect(ago(ms, now)).toBe(new Date(ms).toLocaleDateString())
  })

  it('可以加后缀并关掉日期分界', () => {
    expect(ago(before(10), now, { suffix: '检查' })).toBe('刚刚检查')
    expect(ago(before(86400 * 45), now, { dateAfterMonth: false })).toBe('45 天前')
  })
})

describe('checkedAgo', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0).getTime()
  const before = (sec: number): number => now - sec * 1000

  it('没有检查时间时显示还没检查过', () => {
    expect(checkedAgo(undefined, now)).toBe('还没检查过')
    expect(checkedAgo(0, now)).toBe('还没检查过')
  })

  it('后面带“检查”，超过 30 天仍按天显示', () => {
    expect(checkedAgo(before(30), now)).toBe('刚刚检查')
    expect(checkedAgo(before(300), now)).toBe('5 分钟前检查')
    expect(checkedAgo(before(7200), now)).toBe('2 小时前检查')
    expect(checkedAgo(before(86400 * 45), now)).toBe('45 天前检查')
  })
})

describe('insertAt', () => {
  it('在光标处插入', () => {
    expect(insertAt('{title}', 0, 0, '{index} ')).toBe('{index} {title}')
    expect(insertAt('ab', 1, 1, 'X')).toBe('aXb')
    expect(insertAt('ab', 2, 2, 'X')).toBe('abX')
  })

  it('有选中内容时替换选中的部分', () => {
    expect(insertAt('{series} - {title}', 0, 8, '{owner}')).toBe('{owner} - {title}')
  })

  it('插入空字符串等于删除选中内容', () => {
    expect(insertAt('abcdef', 1, 4, '')).toBe('aef')
  })
})
