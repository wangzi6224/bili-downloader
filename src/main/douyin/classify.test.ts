import { describe, expect, it } from 'vitest'
import { classify } from './classify'

const res = (body: unknown, status = 200) => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('classify', () => {
  it('403、429 和内容为 blocked 的响应算限流', () => {
    expect(classify(res('', 403))).toEqual({ type: 'cooldown' })
    expect(classify(res({ status_code: 0, a: 1 }, 429))).toEqual({ type: 'cooldown' })
    expect(classify(res('  blocked\n'))).toEqual({ type: 'cooldown' })
  })

  it('非 200、空内容、不是 JSON 对象的响应算拒绝', () => {
    for (const r of [res({ status_code: 0, a: 1 }, 500), res(''), res('   '), res('<html></html>'), res('null'), res('0'), res('"x"')]) {
      expect(classify(r)).toEqual({ type: 'rejected' })
    }
  })

  it('搜索结果要求验证时认成要验证，两个字段都看', () => {
    expect(classify(res({ status_code: 0, data: [], search_nil_info: { search_nil_type: 'verify_check' } }))).toEqual({ type: 'verify' })
    expect(classify(res({ status_code: 0, data: [], search_nil_info: { search_nil_item: 'verify_check' } }))).toEqual({ type: 'verify' })
    expect(classify(res({ status_code: 0, data: [], search_nil_info: { search_nil_type: 'no_result' } })).type).toBe('ok')
  })

  it('状态码 8 和 2483 是要登录', () => {
    expect(classify(res({ status_code: 8 }))).toEqual({ type: 'login' })
    expect(classify(res({ status_code: 2483, status_msg: '请登录' }))).toEqual({ type: 'login' })
  })

  it('其他非零状态码是业务错误，没有说明时用状态码', () => {
    expect(classify(res({ status_code: 5, status_msg: '参数不对' }))).toEqual({ type: 'error', code: 5, message: '参数不对' })
    expect(classify(res({ status_code: 2190 }))).toEqual({ type: 'error', code: 2190, message: '2190' })
  })

  it('只有外壳字段的空壳响应算拒绝', () => {
    expect(classify(res({ status_code: 0 }))).toEqual({ type: 'rejected' })
    expect(classify(res({ status_code: 0, status_msg: '', log_pb: {}, extra: {} }))).toEqual({ type: 'rejected' })
    expect(classify(res({}))).toEqual({ type: 'rejected' })
  })

  it('没有状态码但带内容也算成功', () => {
    expect(classify(res({ user: { uid: '1' } }))).toEqual({ type: 'ok', data: { user: { uid: '1' } } })
    expect(classify(res({ status_code: '8', user: null })).type).toBe('ok')
  })

  it('应该带列表时，列表缺失或为 null 算拒绝，空数组算成功', () => {
    expect(classify(res({ status_code: 0, aweme_list: null, has_more: 0 }), { list: 'aweme_list' })).toEqual({ type: 'rejected' })
    expect(classify(res({ status_code: 0, has_more: 0 }), { list: 'aweme_list' })).toEqual({ type: 'rejected' })
    expect(classify(res({ status_code: 0, aweme_list: [] }), { list: 'aweme_list' }).type).toBe('ok')
  })

  it('允许 null 当空列表时，只有没有下一页才认', () => {
    const expectation = { list: 'collects_list', nullIsEmpty: true }
    expect(classify(res({ status_code: 0, collects_list: null, has_more: false }), expectation).type).toBe('ok')
    expect(classify(res({ status_code: 0, collects_list: null, has_more: true }), expectation)).toEqual({ type: 'rejected' })
  })
})
