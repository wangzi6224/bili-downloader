import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react'
import { ChevronDown, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'

/** 图标统一用这个线宽 */
export const STROKE = 1.75

/** 输入框、下拉框、多行文本共用的外观 */
export const fieldCls =
  'rounded-lg border border-line-strong bg-field text-fg outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-bili focus:ring-3 focus:ring-bili/15 disabled:opacity-50'

type Size = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT = {
  primary: 'bg-bili text-white shadow-sm shadow-bili/30 hover:bg-bili-dark',
  default: 'border border-line-strong bg-elevated text-fg shadow-xs hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  danger: 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
}

const BUTTON_SIZE: Record<Size, string> = {
  sm: 'h-7 gap-1 px-2 text-xs',
  md: 'h-8 gap-1.5 px-3 text-[13px]',
  lg: 'h-10 gap-2 px-4 text-sm'
}

export function Button({
  variant = 'default',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT
  size?: Size
  icon?: LucideIcon
}) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={STROKE} className="shrink-0" />}
      {children}
    </button>
  )
}

/** 只有图标的按钮，label 同时用作悬停提示和读屏文字 */
export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  variant = 'ghost',
  active = false,
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon
  label: string
  size?: Size
  variant?: 'ghost' | 'default' | 'danger'
  active?: boolean
}) {
  const box = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10' }[size]
  const look = {
    ghost: active ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg',
    default: `border border-line-strong bg-elevated shadow-xs hover:bg-hover ${active ? 'text-fg' : 'text-muted hover:text-fg'}`,
    danger: 'text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
  }[variant]
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${box} ${look} ${className}`}
      {...props}
    >
      <Icon size={size === 'lg' ? 18 : 16} strokeWidth={STROKE} />
    </button>
  )
}

export function Input({
  icon: Icon,
  size = 'md',
  className = '',
  inputClassName = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { icon?: LucideIcon; size?: Size; inputClassName?: string }) {
  const h = { sm: 'h-7 text-xs', md: 'h-8 text-[13px]', lg: 'h-10 text-sm' }[size]
  const pad = Icon ? { sm: 'pl-7 pr-2', md: 'pl-8 pr-2.5', lg: 'pl-10 pr-3' }[size] : size === 'lg' ? 'px-3' : 'px-2.5'
  return (
    <div className={`relative ${className}`}>
      {Icon && (
        <Icon
          size={size === 'lg' ? 17 : 14}
          strokeWidth={STROKE}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-subtle ${size === 'lg' ? 'left-3.5' : 'left-2.5'}`}
        />
      )}
      <input className={`${fieldCls} w-full ${h} ${pad} ${inputClassName}`} {...props} />
    </div>
  )
}

export function Select({
  size = 'md',
  className = '',
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        className={`${fieldCls} w-full appearance-none ${size === 'sm' ? 'h-7 pr-7 pl-2 text-xs' : 'h-8 pr-8 pl-2.5 text-[13px]'}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={STROKE}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-subtle ${size === 'sm' ? 'right-2' : 'right-2.5'}`}
      />
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-bili' : 'bg-black/12 dark:bg-white/18'}`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm shadow-black/20 transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  fill = false,
  size = 'md'
}: {
  value: T
  options: { value: T; label: string; hint?: string; icon?: LucideIcon; count?: number }[]
  onChange: (v: T) => void
  disabled?: boolean
  /** 等分整行（选项里用），否则按内容宽度 */
  fill?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={`${fill ? 'grid' : 'inline-flex'} gap-0.5 rounded-lg bg-track p-0.5 ${disabled ? 'opacity-40' : ''}`}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(({ value: v, label, hint, icon: Icon, count }) => (
        <button
          key={v}
          type="button"
          title={hint}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-xs'} ${value === v ? 'bg-thumb text-fg shadow-sm shadow-black/10' : 'text-muted hover:text-fg'}`}
        >
          {Icon && <Icon size={14} strokeWidth={STROKE} className="shrink-0" />}
          <span className="truncate">{label}</span>
          {count !== undefined && count > 0 && <span className="text-subtle tabular-nums">{count}</span>}
        </button>
      ))}
    </div>
  )
}

const BADGE_TONE = {
  neutral: 'bg-track text-muted',
  brand: 'bg-bili/12 text-bili-dark dark:text-bili',
  success: 'bg-green-500/12 text-green-700 dark:text-green-400',
  warn: 'bg-amber-500/14 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/12 text-red-600 dark:text-red-400',
  info: 'bg-sky/12 text-sky-700 dark:text-sky-300'
}

