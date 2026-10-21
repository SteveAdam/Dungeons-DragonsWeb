// Plain stand-ins for the P0-3 components, with the props P0-7 uses. The page tests swap them in with vi.mock so
// they test P0-7's logic whatever the real components render.
import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Paper({
  variant,
  as: As = 'div',
  children,
  texture: _texture,
  ...rest
}: {
  variant?: 'torn' | 'flat' | 'framed';
  texture?: 'full' | 'flat';
  as?: ElementType;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  void _texture; // not a DOM attribute
  return (
    <As data-paper={variant ?? 'flat'} {...rest}>
      {children}
    </As>
  );
}
export function Button({
  variant = 'primary',
  ...rest
}: { variant?: 'primary' | 'ghost' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-variant={variant} {...rest} />;
}
export function Tag({ children }: { children: ReactNode }) {
  return <span data-tag>{children}</span>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /> {label}
    </label>
  );
}
export function DmBanner() {
  return (
    <div role="note" data-dm-banner>
      DM mode
    </div>
  );
}
export function RibbonTabs({
  tabs,
  value,
  onChange,
  ...rest
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
} & Omit<HTMLAttributes<HTMLElement>, 'onChange'>) {
  return (
    <div role="tablist" {...rest}>
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
