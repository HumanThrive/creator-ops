import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

interface CommonProps {
  variant?: Variant
  children: ReactNode
}

interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  href?: undefined
}

interface LinkProps extends CommonProps {
  href: string
  type?: never
}

type PillButtonProps = ButtonProps | LinkProps

const CLASS: Record<Variant, string> = {
  primary: 'btn-pill',
  ghost: 'btn-ghost',
}

export function PillButton(props: PillButtonProps) {
  const { variant = 'primary', children } = props
  const className = CLASS[variant]

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={className}>
        {children}
      </Link>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, children: _c, href: _h, ...buttonRest } = props as ButtonProps & {
    href?: undefined
  }
  return (
    <button className={className} {...buttonRest}>
      {children}
    </button>
  )
}
