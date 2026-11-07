import http from 'node:http';

import { sampleStyles } from './sample-data.mjs';

const PORT = Number(process.env.MOCK_PORT ?? 4001);

const BOM_CATEGORIES = ['fabric', 'trim', 'wash', 'pack'];
const BOM_DEFAULT_ITEMS = {
  fabric: 'Fabric',
  trim: 'Thread, labels & trims',
  wash: 'Garment wash & dye',
  pack: 'Polybag & carton',
};
const LABOR_OP_CODES = ['cut', 'sew', 'fin', 'pack'];
const LABOR_LABELS = { cut: 'Cutting', sew: 'Sewing', fin: 'Finishing', pack: 'Packing' };
const OTHER_CATEGORIES = ['overhead', 'qc', 'freight'];
const OTHER_LABELS = { overhead: 'Overhead', qc: 'QC', freight: 'Freight' };

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const buildBom = (rows) =>
  BOM_CATEGORIES.map((category) => {
    const row = rows.find((item) => item.category === category);
    return {
      category,
      itemName: row?.itemName || BOM_DEFAULT_ITEMS[category],
      amount: round2(row?.amount ?? 0),
    };
  });

const buildLaborOps = (rows, laborRate) =>
  LABOR_OP_CODES.map((opCode) => {
    const row = rows.find((item) => item.opCode === opCode);
    const minutes = row?.minutes ?? 0;
    return {
      opCode,
      opName: row?.opName || LABOR_LABELS[opCode],
      minutes,
      cost: round2(minutes * laborRate),
    };
  });

const buildOtherCosts = (rows) =>
  OTHER_CATEGORIES.map((category) => {
    const row = rows.find((item) => item.category === category);
    return {
      category,
      label: row?.label || OTHER_LABELS[category],
      amount: round2(row?.amount ?? 0),
    };
  });

