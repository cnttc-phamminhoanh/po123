import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { ChevronDown, ChevronsDown } from 'lucide-react';
import type { BomCategory, PoCostDetail } from '../../types';
import {
  GROUP_NAMES,
  LABOR_SERIES,
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

const matCellValue = (po: PoCostDetail, category: BomCategory): number =>
  bomAmount(po, category);

const MAT_SUM_CELLS: {
  tag: string;
  category: BomCategory;
  labelKey: 'seriesFabric' | 'seriesTrim' | 'seriesOpa' | 'seriesPack';
}[] = [
  { tag: 'M1', category: 'fabric', labelKey: 'seriesFabric' },
  { tag: 'M2', category: 'trim', labelKey: 'seriesTrim' },
  { tag: 'M3', category: 'pack', labelKey: 'seriesPack' },
  { tag: 'OPA', category: 'opa', labelKey: 'seriesOpa' },
];

const detailMoney = (value: number): string => {
  const abs = Math.abs(value);
  return money(value, abs > 0 && abs < 0.01 ? 4 : 2);
};

const MatSumRow = ({ po, groupOpen }: { po: PoCostDetail; groupOpen: boolean }) => {
  const t = useT();
  const [openCategory, setOpenCategory] = useState<BomCategory | null>('fabric');

  useEffect(() => {
    if (groupOpen) setOpenCategory('fabric');
  }, [groupOpen]);
  const activeCell = MAT_SUM_CELLS.find((cell) => cell.category === openCategory) ?? null;
  const details = openCategory
    ? po.materialDetails.filter((line) => line.category === openCategory)
    : [];

  return (
    <>
      <div className="mat-sum">
        {MAT_SUM_CELLS.map((cell) => {
          const isOpen = openCategory === cell.category;
          return (
            <button
              type="button"
              className={`mat-sum-cell${isOpen ? ' mat-sum-cell--open' : ''}`}
              key={cell.tag}
              aria-expanded={isOpen}
              title={`${t('materialDetailTitle', {
                tag: cell.tag,
                category: t(cell.labelKey),
              })}`}
              onClick={() => setOpenCategory(isOpen ? null : cell.category)}
            >
              <span className="mat-sum-tag">{cell.tag}</span>
              <span className="mat-sum-value">{money(matCellValue(po, cell.category))}</span>
              <ChevronDown size={11} className="mat-sum-caret" />
            </button>
          );
        })}
      </div>

      {activeCell ? (
        <div className="mat-detail">
          <div className="mat-detail-head">
            <span>
              {t('materialDetailTitle', {
                tag: activeCell.tag,
                category: t(activeCell.labelKey),
              })}
            </span>
            <button
              type="button"
              className="mat-detail-close"
              aria-label={t('close')}
              onClick={() => setOpenCategory(null)}
            >
              ×
            </button>
          </div>

          {details.length > 0 ? (
            <>
              <div className="mat-detail-row mat-detail-row--head">
                <span>{t('materialCode')}</span>
                <span>{t('materialName')}</span>
                <span>{t('materialAmount')}</span>
              </div>
              <div className="mat-detail-list">
                {details.map((line, lineIndex) => (
                  <div className="mat-detail-row" key={`${line.category}-${line.code}-${lineIndex}`}>
                    <span className="mat-detail-code" title={line.code || '—'}>
                      {line.code || '—'}
                    </span>
                    <span className="mat-detail-name" title={line.name || '—'}>
                      {line.name || '—'}
                    </span>
                    <span className="mat-detail-amount">{detailMoney(line.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mat-detail-empty">{t('materialDetailEmpty')}</p>
          )}
        </div>
      ) : null}

    </>
  );
};

const PRICE_BASIS_TITLES = [
  'PO1 FOB unit price',
  'PO1 FOB unit price',
  'PO1 FOB unit price',
  'PO3 Avg SO unit price',
];

const TOTAL_COST_TITLES = ['PO1', 'PO2A', 'PO2B', 'PO3'];

const COST_MIX_COLORS = {
  materials: '#6E57DA',
  labors: '#2E88FF',
  others: '#9AA3AD',
};

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

  const laborItems: MiniChartItem[] = LABOR_SERIES
    .filter(
      (series) =>
        series.key !== 'overhead' ||
        index === 3 ||
        laborOpCost(po, 'overhead') > 0,
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

  const costShare = (value: number): number =>
    po.unitCost > 0 ? (value / po.unitCost) * 100 : 0;
  const materialShare = costShare(po.materialTotal);
  const laborShare = costShare(po.laborCost);
  const otherShare = costShare(po.otherTotal);
  const barWidth = (share: number): string =>
    `${Math.max(0, Math.min(100, share))}%`;

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
          <MatSumRow po={po} groupOpen={openGroups.materials} />
        </GroupBlock>

        <GroupBlock
          group="labors"
          label={t('bandTotalLabors')}
          bandValue={po.laborCost}
          open={openGroups.labors}
          lead={index === 0}
          onToggle={() => onToggleGroup('labors')}
        >
          <MiniChart items={laborItems} />
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
          <MiniChart items={otherItems} />
        </GroupBlock>
      </div>

      <div className="cost-mix">
        <div className="cost-mix-title">{t('costMixTitle')}</div>
        <div className="cost-mix-bar" aria-hidden="true">
          {materialShare > 0 ? (
            <i
              style={{
                width: barWidth(materialShare),
                background: COST_MIX_COLORS.materials,
              }}
            />
          ) : null}
          {laborShare > 0 ? (
            <i
              style={{
                width: barWidth(laborShare),
                background: COST_MIX_COLORS.labors,
              }}
            />
          ) : null}
          {otherShare > 0 ? (
            <i
              style={{
                width: barWidth(otherShare),
                background: COST_MIX_COLORS.others,
              }}
            />
          ) : null}
        </div>
        <div className="cost-mix-items">
          <div className="cost-mix-item">
            <span className="cost-mix-name">
              <i className="cost-mix-dot" style={{ background: COST_MIX_COLORS.materials }} />
              {t('costMixMaterials')}
            </span>
            <strong className="cost-mix-pct">{pct1(materialShare)}</strong>
          </div>
          <div className="cost-mix-item">
            <span className="cost-mix-name">
              <i className="cost-mix-dot" style={{ background: COST_MIX_COLORS.labors }} />
              {t('costMixLabors')}
            </span>
            <strong className="cost-mix-pct">{pct1(laborShare)}</strong>
          </div>
          <div className="cost-mix-item">
            <span className="cost-mix-name">
              <i className="cost-mix-dot" style={{ background: COST_MIX_COLORS.others }} />
              {t('costMixOthers')}
            </span>
            <strong className="cost-mix-pct">{pct1(otherShare)}</strong>
          </div>
        </div>
      </div>
    </article>
  );
};

export default PoColumn;
