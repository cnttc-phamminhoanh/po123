import { query, queryOld } from './db.mjs';
import { config } from './config.mjs';
import { createTtlCache } from './cache.mjs';
import {
  SQL_LATEST_STYLE,
  SQL_PO1_COST,
  SQL_SO_SEASON_OPTIONS,
  SQL_STYLE_CONTEXT,
  SQL_STYLE_EXISTS,
  SQL_STYLE_LIST,
  SQL_STYLE_QTY,
} from './sql.mjs';
import { SQL_PO2A_MATERIAL } from './po2a-material.mjs';
import { SQL_PO2B_MATERIAL } from './po2b-material.mjs';
import { SQL_PO3_MATERIAL } from './po3-material.mjs';
import { SQL_PO3_PRICE } from './po3-price.mjs';
import { SQL_PO3_LABOR } from './po3-labor.mjs';

const SIZE_GROUP_COMMON = 'COMMON-999';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const round4 = (value) => Math.round((num(value) + Number.EPSILON) * 10000) / 10000;

const BOM_CATEGORIES = new Set(['fabric', 'trim', 'opa', 'pack']);

/**
 * Cache kết quả đọc từ ERP.
 * - Chi tiết PO: 5 phút, tối đa 50 style.
 * - Style mới nhất: 1 phút.
 * Có thể chỉnh qua biến môi trường mà không cần sửa code.
 */
const styleDetailCache = createTtlCache({
  name: 'style-detail',
  ttlMs: config.cache.styleDetailTtlMs,
  maxEntries: config.cache.maxEntries,
});
const latestStyleCache = createTtlCache({
  name: 'latest-style',
  ttlMs: config.cache.latestStyleTtlMs,
  maxEntries: 1,
});

const styleDetailKey = (code, season, sizeGroup, soSeason) =>
  `${String(code ?? '').trim()}|${String(season ?? '').trim()}|${String(sizeGroup ?? '').trim()}|${String(soSeason ?? '').trim()}`;

/** SQL trả JSON để giữ được danh sách mã vật tư trong cùng một dòng kết quả. */
const parseMaterialDetails = (value) => {
  let rows = value;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      category: String(row?.category ?? ''),
      code: String(row?.code ?? '').trim(),
      name: String(row?.name ?? '').trim(),
      amount: round2(row?.amount),
    }))
    .filter(
      (row) =>
        BOM_CATEGORIES.has(row.category) &&
        Number.isFinite(row.amount) &&
        row.amount !== 0,
    )
    .sort(
      (a, b) =>
        ['fabric', 'trim', 'opa', 'pack'].indexOf(a.category) -
          ['fabric', 'trim', 'opa', 'pack'].indexOf(b.category) ||
        b.amount - a.amount,
    );
};

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
  const raw = row?.check_date ?? row?.create_date ?? row?.sheet_date;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
};

