import type { StyleDetail } from '../../types';
import type { CostGroup } from '../constants';
import PoColumn from './PoColumn';
import MetaStrip from './MetaStrip';

interface SummaryViewProps {
  detail: StyleDetail;
  sizeGroup: string;
  openGroups: Record<CostGroup, boolean>;
  onToggleGroup: (group: CostGroup) => void;
  onToggleAllGroups: () => void;
  onPhotoAction?: () => void;
  loading?: boolean;
}

const SummaryView = ({
  detail,
  sizeGroup,
  openGroups,
  onToggleGroup,
  onToggleAllGroups,
  onPhotoAction,
  loading = false,
}: SummaryViewProps) => (
  <div className={loading ? 'summary-wrap is-loading' : 'summary-wrap'}>
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
);

export default SummaryView;
