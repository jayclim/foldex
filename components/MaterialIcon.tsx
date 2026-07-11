'use client'

type MaterialIconProps = {
  name: string
  className?: string
}

export function MaterialIcon({ name, className }: MaterialIconProps) {
  return (
    <span className={className ? `material-symbols-outlined ${className}` : 'material-symbols-outlined'} aria-hidden="true">
      {name}
    </span>
  )
}