/** Mới nhất theo ngày duyệt, nếu chưa duyệt thì dùng ngày lập phiếu. */
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
      { category: 'trim', itemName: 'Trims', amount: round2(cost.m2) },
      { category: 'opa', itemName: 'OPA', amount: round2(cost.opa) },
      { category: 'pack', itemName: 'Packaging materials', amount: round2(cost.m3) },
    ],
    materialDetails: parseMaterialDetails(cost.material_details),
    materialTotal,
    laborOps: [
      { opCode: 'cut', opName: 'Cutting', minutes: 0, cost: round2(cost.cut) },
      { opCode: 'pri', opName: 'Printing', minutes: 0, cost: round2(cost.pri) },
      { opCode: 'emb', opName: 'Embroidery', minutes: 0, cost: round2(cost.emb) },
      { opCode: 'sew', opName: 'Sewing', minutes: 0, cost: round2(cost.sew) },
      {
        opCode: 'fin',
        opName: 'Finishing',
        minutes: 0,
        cost: round2(cost.fin),
      },
      { opCode: 'soc', opName: 'Socks', minutes: 0, cost: round2(cost.soc) },
      { opCode: 'pack', opName: 'Packing', minutes: 0, cost: round2(cost.pac) },
      { opCode: 'etc', opName: 'ETC', minutes: 0, cost: round4(cost.etc) },
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
      { category: 'trim', itemName: 'Trims', amount: m2 },
      { category: 'opa', itemName: 'OPA', amount: opa },
      { category: 'pack', itemName: 'Packaging materials', amount: m3 },
    ],
    materialDetails: parseMaterialDetails(material.material_details),
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
    { category: 'opa', itemName: 'OPA', amount: 0 },
    { category: 'pack', itemName: 'Packaging materials', amount: 0 },
  ],
  materialDetails: [],
  materialTotal: 0,
  laborOps: [
    { opCode: 'cut', opName: 'Cutting', minutes: 0, cost: 0 },
    { opCode: 'pri', opName: 'Printing', minutes: 0, cost: 0 },
    { opCode: 'emb', opName: 'Embroidery', minutes: 0, cost: 0 },
    { opCode: 'sew', opName: 'Sewing', minutes: 0, cost: 0 },
    { opCode: 'fin', opName: 'Finishing', minutes: 0, cost: 0 },
    { opCode: 'soc', opName: 'Socks', minutes: 0, cost: 0 },
    { opCode: 'pack', opName: 'Packing', minutes: 0, cost: 0 },
    { opCode: 'etc', opName: 'Other (ETC)', minutes: 0, cost: 0 },
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

const loadLatestStyle = async () => {
  const rows = await query(SQL_LATEST_STYLE);
  if (rows.length === 0) return null;
  return {
    code: toText(rows[0].code),
    season: toText(rows[0].season),
  };
};

export const getLatestStyle = () => latestStyleCache.load('latest', loadLatestStyle);

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

const loadStyleDetail = async (code, seasonParam, sizeGroupParam, soSeasonParam) => {
  const contextRows = await query(SQL_STYLE_CONTEXT, { style: code });
  if (contextRows.length === 0) return null;

  const season = resolveSeason(contextRows, seasonParam);
  const seasonRows = contextRows.filter((row) => toText(row.season) === season);
  if (seasonRows.length === 0) return null;

  const sizeGroup = resolveSizeGroup(seasonRows, sizeGroupParam);
  const listedGroups = sortSizeGroups(
    seasonRows.map((row) => toText(row.terms)).filter((term) => term && term !== SIZE_GROUP_COMMON),
  );

  // PO1 luôn dùng season báo giá. PO2A/PO2B/PO3 dùng season thực tế trên SO.
  const [costRows, soSeasonRows] = await Promise.all([
    query(SQL_PO1_COST, {
      style: code,
      season,
      terms: sizeGroup,
    }),
    query(SQL_SO_SEASON_OPTIONS, { style: code }).catch((error) => {
      console.warn('[api] SO season options failed:', error.message);
      return [];
    }),
  ]);
  if (costRows.length === 0) return null;
  const cost = costRows[0];

  const soSeasons = [
    ...new Set(soSeasonRows.map((row) => toText(row.season)).filter(Boolean)),
  ];
  const requestedSoSeason = toText(soSeasonParam);
  let soSeason = season;
  let soSeasonNeedsChoice = false;

  if (requestedSoSeason && soSeasons.includes(requestedSoSeason)) {
    // Người dùng đã chọn season SO cụ thể.
    soSeason = requestedSoSeason;
  } else if (soSeasons.includes(season)) {
    // Ưu tiên season SO trùng với season báo giá.
    soSeason = season;
  } else if (soSeasons.length === 1) {
    // Chỉ có một season SO: tự dùng và cảnh báo lệch season.
    soSeason = soSeasons[0];
  } else if (soSeasons.length > 1) {
    // Có nhiều season SO và không có season trùng: tạm lấy mới nhất,
    // đồng thời báo UI mở ô chọn season SO.
    soSeason = soSeasons[0];
    soSeasonNeedsChoice = true;
  }

  const seasonMismatch = Boolean(soSeason && season && soSeason !== season);

  const [qtyRows, materialRows, po2bRows, po3Rows, po3LaborRows, po3PriceRows] = await Promise.all([
    query(SQL_STYLE_QTY, { style: code }),
    query(SQL_PO2A_MATERIAL, {
      p_style: code,
      p_season: soSeason,
      p_size_grp: sizeGroup,
    }).catch((error) => {
      console.warn('[api] PO2A material failed:', error.message);
      return [];
    }),
    query(SQL_PO2B_MATERIAL, {
      p_style: code,
      p_season: soSeason,
      p_size_grp: sizeGroup,
    }).catch((error) => {
      console.warn('[api] PO2B material failed:', error.message);
      return [];
    }),
    query(SQL_PO3_MATERIAL, {
      p_style: code,
      p_season: soSeason,
      p_size_grp: sizeGroup,
    }).catch((error) => {
      console.warn('[api] PO3 material failed:', error.message);
      return [];
    }),
    queryOld(SQL_PO3_LABOR, {
      p_style: code,
      p_season: soSeason,
      p_size_grp: sizeGroup,
    }).catch((error) => {
      console.warn('[api] PO3 labor (old DB) failed:', error.message);
      return [];
    }),
    query(SQL_PO3_PRICE, {
      p_style: code,
      p_season: soSeason,
      p_size_grp: sizeGroup,
    }).catch((error) => {
      console.warn('[api] PO3 FOB price failed:', error.message);
      return [];
    }),
  ]);

  // PO1 dùng season báo giá; PO2A/PO2B/PO3 dùng season SO đã chọn/tự resolve.
  // Nếu SQL cũ không có dòng tương ứng thì vật liệu PO2A/PO2B/PO3 và nhân công PO3 để 0.
  const po2aMaterial = materialRows[0] ?? {};
  const po2bMaterial = po2bRows[0] ?? {};
  const po3Material = po3Rows[0] ?? {};
  const po3Labor = po3LaborRows[0] ?? {};
  const po3Price = po3PriceRows[0] ?? {};

  const qtyRow = qtyRows[0] ?? {};
  const units = num(qtyRow.units);
  const shipped = num(qtyRow.shipped);

  const po1 = buildPo({ ...cost, fob: num(cost.fob) }, units, shipped, sizeGroup, code);
  const hasMaterial = (po) => num(po.materialTotal) > 0;
  const sharedOther = (po) => ({
    ...po,
    // Không có nguyên phụ liệu thì không mang chi phí khác của PO1 sang.
    otherCosts: hasMaterial(po)
      ? po1.otherCosts.map((line) => ({ ...line }))
      : po1.otherCosts.map((line) => ({ ...line, amount: 0 })),
    otherTotal: hasMaterial(po) ? po1.otherTotal : 0,
  });
  /** PO2A / PO2B dùng đúng chi phí nhân công của PO1 khi có nguyên phụ liệu. */
  const sharedLabor = (po) => {
    const laborCost = hasMaterial(po) ? po1.laborCost : 0;
    const laborOps = hasMaterial(po)
      ? po1.laborOps.map((line) => ({ ...line }))
      : po1.laborOps.map((line) => ({ ...line, cost: 0 }));
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
  /**
   * PO3: vật liệu + nhân công + chi phí khác.
   *
   * SQL nhân công trả từng công đoạn theo USD/pcs. UI hiển thị đúng 8 cột
   * như SQL, tách riêng cả `etc`:
   * Cut / Pri / Emb / Sew / Fin / Soc / Pack / ETC.
   *
   * SQL cũ tính:
   *   x       = cut + soc + sew + fin + pac + etc   (các công đoạn không in/thêu)
   *   emb_pri = pri + emb
   *   overhead = x * 0.61 * 1.6
   *   l_ttl   = emb_pri + overhead + x * 1.6
   *
   * Nếu UI hiển thị x dạng gốc (chưa nhân 1.6), chỉ thêm dòng:
   *   - Overhead = x * 0.61 * 1.6
   * Tổng PO3 vẫn lấy l_ttl. Người dùng tự áp công thức để đối chiếu:
   * x + 0.6x + 0.61*1.6x + emb_pri = l_ttl.
   */
  const withPo3Cost = (po, material, labor, priceRow) => {
    const updated = withMaterial(po, material);
    const cut = num(labor.cut);
    const pri = num(labor.pri);
    const emb = num(labor.emb);
    const sew = num(labor.sew);
    const fin = num(labor.fin);
    const soc = num(labor.soc);
    const pack = num(labor.pac);
    const etc = num(labor.etc);
    const cutCost = round2(cut);
    const priCost = round2(pri);
    const embCost = round2(emb);
    const sewCost = round2(sew);
    const finCost = round2(fin);
    const socCost = round2(soc);
    const packCost = round2(pack);
    const etcCost = round4(etc);
    const rawTotal = round2(
      cutCost +
        priCost +
        embCost +
        sewCost +
        finCost +
        socCost +
        packCost +
        etcCost,
    );

    // x và emb_pri lấy số gốc chưa làm tròn, đúng như SQL cũ.
    const x = cut + soc + sew + fin + pack + etc;
    const overheadCost = round2(x * 0.61 * 1.6);

    const lttl = Number(labor.l_ttl);
    const lttlRounded = Number.isFinite(lttl) && lttl !== 0
      ? round2(lttl)
      : null;
    const formulaTotal = round2(rawTotal + overheadCost + x * 0.6);
    const laborCost = lttlRounded ?? formulaTotal;

    const unitCost = round2(updated.materialTotal + laborCost + updated.otherTotal);
    const fobPrice = round2(priceRow['PO3 Avg SO Unit Price'] ?? priceRow.avg_so_unit_price);
    const gp = fobPrice > 0 ? round2(fobPrice - unitCost) : 0;
    // PO3 là cột chi phí, không tự đổi quantity của cột; chỉ gắn đơn giá FOB.
    const orderValue = round2(updated.qty * fobPrice);
    const costValue = round2(updated.qty * unitCost);

    return {
      ...updated,
      price: fobPrice,
      priceLabel: 'PO3 Avg SO Unit Price',
      gp,
      gpPct: fobPrice > 0 ? round2((gp / fobPrice) * 100) : 0,
      orderValue,
      costValue,
      gpValue: round2(orderValue - costValue),
      laborCost,
      laborOps: [
        { opCode: 'cut', opName: 'Cutting', minutes: 0, cost: cutCost },
        { opCode: 'pri', opName: 'Printing', minutes: 0, cost: priCost },
        { opCode: 'emb', opName: 'Embroidery', minutes: 0, cost: embCost },
        { opCode: 'sew', opName: 'Sewing', minutes: 0, cost: sewCost },
        { opCode: 'fin', opName: 'Finishing', minutes: 0, cost: finCost },
        { opCode: 'soc', opName: 'Socks', minutes: 0, cost: socCost },
        { opCode: 'pack', opName: 'Packing', minutes: 0, cost: packCost },
        { opCode: 'etc', opName: 'ETC', minutes: 0, cost: etcCost },
        {
          opCode: 'overhead',
          opName: 'Overhead',
          minutes: 0,
          cost: overheadCost,
        },
      ],
      unitCost,
    };
  };
  const pos = [
    po1,
    sharedPrice(sharedLabor(sharedOther(withMaterial(buildEmptyPo(code, '2A'), po2aMaterial)))),
    sharedPrice(sharedLabor(sharedOther(withMaterial(buildEmptyPo(code, '2B'), po2bMaterial)))),
    withPo3Cost(
      sharedOther(withMaterial(buildEmptyPo(code, '3'), po3Material)),
      po3Material,
      po3Labor,
      po3Price,
    ),
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
    quoteSeason: season,
    seasons,
    soSeason,
    soSeasons,
    seasonMismatch,
    soSeasonNeedsChoice,
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

export const getStyleDetail = (code, seasonParam, sizeGroupParam, soSeasonParam) =>
  styleDetailCache.load(
    styleDetailKey(code, seasonParam, sizeGroupParam, soSeasonParam),
    () => loadStyleDetail(code, seasonParam, sizeGroupParam, soSeasonParam),
  );

export const clearStyleDetailCache = () => styleDetailCache.clear();

export const getCacheStats = () => ({
  styleDetail: styleDetailCache.stats(),
  latestStyle: latestStyleCache.stats(),
});
