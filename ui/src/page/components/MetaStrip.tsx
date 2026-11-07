import { Camera, ImageUp } from 'lucide-react';
import type { StyleDetail } from '../../types';
import { Image } from '../../ui/image';
import { photoOf } from '../constants';
import { useT } from '../../i18n';
import { buildMetaFields } from '../utils/meta';
import type { MetaFields, MetaPair } from '../utils/meta';

interface MetaStripProps {
  detail: StyleDetail;
  sizeGroup: string;
  onPhotoAction?: () => void;
}

const PairList = ({ pairs }: { pairs: MetaPair[] }) => (
  <div className="kv-list">
    {pairs.map((pair: MetaPair) => (
      <div className="kv" key={pair.label}>
        <span className="kv-label">{pair.label}</span>
        <span className="kv-value">{pair.value}</span>
      </div>
    ))}
  </div>
);

const MetaStrip = ({ detail, sizeGroup, onPhotoAction }: MetaStripProps) => {
  const t = useT();
  const fields: MetaFields = buildMetaFields(detail, sizeGroup, t);
  const photo: string = detail.photoUrl || photoOf(detail.code);

  return (
    <section className="meta-grid" aria-label={t('styleInfo')}>
      <div className="meta-card meta-card--id">
        <PairList pairs={fields.id} />
      </div>

      <div className="meta-card meta-card--photo">
        {photo ? (
          <Image src={photo} alt={t('samplePhotoAlt', { code: detail.code })} />
        ) : (
          <div className="photo-empty">
            <span className="photo-empty-icon" aria-hidden="true">
              <Camera size={18} />
            </span>
            <span className="photo-empty-title">{t('photoEmptyTitle')}</span>
            <span className="photo-empty-hint">{t('photoEmptyHint')}</span>
          </div>
        )}
        {onPhotoAction ? (
          <button
            type="button"
            className="photo-action"
            onClick={onPhotoAction}
            title={photo ? t('changePhoto') : t('uploadPhoto')}
            aria-label={photo ? t('changePhoto') : t('uploadPhoto')}
          >
            <ImageUp size={14} />
          </button>
        ) : null}
      </div>

      <div className="meta-card">
        <PairList pairs={fields.order} />
      </div>

      <div className="meta-card meta-card--wide">
        <div className="meta-cols">
          <PairList pairs={fields.sample} />
          <PairList pairs={fields.packing} />
        </div>
      </div>
    </section>
  );
};

export default MetaStrip;
