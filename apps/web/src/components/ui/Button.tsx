import type { ButtonHTMLAttributes } from 'react';
import styles from './ui.module.css';

type ButtonProps = { variant?: 'primary' | 'ghost' } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  const classes = [styles.button, variant === 'ghost' ? styles.ghost : styles.primary, className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
