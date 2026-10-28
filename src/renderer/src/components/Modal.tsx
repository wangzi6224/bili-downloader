import { useEffect, type ReactNode } from 'react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        className={`w-full overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-900 ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'default' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-bili text-white hover:bg-bili-dark disabled:opacity-50',
    default:
      'border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-50',
    ghost: 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-40',
    danger: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
  }[variant]
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  )
}
