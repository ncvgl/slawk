import { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ScheduleModalProps {
  onSchedule: (date: Date) => void;
  onClose: () => void;
  isScheduling: boolean;
}

export function ScheduleModal({ onSchedule, onClose, isScheduling }: ScheduleModalProps) {
  // Default to 1 minute from now (user's local timezone)
  const [customScheduleAt, setCustomScheduleAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 1000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-[380px] rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slack-border-light px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slack-link" />
            <h2 className="text-[17px] font-bold text-slack-primary">Schedule message</h2>
          </div>
          <Button variant="toolbar" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-[13px] font-semibold text-slack-primary">Date and time</label>
          <input
            data-testid="custom-schedule-input"
            type="datetime-local"
            value={customScheduleAt}
            onChange={(e) => setCustomScheduleAt(e.target.value)}
            min={(() => { const d = new Date(Date.now() + 60 * 1000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()}
            className="h-9 w-full rounded-md border border-slack-border-dark px-3 text-[14px] text-slack-primary outline-none focus:border-slack-link focus:ring-1 focus:ring-slack-link"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slack-border-light px-5 py-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slack-border-dark px-4 py-1.5 text-[14px] font-medium text-slack-primary hover:bg-slack-hover"
          >
            Cancel
          </Button>
          <Button
            disabled={!customScheduleAt || isScheduling}
            onClick={() => {
              if (!customScheduleAt) return;
              // Parse datetime-local string as local time (not UTC)
              const [datePart, timePart] = customScheduleAt.split('T');
              const [year, month, day] = datePart.split('-').map(Number);
              const [hour, minute] = timePart.split(':').map(Number);
              const scheduled = new Date(year, month - 1, day, hour, minute);
              if (scheduled <= new Date()) return;
              onSchedule(scheduled);
            }}
            className={cn(
              'px-4 py-1.5 text-[14px] font-medium',
              !(customScheduleAt && !isScheduling) &&
                'bg-slack-border cursor-not-allowed hover:bg-slack-border',
            )}
          >
            {isScheduling ? 'Scheduling...' : 'Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
