import { query } from './db.mjs';
import {
  SQL_LATEST_STYLE,
  SQL_PO1_COST,
  SQL_STYLE_CONTEXT,
  SQL_STYLE_EXISTS,
  SQL_STYLE_LIST,
  SQL_STYLE_QTY,
} from './sql.mjs';
import { SQL_PO2A_MATERIAL } from './po2a-material.mjs';

const SIZE_GROUP_COMMON = 'COMMON-999';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

const sizeRank = (group) => {
  const match = String(group ?? '').match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const compareSizeGroup = (a, b) => {
  const diff = sizeRank(a) - sizeRank(b);
  return diff !== 0 ? diff : String(a).localeCompare(String(b));
};

const sortSizeGroups = (groups) => [...new Set(groups.filter(Boolean))].sort(compareSizeGroup);

const toDate = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const toText = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** goods_name thường bắt đầu bằng chính mã hàng; bỏ phần trùng để không lặp mã. */
const cleanName = (code, rawName) => {
  const text = toText(rawName);
  if (!text) return code;
  const prefix = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–—:]*\\s*`, 'i');
  const trimmed = text.replace(prefix, '').trim();
  return trimmed || code;
};

const moneyText = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '';

const checkDateValue = (row) => {
  if (!row?.check_date) return Number.NEGATIVE_INFINITY;
  const date = row.check_date instanceof Date ? row.check_date : new Date(row.check_date);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
};

/** Mới nhất theo check_date rồi sheet_no, giống điều kiện trong SQL chuẩn. */
const latestByCheckDate = (rows) =>
  [...rows].sort((a, b) => {
    const diff = checkDateValue(b) - checkDateValue(a);
    return diff !== 0 ? diff : String(b.sheet_no ?? '').localeCompare(String(a.sheet_no ?? ''));
  })[0];

/** Chọn season: ưu tiên tham số; nếu không có thì lấy season của phiếu mới nhất. */
const resolveSeason = (rows, season) => {
  if (season) return season;
  return toText(latestByCheckDate(rows)?.season);
};

/**
 * Chọn size group mặc định:
 * - có cả COMMON-999 và nhóm khác → lấy terms của phiếu mới nhất;
 * - chỉ có nhóm khác → lấy nhóm có số nhỏ nhất (NEXT-1 trước NEXT-3);
 * - còn lại → COMMON-999.
 */
const resolveSizeGroup = (rows, wanted) => {
  if (wanted) return wanted;
  const terms = rows.map((row) => toText(row.terms)).filter(Boolean);
  const hasCommon = terms.includes(SIZE_GROUP_COMMON);
  const others = rows.filter((row) => {
    const term = toText(row.terms);
    return term && term !== SIZE_GROUP_COMMON;
  });
  if (hasCommon && others.length > 0) return toText(latestByCheckDate(rows)?.terms);
  if (others.length > 0) return sortSizeGroups(others.map((row) => toText(row.terms)))[0];
  return SIZE_GROUP_COMMON;
};

const buildPo = (cost, qty, shippedQty, terms, code) => {
  const materialTotal = round2(num(cost.m1) + num(cost.m2) + num(cost.opa) + num(cost.m3));
  const laborCost = round2(num(cost.l_ttl));
  const otherTotal = round2(num(cost.exp));
  const qcExpense = round2(cost.qc_exp);
  const freightExpense = round2(cost.freight_exp);
  const overheadExpense = round2(Math.max(0, otherTotal - qcExpense - freightExpense));
  const price = round2(cost.fob);
  const unitCost = round2(materialTotal + laborCost + otherTotal);
  const gp = round2(price - unitCost);
  const orderValue = round2(qty * price);
  const costValue = round2(qty * unitCost);
  const gpValue = round2(orderValue - costValue);

  return {
    poNo: toText(cost.sheet_no) || `${code}-1`,
    factory: toText(cost.factory),
    qty,
    shippedQty,
    priceLabel: 'FOB unit price',
    price,
    sam: 0,
    efficiency: 0,
    laborRate: 0,
    laborCost,
    bom: [
      { category: 'fabric', itemName: 'Fabric', amount: round2(cost.m1) },
      { category: 'trim', itemName: 'Trims', amount: round2(num(cost.m2) + num(cost.opa)) },
      { category: 'pack', itemName: 'Packaging materials', amount: round2(cost.m3) },
    ],
    materialTotal,
    laborOps: [
      { opCode: 'cut', opName: 'Cutting', minutes: 0, cost: round2(cost.cut) },
      {
        opCode: 'sew',
        opName: 'Sewing',
        minutes: 0,
        cost: round2(num(cost.sew) + num(cost.pri) + num(cost.emb)),
      },
      {
        opCode: 'fin',
        opName: 'Finishing',
        minutes: 0,
        cost: round2(num(cost.fin) + num(cost.etc) + num(cost.soc)),
      },
      { opCode: 'pack', opName: 'Packing', minutes: 0, cost: round2(cost.pac) },
    ],
    otherCosts: [
      { category: 'overhead', label: 'Overhead', amount: overheadExpense },
      { category: 'qc', label: 'QC', amount: qcExpense },
      { category: 'freight', label: 'Freight', amount: freightExpense },
    ],
    otherTotal,
    unitCost,
    gp,
    gpPct: price > 0 ? round2((gp / price) * 100) : 0,
    orderValue,
    costValue,
    gpValue,
    sizeGroups: terms
      ? [{ sizeGroup: terms, qty, shippedQty }]
      : [],
  };
};

/** Gắn vật liệu tính theo logic PO2A cũ vào một cột PO đang trống. */
const withMaterial = (po, material) => {
  const m1 = round2(material.m1);
  const m2 = round2(material.m2);
  const m3 = round2(material.m3);
  const opa = round2(material.opa);
  return {
    ...po,
    bom: [
      { category: 'fabric', itemName: 'Fabric', amount: m1 },
      { category: 'trim', itemName: 'Trims', amount: round2(m2 + opa) },
      { category: 'pack', itemName: 'Packaging materials', amount: m3 },
    ],
    materialTotal: Number.isFinite(Number(material.m_ttl))
      ? round2(material.m_ttl)
      : round2(m1 + m2 + m3 + opa),
  };
};

/** Tạo cột PO2A / PO2B / PO3 ở trạng thái trống; dữ liệu dùng chung sẽ được gắn sau. */
const buildEmptyPo = (code, suffix) => ({
  poNo: `${code}-${suffix}`,
  factory: '',
  qty: 0,
  shippedQty: 0,
  priceLabel: '—',
  price: 0,
  sam: 0,
  efficiency: 0,
  laborRate: 0,
  laborCost: 0,
  bom: [
    { category: 'fabric', itemName: 'Fabric', amount: 0 },
    { category: 'trim', itemName: 'Trims', amount: 0 },
    { category: 'pack', itemName: 'Packaging materials', amount: 0 },
  ],
  materialTotal: 0,
  laborOps: [
    { opCode: 'cut', opName: 'Cutting', minutes: 0, cost: 0 },
    { opCode: 'sew', opName: 'Sewing', minutes: 0, cost: 0 },
    { opCode: 'fin', opName: 'Finishing', minutes: 0, cost: 0 },
    { opCode: 'pack', opName: 'Packing', minutes: 0, cost: 0 },
  ],
  otherCosts: [
    { category: 'overhead', label: 'Overhead', amount: 0 },
    { category: 'qc', label: 'QC', amount: 0 },
    { category: 'freight', label: 'Freight', amount: 0 },
  ],
  otherTotal: 0,
  unitCost: 0,
  gp: 0,
  gpPct: 0,
  orderValue: 0,
  costValue: 0,
  gpValue: 0,
  sizeGroups: [],
});

export const getLatestStyle = async () => {
  const rows = await query(SQL_LATEST_STYLE);
  if (rows.length === 0) return null;
  return {
    code: toText(rows[0].code),
    season: toText(rows[0].season),
  };
};

export const styleExists = async (code) => {
  const rows = await query(SQL_STYLE_EXISTS, { style: code });
  return rows.length > 0;
};

export const getStyleList = async () => {
  const rows = await query(SQL_STYLE_LIST);
  const byCode = new Map();

  rows.forEach((row) => {
    const code = toText(row.style_key);
    if (!code) return;
    const entry = byCode.get(code) ?? { seasons: new Map(), name: '', buyer: '' };
    const season = toText(row.season);
    const terms = toText(row.terms);
    const date = toDate(row.last_check_date);

    const seasonEntry = entry.seasons.get(season) ?? { season, poDate: '', sizeGroups: [] };
    if (!seasonEntry.poDate || date > seasonEntry.poDate) seasonEntry.poDate = date;
    if (terms) seasonEntry.sizeGroups.push(terms);
    entry.seasons.set(season, seasonEntry);

    if (!entry.name) entry.name = toText(row.goods_name);
    if (!entry.buyer) entry.buyer = toText(row.buyer);
    byCode.set(code, entry);
  });

  const styles = [...byCode.entries()].map(([code, entry]) => {
    const seasons = [...entry.seasons.values()]
      .map((item) => ({ ...item, sizeGroups: sortSizeGroups(item.sizeGroups) }))
      .sort((a, b) => b.poDate.localeCompare(a.poDate) || b.season.localeCompare(a.season));
    const latest = seasons[0];
    return {
      code,
      name: entry.name || code,
      buyer: entry.buyer,
      seasons,
      latestSeason: latest?.season ?? '',
      sizeGroups: sortSizeGroups(seasons.flatMap((item) => item.sizeGroups)),
      wip: false,
      units: 0,
      orderValue: 0,
      costValue: 0,
      gpValue: 0,
      gpPct: 0,
      updatedAt: new Date().toISOString(),
    };
  });

  styles.sort((a, b) => {
    const dateA = a.seasons[0]?.poDate ?? '';
    const dateB = b.seasons[0]?.poDate ?? '';
    return dateB.localeCompare(dateA) || a.code.localeCompare(b.code);
  });

  return { styles };
};

export const getStyleDetail = async (code, seasonParam, sizeGroupParam) => {
  const contextRows = await query(SQL_STYLE_CONTEXT, { style: code });
  if (contextRows.length === 0) return null;

  const season = resolveSeason(contextRows, seasonParam);
  const seasonRows = contextRows.filter((row) => toText(row.season) === season);
  if (seasonRows.length === 0) return null;

  const sizeGroup = resolveSizeGroup(seasonRows, sizeGroupParam);
  const listedGroups = sortSizeGroups(
    seasonRows.map((row) => toText(row.terms)).filter((term) => term && term !== SIZE_GROUP_COMMON),
  );

  const costRows = await query(SQL_PO1_COST, {
    style: code,
    season,
    terms: sizeGroup,
  });
  if (costRows.length === 0) return null;
  const cost = costRows[0];

  const [qtyRows, materialRows] = await Promise.all([
    query(SQL_STYLE_QTY, { style: code }),
    query(SQL_PO2A_MATERIAL, {
      p_style: code,
      p_season: season,
      p_size_grp: sizeGroup,
    }),
  ]);

  // Giữ đúng tham số season/size group đang xem. Nếu SQL cũ không có dòng
  // tương ứng thì vật liệu PO2A để 0, không tự đổi sang season khác.
  const po2aMaterial = materialRows[0] ?? {};

  const qtyRow = qtyRows[0] ?? {};
  const units = num(qtyRow.units);
  const shipped = num(qtyRow.shipped);

  const po1 = buildPo({ ...cost, fob: num(cost.fob) }, units, shipped, sizeGroup, code);
  const sharedOther = (po) => ({
    ...po,
    otherCosts: po1.otherCosts.map((line) => ({ ...line })),
    otherTotal: po1.otherTotal,
  });
  /** PO2A / PO2B dùng đúng chi phí nhân công của PO1; vật tư chỉ PO2A có dữ liệu. */
  const sharedLabor = (po) => {
    const laborCost = po1.laborCost;
    const laborOps = po1.laborOps.map((line) => ({ ...line }));
    return {
      ...po,
      laborCost,
      laborOps,
      unitCost: round2(po.materialTotal + laborCost + po.otherTotal),
    };
  };
  /** PO2A / PO2B lấy đơn giá FOB của PO1 và tính lại GP theo giá mới. */
  const sharedPrice = (po) => {
    const price = po1.price;
    const gp = round2(price - po.unitCost);
    return {
      ...po,
      price,
      gp,
      gpPct: price > 0 ? round2((gp / price) * 100) : 0,
    };
  };
  const pos = [
    po1,
    sharedPrice(sharedLabor(sharedOther(withMaterial(buildEmptyPo(code, '2A'), po2aMaterial)))),
    sharedPrice(sharedLabor(sharedOther(buildEmptyPo(code, '2B')))),
    sharedOther(buildEmptyPo(code, '3')),
  ];

  const orderValue = round2(pos.reduce((sum, po) => sum + po.orderValue, 0));
  const costValue = round2(pos.reduce((sum, po) => sum + po.costValue, 0));
  const gpValue = round2(orderValue - costValue);
  const priced = pos.filter((po) => po.price > 0);

  const seasons = [...new Set(contextRows.map((row) => toText(row.season)).filter(Boolean))];
  const rawRemarks = toText(cost.rem);
  const remarks = rawRemarks ? cleanName(code, rawRemarks) : '';

  return {
    code,
    name: cleanName(code, cost.goods_name),
    buyer: toText(contextRows[0]?.buyer),
    season,
    seasons,
    latestSeason: season,
    fabric: '',
    poDate: toDate(cost.sheet_date),
    version: toText(cost.ver_no),
    terms: sizeGroup,
    remarks,
    sampleNo: toText(cost.goods_no),
    sampleName: toText(cost.goods_name),
    sampleType: toText(cost.goods_type_desc),
    brand: toText(cost.brand),
    moq: cost.min_ord_qty === null || cost.min_ord_qty === undefined ? '' : toText(cost.min_ord_qty),
    firstCrd: toDate(qtyRow.first_crd),
    lastCrd: toDate(qtyRow.last_crd),
    packingSpec: toText(cost.pack_desc),
    m3: moneyText(
      Math.round(
        num(cost.pack_len) * num(cost.pack_width) * num(cost.pack_height) * 1e8,
      ) / 1e8,
      3,
    ),
    pcsPerCarton: toText(cost.pack_num),
    fxVnd: moneyText(num(cost.def03) || num(cost.usd_rate), 2),
    fxRmb: moneyText(
      num(cost.def07) ||
        (num(cost.rmb_rate) > 0 ? num(cost.usd_rate) / num(cost.rmb_rate) : 0),
      4,
    ),
    fxHkd: moneyText(
      num(cost.def08) ||
        (num(cost.hkd_rate) > 0 ? num(cost.usd_rate) / num(cost.hkd_rate) : 0),
      4,
    ),
    photoUrl: '',
    units,
    shipUnits: shipped,
    wip: shipped > 0 && shipped < units,
    orderValue,
    costValue,
    gpValue,
    gpPct: orderValue > 0 ? round2((gpValue / orderValue) * 100) : 0,
    avgPrice: units > 0 ? round2(orderValue / units) : 0,
    avgCost: units > 0 ? round2(costValue / units) : 0,
    avgGp: units > 0 ? round2(gpValue / units) : 0,
    avgSam: 0,
    avgEfficiency: 0,
    avgLaborCost: priced.length
      ? round2(priced.reduce((sum, po) => sum + po.laborCost, 0) / priced.length)
      : 0,
    sizeGroups: listedGroups.length > 0 ? listedGroups : sortSizeGroups([sizeGroup]),
    pos,
  };
};
