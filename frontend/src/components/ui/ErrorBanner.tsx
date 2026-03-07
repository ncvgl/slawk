import { X, CheckCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-md bg-slack-error-bg border border-slack-error-border px-3 py-2 text-[13px] text-slack-error">
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 text-slack-error hover:text-slack-error">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface SuccessBannerProps {
  message: string;
  'data-testid'?: string;
}

export function SuccessBanner({ message, 'data-testid': testId }: SuccessBannerProps) {
  return (
    <div
      data-testid={testId}
      className="mt-2 flex items-center gap-2 rounded-md bg-slack-success px-3 py-2 text-[13px] text-slack-btn font-medium"
    >
      <CheckCircle className="h-4 w-4 flex-shrink-0" />
      {message}
    </div>
  );
}