const sortSizeGroups = (groups) =>
  [...groups].sort((a, b) => {
    const rank = (group) => {
      const match = group.match(/(\d+)\s*$/);
      return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    };
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

const buildPo = (po) => {
  const bom = buildBom(po.bom ?? []);
  const laborOps = buildLaborOps(po.laborOps ?? [], po.laborRate);
  const otherCosts = buildOtherCosts(po.otherCosts ?? []);
  const materialTotal = round2(bom.reduce((sum, line) => sum + line.amount, 0));
  const otherTotal = round2(otherCosts.reduce((sum, line) => sum + line.amount, 0));
  const laborCost = round2(
    po.laborCost ??
      laborOps.reduce((sum, line) => sum + line.cost, 0),
  );
  const unitCost = round2(materialTotal + laborCost + otherTotal);
  const gp = round2(po.price - unitCost);
  const orderValue = round2(po.qty * po.price);
  const costValue = round2(po.qty * unitCost);
  const gpValue = round2(orderValue - costValue);

  return {
    poNo: po.poNo,
    factory: po.factory,
    qty: po.qty,
    shippedQty: po.shippedQty,
    priceLabel: po.priceLabel ?? 'FOB unit price',
    price: po.price,
    sam: po.sam,
    efficiency: po.efficiency,
    laborRate: po.laborRate,
    laborCost,
    bom,
    materialTotal,
    laborOps,
    otherCosts,
    otherTotal,
    unitCost,
    gp,
    gpPct: po.price > 0 ? round2((gp / po.price) * 100) : 0,
    orderValue,
    costValue,
    gpValue,
    sizeGroups: po.sizeGroups ?? [],
  };
};

const buildDetail = (style) => {
  const pos = style.pos.map(buildPo);
  const units = pos.reduce((sum, po) => sum + po.qty, 0);
  const shipUnits = pos.reduce((sum, po) => sum + po.shippedQty, 0);
  const orderValue = round2(pos.reduce((sum, po) => sum + po.orderValue, 0));
  const costValue = round2(pos.reduce((sum, po) => sum + po.costValue, 0));
  const gpValue = round2(orderValue - costValue);
  const groups = [];
  pos.forEach((po) => {
    po.sizeGroups.forEach((line) => {
      if (!groups.includes(line.sizeGroup)) groups.push(line.sizeGroup);
    });
  });

  return {
    code: style.code,
    name: style.name,
    buyer: style.buyer,
    season: style.season,
    fabric: style.fabric,
    poDate: style.poDate,
    version: style.version,
    terms: style.terms,
    sampleType: style.sampleType,
    moq: style.moq,
    firstCrd: style.firstCrd,
    lastCrd: style.lastCrd,
    packingSpec: style.packingSpec,
    m3: style.m3,
    pcsPerCarton: style.pcsPerCarton,
    fxVnd: style.fxVnd,
    fxRmb: style.fxRmb,
    fxHkd: style.fxHkd,
    photoUrl: style.photoUrl ?? '',
    units,
    shipUnits,
    wip: shipUnits > 0 && shipUnits < units,
    orderValue,
    costValue,
    gpValue,
    gpPct: orderValue > 0 ? round2((gpValue / orderValue) * 100) : 0,
    avgPrice: units > 0 ? round2(orderValue / units) : 0,
    avgCost: units > 0 ? round2(costValue / units) : 0,
    avgGp: units > 0 ? round2(gpValue / units) : 0,
    avgSam: pos.length ? round2(pos.reduce((s, po) => s + po.sam, 0) / pos.length) : 0,
    avgEfficiency: pos.length
      ? round2(pos.reduce((s, po) => s + po.efficiency, 0) / pos.length)
      : 0,
    avgLaborCost: pos.length
      ? round2(pos.reduce((s, po) => s + po.laborCost, 0) / pos.length)
      : 0,
    sizeGroups: sortSizeGroups(groups),
    pos,
  };
};

const buildSummaries = () => {
  const byCode = new Map();
  sampleStyles.forEach((style) => {
    const detail = buildDetail(style);
    const entry = byCode.get(style.code) ?? { seasons: [] };
    entry.seasons.push({
      season: style.season,
      poDate: style.poDate,
      sizeGroups: detail.sizeGroups,
      detail,
    });
    byCode.set(style.code, entry);
  });

  const styles = [];
  byCode.forEach((entry, code) => {
    entry.seasons.sort(
      (a, b) => b.poDate.localeCompare(a.poDate) || b.season.localeCompare(a.season),
    );
    const seasonDetails = entry.seasons.map((season) => season.detail);
    const units = seasonDetails.reduce((sum, item) => sum + item.units, 0);
    const shipUnits = seasonDetails.reduce((sum, item) => sum + item.shipUnits, 0);
    const orderValue = round2(seasonDetails.reduce((s, item) => s + item.orderValue, 0));
    const costValue = round2(seasonDetails.reduce((s, item) => s + item.costValue, 0));
    const gpValue = round2(orderValue - costValue);
    const groups = [];
    seasonDetails.forEach((item) => {
      item.sizeGroups.forEach((group) => {
        if (!groups.includes(group)) groups.push(group);
      });
    });

    styles.push({
      code,
      name: seasonDetails[0].name,
      buyer: seasonDetails[0].buyer,
      seasons: entry.seasons.map((season) => ({
        season: season.season,
        poDate: season.poDate,
        sizeGroups: season.sizeGroups,
      })),
      latestSeason: entry.seasons[0].season,
      sizeGroups: sortSizeGroups(groups),
      wip: shipUnits > 0 && shipUnits < units,
      units,
      orderValue,
      costValue,
      gpValue,
      gpPct: orderValue > 0 ? round2((gpValue / orderValue) * 100) : 0,
      updatedAt: new Date().toISOString(),
    });
  });

  return { styles };
};

const findStyle = (code, season) => {
  const matches = sampleStyles.filter((style) => style.code === code);
  if (matches.length === 0) return null;
  if (season) {
    return matches.find((style) => style.season === season) ?? null;
  }
  return [...matches].sort((a, b) => b.poDate.localeCompare(a.poDate))[0];
};

const rescaleSizeGroups = (style, po, nextQty) => {
  const groups = po.sizeGroups ?? [];
  const total = groups.reduce((sum, line) => sum + line.qty, 0);
  if (total <= 0) return;
  let assigned = 0;
  groups.forEach((line, index) => {
    const isLast = index === groups.length - 1;
    const qty = isLast
      ? nextQty - assigned
      : Math.round((line.qty / total) * nextQty);
    assigned += qty;
    line.qty = qty;
    line.shippedQty = Math.min(line.shippedQty, qty);
  });
};

const applyPatch = (style, po, body) => {
  ['factory', 'priceLabel', 'price', 'sam', 'efficiency', 'laborRate', 'laborCost'].forEach(
    (field) => {
      if (body[field] !== undefined) po[field] = body[field];
    },
  );
  if (body.shippedQty !== undefined) po.shippedQty = body.shippedQty;
  if (body.qty !== undefined && body.qty !== po.qty) {
    rescaleSizeGroups(style, po, body.qty);
    po.qty = body.qty;
  }
  if (body.bom !== undefined) po.bom = body.bom;
  if (body.laborOps !== undefined) po.laborOps = body.laborOps;
  if (body.otherCosts !== undefined) po.otherCosts = body.otherCosts;
};

const send = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const season = url.searchParams.get('season') ?? undefined;

  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  if (req.method === 'GET' && path === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && path === '/api/bom/styles') {
    send(res, 200, buildSummaries());
    return;
  }

  const detailMatch = path.match(/^\/api\/bom\/styles\/([^/]+)$/);
  if (req.method === 'GET' && detailMatch) {
    const code = decodeURIComponent(detailMatch[1]);
    const style = findStyle(code, season);
    if (!style) {
      send(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown style ${code}` } });
      return;
    }
    send(res, 200, buildDetail(style));
    return;
  }

  const patchMatch = path.match(/^\/api\/bom\/styles\/([^/]+)\/pos\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    const code = decodeURIComponent(patchMatch[1]);
    const poNo = decodeURIComponent(patchMatch[2]);
    const style = findStyle(code, season);
    if (!style) {
      send(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown style ${code}` } });
      return;
    }
    const po = style.pos.find((item) => item.poNo === poNo);
    if (!po) {
      send(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown PO ${poNo}` } });
      return;
    }
    const body = await readBody(req);
    applyPatch(style, po, body);
    send(res, 200, buildPo(po));
    return;
  }

  if (req.method === 'POST' && path === '/api/bom/styles/photos') {
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    items.forEach((item) => {
      sampleStyles
        .filter((style) => style.code === item.styleCode)
        .forEach((style) => {
          style.photoUrl = item.photoUrl;
        });
    });
    send(res, 200, { bound: items, unmatched: [] });
    return;
  }

  send(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${path}` } });
});

server.listen(PORT, () => {
  console.info(`[mock] BOM mock API listening on http://localhost:${PORT}`);
});
