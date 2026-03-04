import { FileIcon, X } from 'lucide-react';
import { getAuthFileUrl } from '@/lib/api';
import type { ApiFile } from '@/lib/api';

interface FilePreviewProps {
  files: ApiFile[];
  onRemove: (fileId: number) => void;
}

export function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div
      data-testid="file-preview"
      className="flex flex-wrap gap-2 px-3 py-2 border-b border-slack-border-light"
    >
      {files.map((file) => (
        <div
          key={file.id}
          className="relative flex items-center gap-2 rounded-lg border border-slack-border-light bg-slack-hover px-3 py-2 text-sm"
        >
          {file.mimetype.startsWith('image/') ? (
            <img
              src={getAuthFileUrl(file.url)}
              alt={file.originalName}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <FileIcon className="h-5 w-5 text-slack-secondary" />
          )}
          <span className="max-w-[120px] truncate text-[13px] text-slack-primary">
            {file.originalName}
          </span>
          <button
            onClick={() => onRemove(file.id)}
            className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-slack-active-tab hover:bg-slack-border"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
