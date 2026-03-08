import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Menu } from 'lucide-react';
import { format } from 'date-fns';
import { getUserFiles, getAuthFileUrl, refreshDownloadToken, type ApiFileWithUser } from '@/lib/api';
import { formatBytes, FileIcon } from '@/lib/fileUtils';
import { useMobileStore } from '@/stores/useMobileStore';

export function FilesPage() {
  const [files, setFiles] = useState<ApiFileWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchFiles = useCallback(() => {
    setIsLoading(true);
    Promise.all([getUserFiles(), refreshDownloadToken()])
      .then(([data]) => {
        setFiles(data);
        setLoadError(null);
      })
      .catch(() => setLoadError('Failed to load files.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return (
    <div data-testid="files-page" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-[49px] items-center border-b border-slack-border px-5">
        <button
          onClick={useMobileStore.getState().openSidebar}
          className="mr-2 flex h-8 w-8 items-center justify-center rounded hover:bg-slack-hover md:hidden"
        >
          <Menu className="h-5 w-5 text-slack-secondary" />
        </button>
        <FileText className="h-5 w-5 text-slack-secondary mr-2" />
        <span className="text-[18px] font-bold text-slack-primary">All files</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="text-center text-sm text-slack-error">{loadError}</div>
        ) : files.length === 0 ? (
          <div className="text-center text-sm text-slack-hint">No files uploaded yet</div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <div key={file.id} className="flex items-start gap-3 rounded-lg p-3 hover:bg-slack-hover">
                {file.mimetype.startsWith('image/') ? (
                  <a href={getAuthFileUrl(file.url)} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img
                      src={getAuthFileUrl(file.url)}
                      alt={file.originalName}
                      className="h-10 w-10 rounded object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-slack-hover">
                    <FileIcon mimetype={file.mimetype} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={getAuthFileUrl(file.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[14px] font-medium text-slack-link hover:underline truncate"
                  >
                    {file.originalName}
                  </a>
                  <p className="text-[12px] text-slack-secondary">
                    {formatBytes(file.size)} &middot; {file.user.name} &middot;{' '}
                    {format(new Date(file.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <a
                  href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                  download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
                  className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded hover:bg-slack-border-light"
                  title="Download"
                >
                  <Download className="h-4 w-4 text-slack-secondary" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
