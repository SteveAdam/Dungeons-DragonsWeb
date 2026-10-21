import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className ?? ''].filter(Boolean).join(' ')} {...rest} />;
}
