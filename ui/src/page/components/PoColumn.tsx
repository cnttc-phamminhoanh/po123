import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { ChevronDown, ChevronsDown } from 'lucide-react';
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
import { money, pct1 } from '../utils/format';

interface PoColumnProps {
  po: PoCostDetail;
  index: number;
  openGroups: Record<CostGroup, boolean>;
  onToggleGroup: (group: CostGroup) => void;
  onToggleAllGroups: () => void;
}

interface GroupBlockProps {
  group: CostGroup;
  label: string;
  bandValue: number;
  open: boolean;
  lead: boolean;
  onToggle: () => void;
  children: ReactNode;
  railRef?: Ref<HTMLButtonElement>;
  master?: ReactNode;
}

const GroupBlock = ({
  group,
  label,
  bandValue,
  open,
  lead,
  onToggle,
  children,
  railRef,
  master,
}: GroupBlockProps) => {
  const t = useT();
  return (
    <>
      <div className="band">
        {lead ? (
          <button
            ref={railRef}
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
        {master}
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
  return bomAmount(po, 'trim');
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

const PRICE_BASIS_TITLES = [
  'PO1 FOB unit price',
  'PO1 FOB unit price',
  'PO1 FOB unit price',
  'PO3 Avg SO unit price',
];

const TOTAL_COST_TITLES = ['PO1', 'PO2A', 'PO2B', 'PO3'];

const PoColumn = ({
  po,
  index,
  openGroups,
  onToggleGroup,
  onToggleAllGroups,
}: PoColumnProps) => {
  const t = useT();
  const palette: PoPalette = paletteOf(po.poNo, index);
  const groupsRef = useRef<HTMLDivElement>(null);
  const masterRef = useRef<HTMLButtonElement>(null);
  const lastRailRef = useRef<HTMLButtonElement>(null);
  const [railLine, setRailLine] = useState({ top: 0, height: 0 });
  const allGroupsOpen =
    openGroups.materials && openGroups.labors && openGroups.others;

  useLayoutEffect(() => {
    if (index !== 0) return;

    const measure = () => {
      const groups = groupsRef.current;
      const master = masterRef.current;
      const last = lastRailRef.current;
      if (!groups || !master || !last) return;

      const groupsRect = groups.getBoundingClientRect();
      const masterRect = master.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const top = masterRect.top - groupsRect.top + masterRect.height / 2;
      const height =
        lastRect.top - masterRect.top + (lastRect.height - masterRect.height) / 2;

      setRailLine((prev) =>
        Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { top, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (groupsRef.current) observer.observe(groupsRef.current);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [index, openGroups]);

  const materialItems: MiniChartItem[] = MATERIAL_SERIES.map((series) => ({
    label: t(series.labelKey),
    value: bomAmount(po, series.key),
    color: series.color,
  }));

  const laborItems: MiniChartItem[] = LABOR_SERIES
    .filter(
      (series) =>
        series.key !== 'overhead' || laborOpCost(po, 'overhead') > 0,
    )
    .map((series) => ({
      label: t(series.labelKey),
      value: laborOpCost(po, series.key),
      color: series.color,
      digits: series.key === 'etc' ? 4 : 2,
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

  const masterButton =
    index === 0 ? (
      <button
        ref={masterRef}
        type="button"
        className="rail-btn rail-master"
        aria-expanded={allGroupsOpen}
        aria-label={
          allGroupsOpen ? t('collapseAllDetails') : t('expandAllDetails')
        }
        title={allGroupsOpen ? t('collapseAllDetails') : t('expandAllDetails')}
        onClick={onToggleAllGroups}
      >
        <ChevronsDown size={13} />
      </button>
    ) : null;

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
          <span>{PRICE_BASIS_TITLES[index] ?? `${po.poNo} ${po.priceLabel}`}</span>
          <strong>{money(po.price)}</strong>
        </div>
        <div className="price-cell price-cell--alt">
          <span>{t('totalCost', { poNo: TOTAL_COST_TITLES[index] ?? po.poNo })}</span>
          <strong>{money(po.unitCost)}</strong>
        </div>
      </div>

      <div className="po-groups" ref={groupsRef}>
        {index === 0 ? (
          <div
            className="rail-line"
            aria-hidden="true"
            style={{ top: railLine.top, height: railLine.height }}
          />
        ) : null}

        <GroupBlock
          group="materials"
          label={t('bandTotalMaterials')}
          bandValue={po.materialTotal}
          open={openGroups.materials}
          lead={index === 0}
          onToggle={() => onToggleGroup('materials')}
          master={masterButton}
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
          railRef={lastRailRef}
        >
          <MiniChart
            items={otherItems}
            footLeft={t('perUnitUsd')}
            footRight={t('ofCost', {
              pct: pct1(po.unitCost > 0 ? (po.otherTotal / po.unitCost) * 100 : 0),
            })}
          />
        </GroupBlock>
      </div>
    </article>
  );
};

export default PoColumn;
