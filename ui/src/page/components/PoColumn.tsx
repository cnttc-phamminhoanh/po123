import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BomCategory, PoCostDetail } from '../../types';
import {
  GROUP_NAMES,
  LABOR_SERIES,
  MATERIAL_SERIES,
  OTHER_SERIES,
  bomAmount,
  laborOpCost,
  otherAmount,
  paletteOf,
  poHeaderOf,
} from '../constants';
import type { CostGroup, PoPalette } from '../constants';
import GpIcon from './GpIcon';
import MiniChart from './MiniChart';
import type { MiniChartItem } from './MiniChart';
import { useT } from '../../i18n';
import { money, pct1, round2 } from '../utils/format';

interface PoColumnProps {
  po: PoCostDetail;
  index: number;
  openGroups: Record<CostGroup, boolean>;
  onToggleGroup: (group: CostGroup) => void;
}

interface GroupBlockProps {
  group: CostGroup;
  label: string;
  bandValue: number;
  open: boolean;
  lead: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const GroupBlock = ({
  group,
  label,
  bandValue,
  open,
  lead,
  onToggle,
  children,
}: GroupBlockProps) => {
  const t = useT();
  return (
    <>
      <div className="band">
        {lead ? (
          <button
            type="button"
            className="rail-btn"
            aria-expanded={open}
            aria-label={`${open ? t('hide') : t('show')} ${t(GROUP_NAMES[group])}`}
            title={`${open ? t('hide') : t('show')} ${t(GROUP_NAMES[group])}`}
            onClick={onToggle}
          >
            <ChevronDown size={12} />
          </button>
        ) : null}
        <span className="band-label">{label}</span>
        <span className="band-value">{money(bandValue)}</span>
      </div>
      <div className="po-chart" data-group={group} hidden={!open}>
        {children}
      </div>
    </>
  );
};

const matCellValue = (po: PoCostDetail, category: BomCategory): number => {
  if (category === 'fabric') return bomAmount(po, 'fabric');
  if (category === 'pack') return bomAmount(po, 'pack');
  return round2(bomAmount(po, 'trim') + bomAmount(po, 'wash'));
};

const MatSumRow = ({ po }: { po: PoCostDetail }) => {
  const cells: { tag: string; value: number }[] = [
    { tag: 'M1', value: matCellValue(po, 'fabric') },
    { tag: 'M2', value: matCellValue(po, 'trim') },
    { tag: 'M3', value: matCellValue(po, 'pack') },
  ];
  return (
    <div className="mat-sum">
      {cells.map((cell) => (
        <div className="mat-sum-cell" key={cell.tag}>
          <span className="mat-sum-tag">{cell.tag}</span>
          <span className="mat-sum-value">{money(cell.value)}</span>
        </div>
      ))}
    </div>
  );
};

const PRICE_BASIS_OWNER = 'PO1';

const priceTitle = (po: PoCostDetail): string => {
  const owner: string = /fob/i.test(po.priceLabel) ? PRICE_BASIS_OWNER : po.poNo;
  return `${owner} ${po.priceLabel}`;
};

const PoColumn = ({ po, index, openGroups, onToggleGroup }: PoColumnProps) => {
  const t = useT();
  const palette: PoPalette = paletteOf(po.poNo, index);

  const materialItems: MiniChartItem[] = MATERIAL_SERIES.map((series) => ({
    label: t(series.labelKey),
    value: bomAmount(po, series.key),
    color: series.color,
  }));

  const laborItems: MiniChartItem[] = LABOR_SERIES.map((series) => ({
    label: t(series.labelKey),
    value: laborOpCost(po, series.key),
    color: series.color,
  }));

  const otherItems: MiniChartItem[] = OTHER_SERIES.map((series) => ({
    label: t(series.labelKey),
    value: otherAmount(po, series.key),
    color: series.color,
  }));

  const vars = {
    '--c': palette.base,
    '--cs': palette.strong,
    '--ct': palette.tint,
  } as CSSProperties;

  return (
    <article className="po" style={vars}>
      <div className="po-title">
        <span>{poHeaderOf(index, po.poNo)}</span>
      </div>

      <div className="po-gp">
        <div className="gp-tile gp-tile--light">
          <div className="gp-head">
            <GpIcon bg={palette.base} fg="#FFFFFF" />
            <span>{t('gp')}</span>
          </div>
          <div className="gp-value">{money(po.gp)}</div>
        </div>
        <div className="gp-tile gp-tile--strong">
          <div className="gp-head">
            <GpIcon bg="#FFFFFF" fg={palette.strong} />
            <span>{t('gpPct')}</span>
          </div>
          <div className="gp-value">{pct1(po.gpPct)}</div>
        </div>
      </div>

      <div className="po-prices">
        <div className="price-cell">
          <span>{priceTitle(po)}</span>
          <strong>{money(po.price)}</strong>
        </div>
        <div className="price-cell price-cell--alt">
          <span>{t('totalCost', { poNo: po.poNo })}</span>
          <strong>{money(po.unitCost)}</strong>
        </div>
      </div>

      <GroupBlock
        group="materials"
        label={t('bandTotalMaterials')}
        bandValue={po.materialTotal}
        open={openGroups.materials}
        lead={index === 0}
        onToggle={() => onToggleGroup('materials')}
      >
        <MiniChart
          items={materialItems}
          footLeft={t('perUnitUsd')}
          footRight={t('ofCost', {
            pct: pct1(po.unitCost > 0 ? (po.materialTotal / po.unitCost) * 100 : 0),
          })}
          lead={<MatSumRow po={po} />}
        />
      </GroupBlock>

      <GroupBlock
        group="labors"
        label={t('bandTotalLabors')}
        bandValue={po.laborCost}
        open={openGroups.labors}
        lead={index === 0}
        onToggle={() => onToggleGroup('labors')}
      >
        <MiniChart
          items={laborItems}
          footLeft={t('perUnitUsd')}
          footRight={t('ofCost', {
            pct: pct1(po.unitCost > 0 ? (po.laborCost / po.unitCost) * 100 : 0),
          })}
        />
      </GroupBlock>

      <GroupBlock
        group="others"
        label={t('bandOtherExpenses')}
        bandValue={po.otherTotal}
        open={openGroups.others}
        lead={index === 0}
        onToggle={() => onToggleGroup('others')}
      >
        <MiniChart
          items={otherItems}
          footLeft={t('perUnitUsd')}
          footRight={t('ofCost', {
            pct: pct1(po.unitCost > 0 ? (po.otherTotal / po.unitCost) * 100 : 0),
          })}
        />
      </GroupBlock>
    </article>
  );
};

export default PoColumn;
