import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Menu } from 'lucide-react';
import { format } from 'date-fns';
import { getUserFiles, getAuthFileUrl, getFileUrl, refreshDownloadToken, type ApiFileWithUser } from '@/lib/api';
import { formatBytes, FileIcon } from '@/lib/fileUtils';
import { ImageLightbox } from './ImageLightbox';
import { useMobileStore } from '@/stores/useMobileStore';

export function FilesPage() {
  const [files, setFiles] = useState<ApiFileWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

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
      <div className="flex h-[49px] flex-shrink-0 items-center border-b border-slack-border px-5">
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
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
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
                  <button
                    onClick={() => { setLightboxSrc(getFileUrl(file.id)); setLightboxAlt(file.originalName); }}
                    className="flex-shrink-0 cursor-zoom-in"
                  >
                    <img
                      src={getFileUrl(file.id)}
                      alt={file.originalName}
                      className="h-10 w-10 rounded object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-slack-hover">
                    <FileIcon mimetype={file.mimetype} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {file.mimetype.startsWith('image/') ? (
                    <button
                      onClick={() => { setLightboxSrc(getFileUrl(file.id)); setLightboxAlt(file.originalName); }}
                      className="block text-[14px] font-medium text-slack-link hover:underline truncate text-left"
                    >
                      {file.originalName}
                    </button>
                  ) : (
                    <a
                      href={getFileUrl(file.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[14px] font-medium text-slack-link hover:underline truncate"
                    >
                      {file.originalName}
                    </a>
                  )}
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

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={lightboxAlt}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
