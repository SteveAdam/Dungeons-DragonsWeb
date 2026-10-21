import type { ReactNode } from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { ICON_PROPS, iconClasses, type LucideIcon } from './icons';

type IconLinkProps = {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
} & Omit<NavLinkProps, 'children' | 'className'>;

/** A link with an icon in front. Marks itself aria-current="page" when it points at the current page. */
export function IconLink({ icon: Icon, children, className, ...rest }: IconLinkProps) {
  return (
    <NavLink className={[iconClasses.host, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      <Icon {...ICON_PROPS} className={iconClasses.icon} />
      <span>{children}</span>
    </NavLink>
  );
}
