import type { StyleDetail } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';
import { buildMetaFields } from '../utils/meta';
import type { MetaPair } from '../utils/meta';

interface StyleDetailsDialogProps {
  detail: StyleDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUPS: { key: 'id' | 'order' | 'sample' | 'packing'; titleKey: TKey }[] = [
  { key: 'id', titleKey: 'styleGroup' },
  { key: 'order', titleKey: 'orderGroup' },
  { key: 'sample', titleKey: 'sampleGroup' },
  { key: 'packing', titleKey: 'packingGroup' },
];

const StyleDetailsDialog = ({
  detail,
  open,
  onOpenChange,
}: StyleDetailsDialogProps) => {
  const t = useT();
  const fields = buildMetaFields(detail, '', t);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="po-dialog po-dialog--wide" showCloseButton={false}>
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('styleDetails')}</h2>
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
          {t('fullStyleSheet', { code: detail.code })}
        </DialogDescription>
        <div className="po-dialog-body">
          {GROUPS.map((group) => (
            <section key={group.key} className="spec-group">
              <h3>{t(group.titleKey)}</h3>
              <div className="spec-kv">
                {fields[group.key].map((pair: MetaPair) => (
                  <div key={pair.label} className="spec-row">
                    <span>{pair.label}</span>
                    <strong>{pair.value || '—'}</strong>
                  </div>
                ))}
                {group.key === 'id' ? (
                  <div className="spec-row">
                    <span>{t('fabricField')}</span>
                    <strong>{detail.fabric || '—'}</strong>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
        <div className="po-form-foot">
          <span className="po-form-note">{t('sourceNote')}</span>
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

export default StyleDetailsDialog;
