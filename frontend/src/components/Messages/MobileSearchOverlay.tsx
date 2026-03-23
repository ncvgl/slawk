import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { searchMessages, type SearchResult } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { renderMessageContent } from '@/lib/renderMessageContent';

interface MobileSearchOverlayProps {
  onClose: () => void;
  testIdPrefix?: string;
}

export function MobileSearchOverlay({ onClose, testIdPrefix = '' }: MobileSearchOverlayProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSearch = useCallback(async (query?: string) => {
    const q = (query ?? searchQuery).trim();
    if (q.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await searchMessages(q);
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      handleSearch();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.channel) {
      navigate(`/c/${result.channel.id}`, { state: { scrollToMessageId: result.id } });
    } else if (result.participant) {
      navigate(`/d/${result.participant.id}`, { state: { scrollToMessageId: result.id } });
    }
    onClose();
  };

  const prefix = testIdPrefix ? `${testIdPrefix}-` : '';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" data-testid={`${prefix}mobile-search-overlay`}>
      {/* Search header */}
      <div className="flex items-center gap-2 border-b border-slack-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Search className="h-4 w-4 flex-shrink-0 text-slack-secondary" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          className="flex-1 bg-transparent text-[15px] text-slack-primary placeholder:text-slack-secondary outline-none"
        />
        <button
          onClick={onClose}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded hover:bg-slack-hover"
          data-testid={`${prefix}mobile-search-close`}
        >
          <X className="h-5 w-5 text-slack-secondary" />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="p-4 text-center text-sm text-slack-hint">Searching...</div>
        ) : hasSearched && searchResults.length === 0 ? (
          <div className="p-4 text-center text-sm text-slack-hint">No results found</div>
        ) : searchResults.length > 0 ? (
          <div>
            <div className="px-3 py-2 text-xs font-medium text-slack-hint border-b border-slack-border">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
            {searchResults.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                data-testid="search-result-item"
                onClick={() => handleResultClick(result)}
                className="w-full text-left px-3 py-2.5 hover:bg-slack-hover active:bg-slack-hover border-b border-slack-border-light last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <Avatar
                    src={result.user.avatar ?? undefined}
                    alt={result.user.name}
                    fallback={result.user.name}
                    size="sm"
                    className="flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs text-slack-hint">
                      <span className="font-medium text-slack-primary">{result.user.name}</span>
                      <span className="text-slack-disabled">
                        {format(new Date(result.createdAt), 'h:mm a')}
                      </span>
                      {result.channel && (
                        <>
                          <span>in</span>
                          <span className="font-medium">#{result.channel.name}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-slack-primary line-clamp-2">{renderMessageContent(result.content)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-slack-hint">
            Search for messages across all channels and conversations
          </div>
        )}
      </div>
    </div>
  );
}
