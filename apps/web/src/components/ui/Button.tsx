import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './Button.module.css';

type ButtonProps = {
  variant?: 'primary' | 'ghost';
  ref?: Ref<HTMLButtonElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Primary is a wax-red seal; ghost is an outlined ink button. */
export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  const classes = [styles.button, variant === 'ghost' ? styles.ghost : styles.primary, className ?? '']
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} data-variant={variant} {...rest} />;
}
