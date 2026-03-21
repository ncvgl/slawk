import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

interface PanelHeaderProps {
  icon?: LucideIcon;
  title: string;
  onClose: () => void;
}

export function PanelHeader({ icon: Icon, title, onClose }: PanelHeaderProps) {
  return (
    <div className="flex min-h-[49px] items-center justify-between border-b border-slack-border px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4 text-slack-secondary" />}
        <span className="text-[15px] font-bold text-slack-primary">{title}</span>
      </div>
      <Button variant="toolbar" size="icon-sm" onClick={onClose}>
        <X className="h-4 w-4 text-slack-secondary" />
      </Button>
    </div>
  );
}
