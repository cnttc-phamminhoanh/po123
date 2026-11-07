import type { EChartsOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';
import type { PoCostDetail } from '../types';
import type { TKey } from '../i18n';
import {
  LABOR_SERIES,
  MATERIAL_SERIES,
  bomAmount,
  laborOpCost,
} from './constants';
import type { SeriesMeta } from './constants';
import {
  CHART_AXIS,
  CHART_FONT,
  CHART_GRID,
  CHART_LINE,
  CHART_MUTED,
  CHART_TEXT,
} from './chart-theme';
import { money } from './utils/format';

type ValueOf<Key extends string> = (po: PoCostDetail, key: Key) => number;
type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const tooltipFormatter = (
  params: TopLevelFormatterParams,
  totalText: string,
): string => {
  const list = Array.isArray(params) ? params : [params];
  const total: number = list.reduce(
    (sum: number, item) => sum + Number(item.value ?? 0),
    0,
  );
  const title: string = list.length > 0 ? `${list[0].name}` : '';
  const rows: string = list
    .map(
      (item) =>
        '<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px">' +
        `<span style="width:8px;height:8px;background:${item.color};display:inline-block;border-radius:1px"></span>` +
        `<span style="flex:1">${item.seriesName}</span>` +
        `<span style="font-variant-numeric:tabular-nums">${money(Number(item.value ?? 0))}</span></div>`,
    )
    .join('');
  return (
    '<div style="padding:10px 12px;min-width:190px">' +
    `<div style="color:#8C8C8C;font-size:11px;margin-bottom:7px">${title}</div>` +
    rows +
    `<div style="border-top:1px solid ${CHART_LINE};margin-top:7px;padding-top:6px;display:flex;justify-content:space-between;font-size:12px">` +
    `<span>${totalText}</span><span style="font-variant-numeric:tabular-nums">${money(total)}</span></div></div>`
  );
};

const buildOption = <Key extends string>(
  pos: PoCostDetail[],
  series: SeriesMeta<Key>[],
  valueOf: ValueOf<Key>,
  t: Translate,
): EChartsOption => ({
  animationDuration: 420,
  textStyle: { fontFamily: CHART_FONT },
  grid: { left: 4, right: 28, top: 14, bottom: 56, containLabel: true },
  legend: {
    bottom: 0,
    left: 0,
    right: 0,
    type: 'scroll',
    icon: 'roundRect',
    itemWidth: 9,
    itemHeight: 9,
    itemGap: 18,
    textStyle: { fontFamily: CHART_FONT, fontSize: 11, color: CHART_MUTED },
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: '#FAFAFA' } },
    confine: true,
    backgroundColor: '#FFFFFF',
    borderColor: CHART_LINE,
    borderWidth: 1,
    padding: 0,
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: CHART_TEXT },
    formatter: (params: TopLevelFormatterParams) =>
      tooltipFormatter(params, t('total')),
  },
  xAxis: {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: CHART_GRID } },
    axisLabel: {
      fontFamily: CHART_FONT,
      fontSize: 11,
      color: CHART_AXIS,
      formatter: (value: number) => `$${value}`,
    },
  },
  yAxis: {
    type: 'category',
    boundaryGap: true,
    data: pos.map((po: PoCostDetail) => po.poNo),
    axisTick: { show: false },
    axisLine: { show: false },
    axisLabel: { fontFamily: CHART_FONT, fontSize: 12, color: CHART_TEXT },
  },
  series: series.map((meta) => ({
    name: t(meta.labelKey),
    type: 'bar' as const,
    stack: 'total',
    barWidth: 20,
    itemStyle: { color: meta.color },
    emphasis: { focus: 'series' as const },
    data: pos.map((po: PoCostDetail) => Number(valueOf(po, meta.key).toFixed(2))),
  })),
});

export const buildMaterialsOption = (
  pos: PoCostDetail[],
  t: Translate,
): EChartsOption =>
  buildOption<Parameters<typeof bomAmount>[1]>(
    pos,
    MATERIAL_SERIES,
    bomAmount,
    t,
  );

export const buildLaborsOption = (
  pos: PoCostDetail[],
  t: Translate,
): EChartsOption => buildOption(pos, LABOR_SERIES, laborOpCost, t);