export function Badge({
  tone = 'neutral',
  icon: Icon,
  title,
  className = '',
  children
}: {
  tone?: keyof typeof BADGE_TONE
  icon?: LucideIcon
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap ${BADGE_TONE[tone]} ${className}`}
    >
      {Icon && <Icon size={12} strokeWidth={2} />}
      {children}
    </span>
  )
}

export function Progress({ value, muted = false, className = '' }: { value: number; muted?: boolean; className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-track ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${muted ? 'bg-subtle' : 'bg-linear-to-r from-[#ff9dbd] to-bili'}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/** 点按钮弹出的菜单，点外面或按 Esc 收起 */
export function Dropdown({
  button,
  children,
  className = 'w-64',
  align = 'end',
  side = 'bottom'
}: {
  button: (state: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  className?: string
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={box}>
      {button({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div
          className={`animate-pop absolute z-40 max-h-[65vh] overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-xl shadow-black/12 ${side === 'bottom' ? 'top-full mt-1.5 origin-top' : 'bottom-full mb-1.5 origin-bottom'} ${align === 'end' ? 'right-0' : 'left-0'} ${className}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon: Icon,
  onClick,
  checked,
  danger,
  trailing,
  children
}: {
  icon?: LucideIcon
  onClick: () => void
  checked?: boolean
  danger?: boolean
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover ${danger ? 'text-red-600 dark:text-red-400' : 'text-fg'}`}
    >
      {Icon && <Icon size={15} strokeWidth={STROKE} className={`shrink-0 ${danger ? '' : 'text-muted'}`} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
      {checked && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bili" />}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-subtle">{children}</div>
}

export function EmptyState({
  icon: Icon,
  art,
  title,
  children
}: {
  icon?: LucideIcon
  art?: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {art ??
        (Icon && (
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-track text-subtle">
            <Icon size={22} strokeWidth={STROKE} />
          </div>
        ))}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-xs leading-relaxed text-muted">{children}</div>}
    </div>
  )
}

const BANNER_TONE = {
  info: { cls: 'bg-sky/10 text-sky-800 dark:text-sky-200', icon: Info },
  warn: { cls: 'bg-amber-500/12 text-amber-800 dark:text-amber-200', icon: TriangleAlert },
  error: { cls: 'bg-red-500/10 text-red-700 dark:text-red-300', icon: CircleAlert }
}

/** 页面里的提示条：剪贴板检测、错误、通知等 */
export function Banner({
  tone = 'info',
  icon,
  spin = false,
  actions,
  onClose,
  children
}: {
  tone?: keyof typeof BANNER_TONE
  icon?: LucideIcon
  /** 图标转圈，表示正在进行 */
  spin?: boolean
  actions?: ReactNode
  onClose?: () => void
  children: ReactNode
}) {
  const Icon = icon ?? BANNER_TONE[tone].icon
  return (
    <div className={`animate-fade flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] ${BANNER_TONE[tone].cls}`}>
      <Icon size={16} strokeWidth={STROKE} className={`shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
      {onClose && (
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
          className="-mr-1 rounded-md p-1 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

export function Modal({
  onClose,
  children,
  className = 'max-w-lg'
}: {
  onClose?: () => void
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="no-drag animate-fade fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[3px] dark:bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className={`animate-pop w-full overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl shadow-black/25 ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** 弹窗标题行：可选图标、副标题和右上角关闭按钮 */
export function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  onClose
}: {
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
}) {
  return (
    <div className="flex items-start gap-3 px-6 pt-5">
      {Icon && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bili/12 text-bili">
          <Icon size={18} strokeWidth={STROKE} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold">{title}</div>
        {subtitle && <div className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</div>}
      </div>
      {onClose && <IconButton icon={X} label="关闭" size="sm" onClick={onClose} className="-mr-2" />}
    </div>
  )
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-2 border-t border-line bg-surface px-6 py-3.5">{children}</div>
}

/** 设置页的分组卡片 */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <div className="mb-1.5 px-1 text-xs font-medium text-muted">{title}</div>}
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">{children}</div>
    </section>
  )
}

/** 分组里的一行：左边名称和说明，右边控件；wide 时控件换到下一行占满 */
export function Row({
  label,
  hint,
  wide = false,
  children
}: {
  label: string
  hint?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const text = (
    <div className="min-w-0 flex-1">
      <div className="text-[13px] text-fg">{label}</div>
      {hint && <div className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</div>}
    </div>
  )
  if (wide) {
    return (
      <div className="px-4 py-3">
        {text}
        <div className="mt-2.5">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-6 px-4 py-3">
      {text}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** 页面标题栏：同时是窗口的拖拽区 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="drag flex shrink-0 items-end gap-4 px-8 pt-8 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="no-drag flex items-center gap-2">{actions}</div>}
    </div>
  )
}
