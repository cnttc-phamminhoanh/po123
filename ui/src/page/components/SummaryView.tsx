import type { StyleDetail } from '../../types';
import type { CostGroup } from '../constants';
import PoColumn from './PoColumn';
import MetaStrip from './MetaStrip';
import CatAstronautLoader from './CatAstronautLoader';

interface SummaryViewProps {
  detail: StyleDetail;
  sizeGroup: string;
  openGroups: Record<CostGroup, boolean>;
  onToggleGroup: (group: CostGroup) => void;
  onToggleAllGroups: () => void;
  onPhotoAction?: () => void;
  loading?: boolean;
  loadingLabel?: string;
}

const SummaryView = ({
  detail,
  sizeGroup,
  openGroups,
  onToggleGroup,
  onToggleAllGroups,
  onPhotoAction,
  loading = false,
  loadingLabel = 'Loading…',
}: SummaryViewProps) => (
  <div
    className={loading ? 'summary-wrap is-loading' : 'summary-wrap'}
    aria-busy={loading}
  >
    <div
      className="summary-content"
      aria-hidden={loading ? 'true' : undefined}
    >
      <MetaStrip
        detail={detail}
        sizeGroup={sizeGroup}
        onPhotoAction={onPhotoAction}
      />
      <div className="po-grid">
        {detail.pos.map((po, index) => (
          <PoColumn
            key={po.poNo}
            po={po}
            index={index}
            openGroups={openGroups}
            onToggleGroup={onToggleGroup}
            onToggleAllGroups={onToggleAllGroups}
          />
        ))}
      </div>
    </div>

    {loading ? (
      <div className="summary-loading-overlay">
        <CatAstronautLoader label={loadingLabel} variant="overlay" />
      </div>
    ) : null}
  </div>
);

export default SummaryView;
