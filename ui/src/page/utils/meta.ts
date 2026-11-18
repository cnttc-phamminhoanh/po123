import type { StyleDetail } from '../../types';
import type { TKey } from '../../i18n';
import { num } from './format';

export interface MetaPair {
  label: string;
  value: string;
}

export interface MetaFields {
  id: MetaPair[];
  order: MetaPair[];
  sample: MetaPair[];
  packing: MetaPair[];
}

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

export const buildMetaFields = (
  detail: StyleDetail,
  sizeGroup = '',
  t: Translate,
): MetaFields => {
  const first = detail.pos[0];
  const sizeQty: number = detail.pos.reduce(
    (sum: number, po) =>
      sum +
      (po.sizeGroups.find((line) => line.sizeGroup === sizeGroup)?.qty ?? 0),
    0,
  );
  const sizeShipQty: number = detail.pos.reduce(
    (sum: number, po) =>
      sum +
      (po.sizeGroups.find((line) => line.sizeGroup === sizeGroup)?.shippedQty ??
        0),
    0,
  );
  const units: number = sizeGroup ? sizeQty : detail.units;
  const shipUnits: number = sizeGroup ? sizeShipQty : detail.shipUnits;
  return {
    id: [
      { label: t('customer'), value: detail.buyer },
      { label: t('styleNo'), value: detail.code },
      { label: t('quoteSeason'), value: detail.season },
      ...(detail.soSeason && detail.seasonMismatch
        ? [{ label: t('soSeason'), value: detail.soSeason }]
        : []),
    ],
    order: [
      { label: t('po1No'), value: first?.poNo || '—' },
      { label: t('po1Date'), value: detail.poDate },
      { label: t('versionNo'), value: detail.version },
      { label: t('terms'), value: detail.terms },
      { label: t('factory'), value: first?.factory ?? '—' },
      { label: t('remarks'), value: detail.remarks },
    ],
    sample: [
      { label: t('sampleNo'), value: detail.sampleNo },
      { label: t('sampleName'), value: detail.sampleName },
      { label: t('sampleType'), value: detail.sampleType },
      { label: t('brand'), value: detail.brand },
      { label: t('moq'), value: detail.moq },
      { label: t('firstCrd'), value: detail.firstCrd },
      { label: t('lastCrd'), value: detail.lastCrd },
    ],
    packing: [
      { label: t('packingSpec'), value: detail.packingSpec },
      { label: t('m3'), value: detail.m3 },
      { label: t('pcsPerCarton'), value: detail.pcsPerCarton },
      { label: t('vndUsd'), value: detail.fxVnd },
      { label: t('rmbUsd'), value: detail.fxRmb },
      { label: t('hkdUsd'), value: detail.fxHkd },
      {
        label: t('totalSoQty'),
        value: `${num(units)} ${t('pcs')}`,
      },
      {
        label: t('totalShipQty'),
        value: `${num(shipUnits)} ${t('pcs')}`,
      },
    ],
  };
};
