import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import { fetchPhotoHistory, type PhotoHistoryEntry } from '../../lib/auth';
import { useI18n } from '../../i18n';
import { storageErrorText } from '../utils/error';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';

interface PhotoHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HistoryFilters {
  style: string;
  uploader: string;
  from: string;
  to: string;
}

const PAGE_SIZE = 50;
const EMPTY_FILTERS: HistoryFilters = {
  style: '',
  uploader: '',
  from: '',
  to: '',
};

const formatTime = (value: string, locale: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const PhotoHistoryDialog = ({ open, onOpenChange }: PhotoHistoryDialogProps) => {
  const { t, locale } = useI18n();
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [items, setItems] = useState<PhotoHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = async (
    nextFilters: HistoryFilters,
    offset: number,
    append: boolean,
  ) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchPhotoHistory({
        ...nextFilters,
        limit: PAGE_SIZE,
        offset,
      });
      setItems((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setTotal(result.total);
      setLoaded(true);
    } catch (reason) {
      setError(storageErrorText(reason, t('historyLoadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setFilters(EMPTY_FILTERS);
    setItems([]);
    setTotal(0);
    setError('');
    setLoaded(false);
    void load(EMPTY_FILTERS, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    void load(filters, 0, false);
  };

  const uploaderName = (entry: PhotoHistoryEntry): string =>
    entry.uploadedByName || entry.uploadedBy || '-';

  const uploaderSub = (entry: PhotoHistoryEntry): string => {
    const name = entry.uploadedByName || entry.uploadedBy;
    if (entry.uploadedByEmpNo) return entry.uploadedByEmpNo;
    return entry.uploadedBy && entry.uploadedBy !== name ? entry.uploadedBy : '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="po-dialog po-dialog--wide po-dialog--history"
        showCloseButton={false}
      >
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('historyTitle')}</h2>
            <DialogClose asChild>
              <button
                type="button"
                className="po-dialog-x"
                aria-label={t('close')}
                onClick={() => onOpenChange(false)}
              >
                ×
              </button>
            </DialogClose>
          </div>
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('historyHint')}
        </DialogDescription>

        <div className="history-body">
          <form className="history-filters" onSubmit={handleSearch}>
            <input
              className="login-input"
              placeholder={t('historyStylePlaceholder')}
              value={filters.style}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, style: event.target.value }))
              }
              autoComplete="off"
            />
            <input
              className="login-input"
              placeholder={t('historyUploaderPlaceholder')}
              value={filters.uploader}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, uploader: event.target.value }))
              }
              autoComplete="off"
            />
            <input
              className="login-input history-date"
              type="date"
              aria-label={t('historyFrom')}
              title={t('historyFrom')}
              value={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, from: event.target.value }))
              }
            />
            <input
              className="login-input history-date"
              type="date"
              aria-label={t('historyTo')}
              title={t('historyTo')}
              value={filters.to}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, to: event.target.value }))
              }
            />
            <button
              type="submit"
              className="po-btn po-btn--primary history-search"
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="upload-spin" />
              ) : (
                <Search size={14} />
              )}
              {t('historySearch')}
            </button>
          </form>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          {loaded && total > 0 ? (
            <p className="history-total">{t('historyCount', { n: total })}</p>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="user-empty">{t('historyLoading')}</div>
          ) : !loading && loaded && items.length === 0 ? (
            <div className="user-empty">{t('historyEmpty')}</div>
          ) : items.length > 0 ? (
            <>
              <div className="history-list">
                <div className="history-row history-row--head">
                  <span>{t('historyTime')}</span>
                  <span>{t('historyStyle')}</span>
                  <span>{t('historyUploader')}</span>
                  <span>{t('historyFile')}</span>
                </div>
                {items.map((entry) => (
                  <div key={entry.id} className="history-row">
                    <span className="history-time">
                      {formatTime(entry.uploadedAt, locale)}
                    </span>
                    <span className="history-style-code">{entry.styleCode}</span>
                    <span className="history-user">
                      <span className="history-user-name">
                        {uploaderName(entry)}
                      </span>
                      {uploaderSub(entry) ? (
                        <span className="history-user-code">
                          {uploaderSub(entry)}
                        </span>
                      ) : null}
                    </span>
                    <span className="history-file" title={entry.fileName}>
                      {entry.fileName || '-'}
                    </span>
                  </div>
                ))}
              </div>
              {items.length < total ? (
                <div className="history-more">
                  <button
                    type="button"
                    className="po-btn"
                    disabled={loading}
                    onClick={() => void load(filters, items.length, true)}
                  >
                    {loading ? (
                      <Loader2 size={14} className="upload-spin" />
                    ) : null}
                    {t('historyLoadMore')}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoHistoryDialog;
