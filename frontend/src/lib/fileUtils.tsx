import { FileText, FileImage, FileArchive } from 'lucide-react';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileIcon({ mimetype }: { mimetype: string }) {
  if (mimetype.startsWith('image/')) return <FileImage className="h-5 w-5 text-slack-file-image" />;
  if (mimetype === 'application/pdf') return <FileText className="h-5 w-5 text-slack-file-pdf" />;
  if (mimetype.includes('zip')) return <FileArchive className="h-5 w-5 text-slack-file-archive" />;
  return <FileText className="h-5 w-5 text-slack-hint" />;
}
