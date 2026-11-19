import type {
  BomCategory,
  LaborOpCode,
  OtherCostCategory,
  PoCostDetail,
} from '../types';
import type { TKey } from '../i18n';

export interface PoPalette {
  base: string;
  strong: string;
  tint: string;
}

export const PO_PALETTES: PoPalette[] = [
  { base: '#FFB84C', strong: '#F5A02E', tint: '#FFF2DC' },
  { base: '#2EC4A8', strong: '#1FB491', tint: '#DBF9EF' },
  { base: '#56A8F5', strong: '#3A8FE8', tint: '#E2F2FE' },
  { base: '#FF8FAB', strong: '#FF6E8E', tint: '#FFE6EC' },
];

const PO_COLORS: Record<string, PoPalette> = {
  PO1: PO_PALETTES[0],
  PO2A: PO_PALETTES[1],
  PO2B: PO_PALETTES[2],
  PO3: PO_PALETTES[3],
};

/** Nhãn cố định cho tiêu đề cột PO, theo thứ tự cột. */
export const PO_HEADER_NAMES: string[] = ['PO1', 'PO2A', 'PO2B', 'PO3'];

export const poHeaderOf = (index: number, fallback: string): string =>
  PO_HEADER_NAMES[index] ?? fallback;

export const paletteOf = (poNo: string, index: number): PoPalette =>
  PO_COLORS[poNo] ?? PO_PALETTES[index % PO_PALETTES.length];

export const RAMP: string[] = [
  '#6E57DA',
  '#8D76E6',
  '#B2A0EF',
  '#CFC3F4',
  '#4F3AA6',
  '#A18ADF',
  '#7C65D9',
  '#3D2E80',
  '#C9A227',
];

export interface SeriesMeta<K extends string> {
  key: K;
  labelKey: TKey;
  color: string;
}

export const MATERIAL_SERIES: SeriesMeta<BomCategory>[] = [
  { key: 'fabric', labelKey: 'seriesFabric', color: RAMP[0] },
  { key: 'trim', labelKey: 'seriesTrim', color: RAMP[1] },
  { key: 'opa', labelKey: 'seriesOpa', color: RAMP[4] },
  { key: 'pack', labelKey: 'seriesPack', color: RAMP[2] },
];

export const LABOR_SERIES: SeriesMeta<LaborOpCode>[] = [
  { key: 'cut', labelKey: 'seriesCut', color: '#3F6699' },
  { key: 'pri', labelKey: 'seriesPri', color: '#4F8B73' },
  { key: 'emb', labelKey: 'seriesEmb', color: '#B07D45' },
  { key: 'sew', labelKey: 'seriesSew', color: '#A65F63' },
  { key: 'fin', labelKey: 'seriesFin', color: '#4C8B91' },
  { key: 'soc', labelKey: 'seriesSoc', color: '#7C6FA3' },
  { key: 'pack', labelKey: 'seriesPacking', color: '#7D8C55' },
  { key: 'etc', labelKey: 'seriesEtc', color: '#6F7377' },
  { key: 'burden', labelKey: 'seriesLaborLoading', color: '#8A6A2F' },
  { key: 'overhead', labelKey: 'seriesLaborOverhead', color: '#B5964A' },
];

export const OTHER_SERIES: SeriesMeta<OtherCostCategory>[] = [
  { key: 'overhead', labelKey: 'seriesOverhead', color: '#6E57DA' },
  { key: 'qc', labelKey: 'seriesQc', color: '#2E88FF' },
  { key: 'freight', labelKey: 'seriesFreight', color: '#E8A317' },
];

export type CostGroup = 'materials' | 'labors' | 'others';

export const GROUP_NAMES: Record<CostGroup, TKey> = {
  materials: 'groupMaterials',
  labors: 'groupLabors',
  others: 'groupOthers',
};

export const bomAmount = (po: PoCostDetail, category: BomCategory): number =>
  po.bom.find((line) => line.category === category)?.amount ?? 0;

export const otherAmount = (
  po: PoCostDetail,
  category: OtherCostCategory,
): number =>
  po.otherCosts.find((line) => line.category === category)?.amount ?? 0;

export const laborOpCost = (po: PoCostDetail, opCode: LaborOpCode): number =>
  po.laborOps.find((line) => line.opCode === opCode)?.cost ?? 0;

const BABY_DRESS_PHOTO = '/photos/baby-dress.jpg';
const FLEECE_HOODIE_PHOTO = '/photos/fleece-hoodie.jpg';
const TWO_PIECE_PHOTO = '/photos/baby-dress.jpg';

const STYLE_PHOTOS: Record<string, string> = {
  '1R303710': BABY_DRESS_PHOTO,
  '2S418205': FLEECE_HOODIE_PHOTO,
  '1K772901': TWO_PIECE_PHOTO,
};

export const photoOf = (styleCode: string): string =>
  STYLE_PHOTOS[styleCode] ?? '';
