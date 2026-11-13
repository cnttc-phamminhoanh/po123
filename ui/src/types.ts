/* 前后端共享的类型写在这里 */

export const BOM_CATEGORIES = ['fabric', 'trim', 'pack'] as const;
export type BomCategory = (typeof BOM_CATEGORIES)[number];
export const isBomCategory = (v: string): v is BomCategory =>
  (BOM_CATEGORIES as readonly string[]).includes(v);
export const BOM_CATEGORY_LABELS: Record<BomCategory, string> = {
  fabric: 'Fabric',
  trim: 'Trims',
  pack: 'Packaging materials',
};
export const BOM_CATEGORY_DEFAULT_ITEMS: Record<BomCategory, string> = {
  fabric: 'Fabric',
  trim: 'Trims',
  pack: 'Packaging materials',
};

export const LABOR_OP_CODES = ['cut', 'sew', 'fin', 'pack'] as const;
export type LaborOpCode = (typeof LABOR_OP_CODES)[number];
export const isLaborOpCode = (v: string): v is LaborOpCode =>
  (LABOR_OP_CODES as readonly string[]).includes(v);
export const LABOR_OP_LABELS: Record<LaborOpCode, string> = {
  cut: 'Cutting',
  sew: 'Sewing',
  fin: 'Finishing',
  pack: 'Packing',
};

export const OTHER_COST_CATEGORIES = ['overhead', 'qc', 'freight'] as const;
export type OtherCostCategory = (typeof OTHER_COST_CATEGORIES)[number];
export const isOtherCostCategory = (v: string): v is OtherCostCategory =>
  (OTHER_COST_CATEGORIES as readonly string[]).includes(v);
export const OTHER_COST_LABELS: Record<OtherCostCategory, string> = {
  overhead: 'Overhead',
  qc: 'QC',
  freight: 'Freight',
};

/** BOM 明细行（单件金额，USD） */
export interface BomLine {
  category: BomCategory;
  itemName: string;
  amount: number;
}

/** 工序行：minutes 为工序分钟数，cost = minutes × 工时费率 */
export interface LaborOpLine {
  opCode: LaborOpCode;
  opName: string;
  minutes: number;
  cost: number;
}

/** 其他费用行 */
export interface OtherCostLine {
  category: OtherCostCategory;
  label: string;
  amount: number;
}

/** 尺码组数量行：同一 PO 内 qty 合计等于该 PO 的 qty */
export interface PoSizeGroupLine {
  sizeGroup: string;
  qty: number;
  shippedQty: number;
}

/** 样式下的一个 season：PO 日期（用于默认 season）与自己的尺码组 */
export interface StyleSeasonInfo {
  season: string;
  poDate: string;
  sizeGroups: string[];
}

const sizeGroupRank = (group: string): number => {
  const match: RegExpMatchArray | null = group.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

/** 尺码组排序：数字后缀升序（COMMON-999 这类占位组排最后），同值再按名称 */
export const compareSizeGroup = (a: string, b: string): number => {
  const diff: number = sizeGroupRank(a) - sizeGroupRank(b);
  return diff !== 0 ? diff : a.localeCompare(b);
};

export const sortSizeGroups = (groups: string[]): string[] =>
  [...groups].sort(compareSizeGroup);

/** 单条 PO 的成本结构 + 服务端派生结果 */
export interface PoCostDetail {
  poNo: string;
  factory: string;
  qty: number;
  shippedQty: number;
  priceLabel: string;
  price: number;
  sam: number;
  efficiency: number;
  laborRate: number;
  laborCost: number;
  bom: BomLine[];
  materialTotal: number;
  laborOps: LaborOpLine[];
  otherCosts: OtherCostLine[];
  otherTotal: number;
  unitCost: number;
  gp: number;
  gpPct: number;
  orderValue: number;
  costValue: number;
  gpValue: number;
  sizeGroups: PoSizeGroupLine[];
}

/** 样式列表项（含汇总派生值） */
export interface StyleSummary {
  code: string;
  name: string;
  buyer: string;
  seasons: StyleSeasonInfo[];
  latestSeason: string;
  sizeGroups: string[];
  wip: boolean;
  units: number;
  orderValue: number;
  costValue: number;
  gpValue: number;
  gpPct: number;
  updatedAt: string;
}

export interface StyleListResponse {
  styles: StyleSummary[];
}

/** 样式详情：主档 + 全部 PO 成本 */
export interface LatestStyle {
  code: string;
  season: string;
}

export interface StyleDetail {
  code: string;
  name: string;
  buyer: string;
  season: string;
  seasons?: string[];
  latestSeason?: string;
  fabric: string;
  poDate: string;
  version: string;
  terms: string;
  remarks: string;
  sampleNo: string;
  sampleName: string;
  brand: string;
  sampleType: string;
  moq: string;
  firstCrd: string;
  lastCrd: string;
  packingSpec: string;
  m3: string;
  pcsPerCarton: string;
  fxVnd: string;
  fxRmb: string;
  fxHkd: string;
  photoUrl: string;
  units: number;
  shipUnits: number;
  wip: boolean;
  orderValue: number;
  costValue: number;
  gpValue: number;
  gpPct: number;
  avgPrice: number;
  avgCost: number;
  avgGp: number;
  avgSam: number;
  avgEfficiency: number;
  avgLaborCost: number;
  /** 样式下出现的全部尺码组，按数字后缀升序 */
  sizeGroups: string[];
  pos: PoCostDetail[];
}

export interface BomLineInput {
  category: BomCategory;
  itemName?: string;
  amount: number;
}

export interface LaborOpInput {
  opCode: LaborOpCode;
  opName?: string;
  minutes: number;
}

export interface OtherCostInput {
  category: OtherCostCategory;
  label?: string;
  amount: number;
}

/** 部分更新 PO：只写请求中出现的字段；只改 sam / laborRate 时人工成本按 sam × laborRate 重算 */
export interface UpdatePoCostRequest {
  factory?: string;
  qty?: number;
  shippedQty?: number;
  priceLabel?: string;
  price?: number;
  sam?: number;
  efficiency?: number;
  laborRate?: number;
  laborCost?: number;
  bom?: BomLineInput[];
  laborOps?: LaborOpInput[];
  otherCosts?: OtherCostInput[];
}

export interface CreateStyleRequest {
  code: string;
  name?: string;
  buyer?: string;
  season?: string;
  fabric?: string;
  poDate?: string;
  version?: string;
  terms?: string;
  sampleType?: string;
  moq?: string;
  firstCrd?: string;
  lastCrd?: string;
  packingSpec?: string;
  m3?: string;
  pcsPerCarton?: string;
  fxVnd?: string;
  fxRmb?: string;
  fxHkd?: string;
  photoUrl?: string;
}

export interface CreatePoRequest {
  poNo: string;
  factory?: string;
  qty: number;
  shippedQty?: number;
  priceLabel?: string;
  price: number;
  sam?: number;
  efficiency?: number;
  laborRate?: number;
  laborCost?: number;
  bom?: BomLineInput[];
  laborOps?: LaborOpInput[];
  otherCosts?: OtherCostInput[];
}

