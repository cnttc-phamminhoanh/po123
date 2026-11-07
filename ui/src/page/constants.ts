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

export const RAMP: string[] = ['#6E57DA', '#8D76E6', '#B2A0EF', '#CFC3F4'];

export interface SeriesMeta<K extends string> {
  key: K;
  labelKey: TKey;
  color: string;
}

export const MATERIAL_SERIES: SeriesMeta<BomCategory>[] = [
  { key: 'fabric', labelKey: 'seriesFabric', color: RAMP[0] },
  { key: 'trim', labelKey: 'seriesTrim', color: RAMP[1] },
  { key: 'wash', labelKey: 'seriesWash', color: RAMP[2] },
  { key: 'pack', labelKey: 'seriesPack', color: RAMP[3] },
];

export const LABOR_SERIES: SeriesMeta<LaborOpCode>[] = [
  { key: 'cut', labelKey: 'seriesCut', color: RAMP[0] },
  { key: 'sew', labelKey: 'seriesSew', color: RAMP[1] },
  { key: 'fin', labelKey: 'seriesFin', color: RAMP[2] },
  { key: 'pack', labelKey: 'seriesPacking', color: RAMP[3] },
];

export const OTHER_SERIES: SeriesMeta<OtherCostCategory>[] = [
  { key: 'overhead', labelKey: 'seriesOverhead', color: RAMP[0] },
  { key: 'qc', labelKey: 'seriesQc', color: RAMP[1] },
  { key: 'freight', labelKey: 'seriesFreight', color: RAMP[2] },
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
