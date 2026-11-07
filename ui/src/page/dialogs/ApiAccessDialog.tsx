import { API_BASE } from '../../lib/http';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';

interface ApiAccessDialogProps {
  styleCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENDPOINTS: { method: string; path: string; noteKey: TKey }[] = [
  { method: 'GET', path: '/bom/styles', noteKey: 'epListStyles' },
  {
    method: 'GET',
    path: '/bom/styles/{code}?season=',
    noteKey: 'epStyleSheet',
  },
  {
    method: 'PATCH',
    path: '/bom/styles/{code}/pos/{poNo}?season=',
    noteKey: 'epUpdatePo',
  },
  { method: 'POST', path: '/bom/styles/photos', noteKey: 'epBindPhotos' },
];

const ApiAccessDialog = ({
  styleCode,
  open,
  onOpenChange,
}: ApiAccessDialogProps) => {
  const t = useT();
  const baseUrl: string = `${window.location.origin}${API_BASE}/bom`;
  const sample: string =
    `curl -X GET "${baseUrl}/styles/${styleCode}" \\\n` +
    '  -H "x-api-key: <YOUR_API_KEY>"';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="po-dialog" showCloseButton={false}>
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('apiAccess')}</h2>
            <button
              type="button"
              className="po-dialog-x"
              aria-label={t('close')}
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </div>
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('ariaApiOpen')}
        </DialogDescription>
        <div className="po-dialog-body">
          <section className="spec-group">
            <h3>{t('baseUrl')}</h3>
            <code className="api-chip">{baseUrl}</code>
            <p className="api-note">
              {t('apiAuthNote', { code: 'x-api-key' })}
            </p>
          </section>
          <section className="spec-group">
            <h3>{t('endpoints')}</h3>
            <ul className="api-list">
              {ENDPOINTS.map((endpoint) => (
                <li key={`${endpoint.method}-${endpoint.path}`} className="api-row">
                  <span className="api-method">
                    {endpoint.method}
                  </span>
                  <code className="api-path">{endpoint.path}</code>
                  <span className="api-desc">{t(endpoint.noteKey)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="spec-group">
            <h3>{t('sampleRequest')}</h3>
            <pre className="api-code">{sample}</pre>
          </section>
        </div>
        <div className="po-form-foot">
          <span className="po-form-note">{t('apiKeysNote')}</span>
          <button
            type="button"
            className="po-btn po-btn--primary"
            onClick={() => onOpenChange(false)}
          >
            {t('close')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApiAccessDialog;
