import { Camera, ImageUp } from 'lucide-react';
import { useState } from 'react';
import type { MouseEvent } from 'react';
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

interface PhotoLens {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

const LENS_SIZE = 132;
const LENS_ZOOM = 2.4;

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
  const [lens, setLens] = useState<PhotoLens>({
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const moveLens = (event: MouseEvent<HTMLDivElement>) => {
    if (!photo) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setLens({ visible: true, x, y, width: rect.width, height: rect.height });
  };

  return (
    <section className="meta-grid" aria-label={t('styleInfo')}>
      <div className="meta-card meta-card--id">
        <PairList pairs={fields.id} />
      </div>

      <div
        className={`meta-card meta-card--photo${photo ? ' meta-card--photo--zoom' : ''}`}
        onMouseEnter={moveLens}
        onMouseMove={moveLens}
        onMouseLeave={() => setLens((current) => ({ ...current, visible: false }))}
      >
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
        {photo && lens.visible ? (
          <span
            className="photo-lens"
            aria-hidden="true"
            style={{
              left: lens.x - LENS_SIZE / 2,
              top: lens.y - LENS_SIZE / 2,
            }}
          >
            <img
              className="photo-lens-image"
              src={photo}
              alt=""
              style={{
                width: lens.width,
                height: lens.height,
                left: LENS_SIZE / 2 - lens.x * LENS_ZOOM,
                top: LENS_SIZE / 2 - lens.y * LENS_ZOOM,
                transform: `scale(${LENS_ZOOM})`,
              }}
            />
          </span>
        ) : null}
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
