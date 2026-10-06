import type { ReactNode } from 'react';
import Icon, { type IconName } from './ui/Icon';

interface Props {
  title: string;
  message: string;
  icon?: IconName;
  actions?: ReactNode;
}

// Jewel .empty-state: hairline icon, short title, one line, one way forward.
export default function EmptyState({ title, message, icon = 'cluster', actions }: Props) {
  return (
    <div className="empty-state empty-state--boxed">
      <Icon name={icon} className="empty-state__icon" />
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__text">{message}</p>
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  );
}
