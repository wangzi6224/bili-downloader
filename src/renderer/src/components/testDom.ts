// 组件测试共用的 DOM 小工具（项目没有 @testing-library）：挂载、按名称找按钮、输入、按键、粘贴
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export interface Mounted {
  container: HTMLDivElement
  render: (element: ReactElement) => Promise<void>
  unmount: () => void
}

export function mount(): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  return {
    container,
    render: async (element) => {
      await act(async () => root.render(element))
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

const nameOf = (el: Element): string[] =>
  [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent?.trim()].filter((x): x is string => Boolean(x))

/** 按 aria-label、title 或文字找按钮：字符串要完全相同，正则只要匹配 */
export function findButton(scope: ParentNode, name: string | RegExp): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    nameOf(b).some((n) => (typeof name === 'string' ? n === name : name.test(n))))
}

export function getButton(scope: ParentNode, name: string | RegExp): HTMLButtonElement {
  const b = findButton(scope, name)
  if (!b) throw new Error(`未找到按钮 ${String(name)}`)
  return b
}

export async function click(el: Element): Promise<void> {
  await act(async () => (el as HTMLElement).click())
}

/** 受控输入框：用原生 setter 改值再派发 input 事件，React 才收得到 */
export async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export async function pressKey(el: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

/** 粘贴：jsdom 没有 DataTransfer，自己挂一个 clipboardData。返回事件，便于检查是否被 preventDefault */
export async function pasteInto(el: Element, text: string): Promise<Event> {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  await act(async () => {
    el.dispatchEvent(event)
  })
  return event
}

export async function changeSelect(el: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** 手动控制什么时候完成的 Promise */
export function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 让挂起的 Promise 回调跑完 */
export const flush = (): Promise<void> => act(async () => {})
