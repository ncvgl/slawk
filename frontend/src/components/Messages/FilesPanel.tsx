import { useState, useEffect, useCallback } from 'react';
import { FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import { getChannelFiles, getUserFiles, getAuthFileUrl, refreshDownloadToken, type ApiFileWithUser } from '@/lib/api';
import { ImageLightbox } from './ImageLightbox';
import { PanelHeader } from './PanelHeader';
import { formatBytes, FileIcon } from '@/lib/fileUtils';

interface FilesPanelProps {
  channelId?: number;
  onClose: () => void;
  title?: string;
}


export function FilesPanel({ channelId, onClose, title }: FilesPanelProps) {
  const [files, setFiles] = useState<ApiFileWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

  const fetchFiles = useCallback(() => {
    setIsLoading(true);
    const fetchFn = channelId ? getChannelFiles(channelId) : getUserFiles();
    Promise.all([fetchFn, refreshDownloadToken()])
      .then(([data]) => {
        setFiles(data);
        setLoadError(null);
      })
      .catch(() => setLoadError('Failed to load files.'))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const panelTitle = title ?? (channelId ? 'Channel files' : 'All files');

  return (
    <div data-testid="files-panel" className="flex w-full md:w-[300px] flex-col border-l border-slack-border bg-white absolute inset-0 md:static md:inset-auto z-30 md:z-auto">
      <PanelHeader icon={FileText} title={panelTitle} onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="p-4 text-center text-sm text-slack-error">{loadError}</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-sm text-slack-hint">No files uploaded yet</div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="border-b border-slack-border-light px-4 py-3">
              {file.mimetype.startsWith('image/') ? (
                <button
                  onClick={() => { setLightboxSrc(getAuthFileUrl(file.url)); setLightboxAlt(file.originalName); }}
                  className="block mb-2 w-full cursor-zoom-in focus:outline-none"
                >
                  <img
                    src={getAuthFileUrl(file.url)}
                    alt={file.originalName}
                    className="w-full max-h-[140px] rounded object-cover"
                  />
                </button>
              ) : null}
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex-shrink-0">
                  <FileIcon mimetype={file.mimetype} />
                </div>
                <div className="flex-1 min-w-0">
                  {file.mimetype.startsWith('image/') ? (
                    <button
                      onClick={() => { setLightboxSrc(getAuthFileUrl(file.url)); setLightboxAlt(file.originalName); }}
                      className="block text-[13px] font-medium text-slack-link hover:underline truncate text-left"
                    >
                      {file.originalName}
                    </button>
                  ) : (
                    <a
                      href={getAuthFileUrl(file.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[13px] font-medium text-slack-link hover:underline truncate"
                    >
                      {file.originalName}
                    </a>
                  )}
                  <p className="text-[11px] text-slack-secondary">
                    {formatBytes(file.size)} &middot; {file.user.name} &middot;{' '}
                    {format(new Date(file.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <a
                  href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                  download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
                  className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded hover:bg-slack-hover"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5 text-slack-secondary" />
                </a>
              </div>
            </div>
          ))
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
