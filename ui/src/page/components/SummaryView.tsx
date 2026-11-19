import { useEffect, useState } from 'react';
import type { BomCategory, StyleDetail } from '../../types';
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
}: SummaryViewProps) => {
  // M1/M2/M3/OPA dùng chung một lựa chọn cho cả 4 cột PO.
  const [activeMaterial, setActiveMaterial] = useState<BomCategory | null>('fabric');

  // Khi mở lại nhóm vật tư thì quay về M1, giống hành vi cũ.
  useEffect(() => {
    if (openGroups.materials) setActiveMaterial('fabric');
  }, [openGroups.materials]);

  return (
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
              // Giữ cố định theo vị trí cột (PO1, PO2A, PO2B, PO3).
              // Nếu dùng poNo làm key, khi Size group đổi mã PO1 thì card sẽ
              // bị coi là mới và chạy lại hiệu ứng hiện dần.
              key={index}
              po={po}
              index={index}
              openGroups={openGroups}
              onToggleGroup={onToggleGroup}
              onToggleAllGroups={onToggleAllGroups}
              activeMaterial={activeMaterial}
              onSelectMaterial={setActiveMaterial}
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
};

export default SummaryView;
