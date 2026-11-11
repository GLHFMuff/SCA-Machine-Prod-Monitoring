/**
 * Pure geometric layout & defect-clustering engine for the monochrome (kertas buram)
 * OP Defect Visual Report PDF.
 *
 * Designed with zero DOM/browser dependencies so it can be unit-tested in Node.js
 * and shared seamlessly with jsPDF rendering.
 */

export const REPORT_PAGE = {
  widthMm: 210, // A4 Portrait
  heightMm: 297,
  marginLeftMm: 7,
  marginRightMm: 7,
  marginTopMm: 7,
  marginBottomMm: 7,
};

export const REPORT_GEOMETRY = {
  cardPadXMm: 2.5,
  cardPadTopMm: 1.2,
  cardPadBottomMm: 1.1,
  cardGapMm: 1.3,
  rollHeaderHeightMm: 3.9,
  rulerHeightMm: 2.9,
  pinTierHeightMm: 2.3,
  pinTopPillPadMm: 1.0,
  fabricHeightMm: 2.7,
  rangeLaneHeightMm: 2.6,
  rangeLaneGapMm: 0.45,
  leaderHeightMm: 2.1,
  chipHeightMm: 3.4,
  chipGapMm: 1.4,
  legendRowHeightMm: 3.4,
  legendTopGapMm: 1.3,
  minRangeWidthMm: 1.8,
  minRangeSameLaneGapMm: 1.2,
  minPinSameTierGapMm: 0.65,
};

/**
 * Format yard number cleanly without trailing .00 noise.
 * @param {number} val
 * @returns {string}
 */
export function formatYard(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/**
 * Fallback pure-JS text width estimator (mm) used in unit tests when jsPDF isn't passed.
 * @param {string} text
 * @param {number} fontSizePt
 * @param {boolean} [isBold=false]
 * @returns {number}
 */
export function estimateTextWidthMm(text, fontSizePt = 7, isBold = false) {
  const s = String(text || '');
  // Average Helvetica character width is ~0.52em regular, ~0.56em bold; 1pt = 0.352778mm
  const factor = isBold ? 0.57 : 0.52;
  return s.length * fontSizePt * 0.352778 * factor;
}

/**
 * Normalize a single CountingKainDefect row.
 * Handles point defects (LengthPoint == LengthPointTo, or LengthPointTo == 0/null),
 * inverted bounds (LengthPointTo < LengthPoint), and code/description splitting.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeReportDefect(raw) {
  let from = parseFloat(raw.LengthPoint ?? raw.lengthPoint ?? raw.yard ?? 0);
  if (!Number.isFinite(from)) from = 0;

  let rawTo = parseFloat(raw.LengthPointTo ?? raw.lengthPointTo ?? raw.yardTo);
  if (!Number.isFinite(rawTo) || (rawTo <= 0 && from > 0)) {
    rawTo = from;
  }

  let to = rawTo;
  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const rawCode = String(raw.Code ?? raw.code ?? '').trim();
  const codeParts = rawCode.split(/\s+[–-]\s+/);
  const code = (codeParts[0] || rawCode || 'DEF').trim();
  const splitDesc = codeParts.slice(1).join(' - ').trim();

  const rawDesc = String(raw.Description ?? raw.description ?? '').trim();
  const masterDefect = String(raw.MasterDefect ?? raw.masterDefect ?? '').trim();
  const resolvedDesc =
    masterDefect ||
    splitDesc ||
    (rawDesc && rawDesc.toUpperCase() !== code.toUpperCase() ? rawDesc : '');

  const isPoint = Math.abs(to - from) < 0.001;

  return {
    roolNumber: parseInt(raw.RoolNumber ?? raw.roolNumber ?? raw.rollNumber ?? 0, 10) || 0,
    from,
    to: isPoint ? from : to,
    kind: isPoint ? 'point' : 'range',
    code,
    description: resolvedDesc,
    lineNumber: parseInt(raw.LineNumber ?? raw.lineNumber ?? 0, 10) || 0,
    isExecuted: Boolean(raw.IsExecuted ?? raw.isExecuted),
  };
}

/**
 * Summarize an array of defect codes cleanly, preserving order of first appearance
 * and collapsing identical codes with `×N` (e.g. `BO×2, KTR`).
 * @param {Array<{ code: string }>} items
 * @returns {string}
 */
export function summarizeDefectCodes(items) {
  const counts = new Map();
  for (const item of items) {
    const c = item.code || 'DEF';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const parts = [];
  for (const [code, count] of counts.entries()) {
    parts.push(count > 1 ? `${code}x${count}` : code);
  }
  return parts.join(', ');
}

/**
 * Aggregate raw API response + optional fallback prodData into normalized OP report model.
 * @param {object} rawReport - { header, lines, defects, joinedPieces }
 * @param {object} [fallbackProdData]
 * @returns {object}
 */
export function prepareOpDefectReport(rawReport = {}, fallbackProdData = {}) {
  const rawHeader = rawReport.header || {};
  const rawLines = Array.isArray(rawReport.lines) ? rawReport.lines : [];
  const rawDefects = Array.isArray(rawReport.defects) ? rawReport.defects : [];
  const rawJoined = Array.isArray(rawReport.joinedPieces) ? rawReport.joinedPieces : [];

  const prodId = String(
    rawHeader.ProdId || fallbackProdData?.prodNumber || ''
  ).trim();

  const header = {
    prodId,
    seqmentNum: String(
      rawHeader.SeqmentNum || fallbackProdData?.seqmentNum || prodId
    ).trim(),
    custCode: String(
      rawHeader.CustCode || fallbackProdData?.custCode || fallbackProdData?.customer || '-'
    ).trim(),
    designCode: String(
      rawHeader.DesignCode || fallbackProdData?.designCode || fallbackProdData?.fabricType || '-'
    ).trim(),
    color: String(rawHeader.Color || fallbackProdData?.color || '-').trim(),
    orderQty: parseFloat(rawHeader.OrderQty ?? fallbackProdData?.orderQty) || 0,
    stockQty: parseFloat(rawHeader.StockQty ?? fallbackProdData?.stockQty) || 0,
    noMesin: String(rawHeader.NoMesin || fallbackProdData?.noMesin || '').trim(),
  };

  // Joined pieces grouped by roll number
  const joinedByRoll = new Map();
  for (const jp of rawJoined) {
    const rNum = parseInt(jp.RoolNumber ?? jp.roolNumber ?? 0, 10);
    const pt = parseFloat(jp.LengthPoint ?? jp.lengthPoint ?? jp.yard ?? 0);
    if (rNum > 0 && Number.isFinite(pt)) {
      if (!joinedByRoll.has(rNum)) joinedByRoll.set(rNum, []);
      joinedByRoll.get(rNum).push(pt);
    }
  }
  for (const arr of joinedByRoll.values()) {
    arr.sort((a, b) => a - b);
  }

  // Separate fabric rolls (ProductType != 1) and co-products (ProductType == 1)
  const rollMap = new Map();
  const coProducts = [];

  for (const line of rawLines) {
    const productType = Number(line.ProductType ?? 5);
    const rNum = parseInt(line.RoolNumber ?? line.roolNumber ?? 0, 10);
    if (!rNum) continue;

    if (productType === 1) {
      coProducts.push({
        roolNumber: rNum,
        inventStatus: String(line.InventStatus || 'BS').trim(),
        length: parseFloat(line.Length) || 0,
        noMesin: String(line.NoMesin || header.noMesin || '').trim(),
      });
      continue;
    }

    rollMap.set(rNum, {
      roolNumber: rNum,
      length: parseFloat(line.Length) || 0,
      isUnknownLength: !(parseFloat(line.Length) > 0),
      noMesin: String(line.NoMesin || header.noMesin || '').trim(),
      transDate: String(line.TransDate || '').trim(),
      shift: String(line.Shift || '').trim(),
      createdBy: String(line.CreatedBy || '').trim(),
      isStock: Boolean(line.isStock),
      qrNum: String(line.QrNum || '').trim(),
      joinedPieces: joinedByRoll.get(rNum) || [],
      defects: [],
    });
  }

  // Collect defects and map code descriptions
  const usedCodesMap = new Map();
  let totalPointDefects = 0;
  let totalRangeDefects = 0;

  for (const rawD of rawDefects) {
    const norm = normalizeReportDefect(rawD);
    if (!norm.roolNumber) continue;

    const codeKey = norm.code.toUpperCase();
    if (!usedCodesMap.has(codeKey)) {
      usedCodesMap.set(codeKey, {
        code: norm.code,
        description: norm.description,
        count: 0,
      });
    }
    const codeEntry = usedCodesMap.get(codeKey);
    codeEntry.count += 1;
    if (!codeEntry.description && norm.description) {
      codeEntry.description = norm.description;
    }

    if (norm.kind === 'point') totalPointDefects += 1;
    else totalRangeDefects += 1;

    if (!rollMap.has(norm.roolNumber)) {
      rollMap.set(norm.roolNumber, {
        roolNumber: norm.roolNumber,
        length: 0,
        isUnknownLength: true,
        noMesin: '',
        transDate: '',
        shift: '',
        createdBy: '',
        isStock: false,
        qrNum: '',
        joinedPieces: joinedByRoll.get(norm.roolNumber) || [],
        defects: [],
      });
    }
    rollMap.get(norm.roolNumber).defects.push(norm);
  }

  const allRolls = Array.from(rollMap.values()).sort((a, b) => a.roolNumber - b.roolNumber);
  const defectRolls = allRolls.filter((r) => r.defects.length > 0);
  const okRolls = allRolls.filter((r) => r.defects.length === 0);

  const machinesSet = new Set();
  let totalLengthAllRolls = 0;
  for (const r of allRolls) {
    if (r.noMesin) machinesSet.add(r.noMesin);
    totalLengthAllRolls += r.length || 0;
  }

  const usedCodes = Array.from(usedCodesMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return {
    header,
    defectRolls,
    okRolls,
    coProducts,
    usedCodes,
    stats: {
      totalRolls: allRolls.length,
      totalLength: Math.round(totalLengthAllRolls * 100) / 100,
      defectRollsCount: defectRolls.length,
      okRollsCount: okRolls.length,
      totalDefects: totalPointDefects + totalRangeDefects,
      totalPointDefects,
      totalRangeDefects,
      machines: Array.from(machinesSet).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    },
  };
}

/**
 * Choose clean yard ruler tick positions for a roll of length L.
 * @param {number} effectiveLength
 * @param {number} trackWidthMm
 * @returns {{ majorTicks: Array<{ yard: number, xMm: number, label: string }>, minorTicks: Array<{ yard: number, xMm: number }> }}
 */
export function buildRulerTicks(effectiveLength, trackWidthMm) {
  const L = Math.max(1, effectiveLength);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if (L / s <= 10) {
      step = s;
      break;
    }
  }

  const minorStep = step >= 20 ? step / 4 : (step >= 5 ? step / 5 : 0);
  const majorTicks = [];
  const minorTicks = [];

  const toX = (yd) => (Math.min(L, Math.max(0, yd)) / L) * trackWidthMm;

  majorTicks.push({ yard: 0, xMm: 0, label: '0' });

  for (let yd = step; yd < L; yd += step) {
    const xMm = toX(yd);
    // Avoid label collision with the right-end roll length label
    if (trackWidthMm - xMm >= 11.5) {
      majorTicks.push({ yard: yd, xMm, label: formatYard(yd) });
    } else {
      minorTicks.push({ yard: yd, xMm });
    }
  }

  majorTicks.push({
    yard: L,
    xMm: trackWidthMm,
    label: `${formatYard(L)} yd`,
    isEnd: true,
  });

  if (minorStep > 0) {
    for (let yd = minorStep; yd < L; yd += minorStep) {
      const rem = yd % step;
      if (Math.abs(rem) < 0.001 || Math.abs(rem - step) < 0.001) continue;
      minorTicks.push({ yard: yd, xMm: toX(yd) });
    }
  }

  return { majorTicks, minorTicks };
}

/**
 * Two-pass 1D non-overlapping placement of chips along [0, trackWidthMm].
 * Keeps every chip close to its target anchor X without overflowing or colliding.
 * @param {Array<{ anchorX: number, chipWidthMm: number }>} items
 * @param {number} trackWidthMm
 * @param {number} gapMm
 * @returns {Array<{ chipX: number, chipW: number }>}
 */
export function placeChipsOneRow(items, trackWidthMm, gapMm = REPORT_GEOMETRY.chipGapMm) {
  if (items.length === 0) return [];

  const placed = items.map((item) => {
    const w = item.chipWidthMm;
    const desired = item.anchorX - w / 2;
    const clamped = Math.max(0, Math.min(trackWidthMm - w, desired));
    return { x: clamped, w };
  });

  // Pass 1: push right on overlap
  for (let i = 1; i < placed.length; i++) {
    const minX = placed[i - 1].x + placed[i - 1].w + gapMm;
    if (placed[i].x < minX) {
      placed[i].x = minX;
    }
  }

  // Pass 2: if rightmost chip overflows trackWidthMm, push left cleanly
  const lastIdx = placed.length - 1;
  const overflow = placed[lastIdx].x + placed[lastIdx].w - trackWidthMm;
  if (overflow > 0) {
    placed[lastIdx].x -= overflow;
    for (let i = lastIdx - 1; i >= 0; i--) {
      const maxX = placed[i + 1].x - placed[i].w - gapMm;
      if (placed[i].x > maxX) {
        placed[i].x = maxX;
      }
    }
  }

  return placed.map((p) => ({
    chipX: Math.max(0, p.x),
    chipW: p.w,
  }));
}

/**
 * Compute complete geometric layout for a single roll defect card.
 * Handles:
 *  - 1-point defects
 *  - Multiple defects at the same exact point (clustered with count badge)
 *  - Range defects & multiple defects at the same range (stacked lanes)
 *  - Nested ranges & points inside ranges (container-first sorting + piercing lines)
 *  - Dense nearby defects (Mode A fan-out chips vs Mode B numbered badges + legend grid)
 *
 * @param {object} roll
 * @param {number} trackWidthMm
 * @param {(text: string, fontSizePt: number, isBold?: boolean) => number} [measureText]
 * @returns {object}
 */
export function layoutRollDiagram(
  roll,
  trackWidthMm,
  measureText = estimateTextWidthMm
) {
  const G = REPORT_GEOMETRY;
  const recordedLength = roll.length > 0 ? roll.length : 0;
  const maxDefectYard = Math.max(
    0,
    ...roll.defects.map((d) => Math.max(d.from || 0, d.to || 0))
  );
  const effectiveLength =
    recordedLength > 0
      ? recordedLength
      : Math.max(100, Math.ceil(maxDefectYard * 1.1) || 100);

  const yardToX = (yd) => {
    const clamped = Math.max(0, Math.min(effectiveLength, yd));
    return (clamped / effectiveLength) * trackWidthMm;
  };

  // Separate point and range defects
  const rawPoints = roll.defects
    .filter((d) => d.kind === 'point')
    .sort((a, b) => a.from - b.from || a.lineNumber - b.lineNumber);

  const rawRanges = roll.defects
    .filter((d) => d.kind === 'range')
    .sort(
      (a, b) =>
        a.from - b.from ||
        (b.to - b.from) - (a.to - a.from) ||
        a.to - b.to ||
        a.code.localeCompare(b.code) ||
        a.lineNumber - b.lineNumber
    );

  // Cluster point defects sharing the same coordinate (within 0.01 yd)
  const pointClusters = [];
  for (const pt of rawPoints) {
    const last = pointClusters[pointClusters.length - 1];
    if (last && Math.abs(pt.from - last.yard) <= 0.01) {
      last.items.push(pt);
    } else {
      pointClusters.push({
        kind: 'point',
        yard: pt.from,
        xMm: yardToX(pt.from),
        isOutOfBounds: recordedLength > 0 && (pt.from > recordedLength || pt.from < 0),
        items: [pt],
      });
    }
  }

  for (const cluster of pointClusters) {
    cluster.count = cluster.items.length;
    cluster.codeSummary = summarizeDefectCodes(cluster.items);
    cluster.insideRanges = rawRanges.some(
      (r) => r.from <= cluster.yard + 0.001 && cluster.yard <= r.to + 0.001
    );
    const outMark = cluster.isOutOfBounds ? '*' : '';
    const multTag = cluster.count > 1 ? ` (x${cluster.count})` : '';
    cluster.labelText = `${formatYard(cluster.yard)}${outMark}${multTag}: ${cluster.codeSummary}`;
    cluster.gridLabelText = `${formatYard(cluster.yard)}${outMark} ${cluster.codeSummary}`;
  }

  // Pack range defects into non-overlapping lanes (container/longest first -> nested below)
  const laneLastX1 = [];
  const packedRanges = rawRanges.map((r) => {
    const rawX0 = yardToX(r.from);
    const rawX1 = yardToX(r.to);
    const barW = Math.max(G.minRangeWidthMm, rawX1 - rawX0);
    const barX0 = Math.max(0, Math.min(rawX0, trackWidthMm - barW));
    const barX1 = barX0 + barW;

    let laneIndex = -1;
    for (let i = 0; i < laneLastX1.length; i++) {
      if (barX0 >= laneLastX1[i] + G.minRangeSameLaneGapMm) {
        laneIndex = i;
        break;
      }
    }
    if (laneIndex === -1) {
      laneIndex = laneLastX1.length;
      laneLastX1.push(-Infinity);
    }
    laneLastX1[laneIndex] = barX1;

    const isOutOfBounds =
      recordedLength > 0 && (r.to > recordedLength || r.from < 0);
    const outMark = isOutOfBounds ? '*' : '';

    // Slight lane-based horizontal anchor stagger so identical stacked ranges have distinct leader stems
    const midX = (barX0 + barX1) / 2;
    const maxOffset = Math.min(2.6, Math.max(0.35, barW * 0.24));
    const staggerSteps = [0, -1, 1, -0.55, 0.55, -0.8, 0.8, -0.25, 0.25];
    const stepMul = staggerSteps[laneIndex % staggerSteps.length];
    const anchorX = Math.max(
      barX0 + 0.5,
      Math.min(barX1 - 0.5, midX + stepMul * maxOffset)
    );

    return {
      kind: 'range',
      from: r.from,
      to: r.to,
      code: r.code,
      description: r.description,
      rawX0,
      rawX1,
      barX0,
      barX1,
      barW,
      laneIndex,
      patternIndex: laneIndex % 5,
      anchorX,
      isOutOfBounds,
      labelText: `${formatYard(r.from)}-${formatYard(r.to)}${outMark}: ${r.code}`,
      gridLabelText: `${formatYard(r.from)}-${formatYard(r.to)}${outMark} ${r.code}`,
    };
  });

  const laneCount = laneLastX1.length;

  // Build unified annotation list sorted monotonically by anchorX
  const annotations = [
    ...pointClusters.map((c) => ({
      ...c,
      anchorX: c.xMm,
      sortKind: 0,
      sortLane: -1,
    })),
    ...packedRanges.map((r) => ({
      ...r,
      sortKind: 1,
      sortLane: r.laneIndex,
    })),
  ].sort(
    (a, b) =>
      a.anchorX - b.anchorX ||
      a.sortKind - b.sortKind ||
      a.sortLane - b.sortLane
  );

  // Measure chip widths for Mode A eligibility
  let totalChipsWidth = 0;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    const iconW = a.kind === 'range' ? 3.2 : 2.3;
    const textW = measureText(a.labelText, 6.5, true);
    a.chipWidthMm = Math.max(10.5, iconW + textW + 2.4);
    totalChipsWidth += a.chipWidthMm;
  }
  const totalNeededModeA =
    totalChipsWidth + Math.max(0, annotations.length - 1) * G.chipGapMm;

  const useModeA = annotations.length <= 10 && totalNeededModeA <= trackWidthMm;

  // Assign vertical pin tiers for point clusters so nearby pins never merge
  const tierLastRight = [];
  for (const a of annotations) {
    if (a.kind !== 'point') continue;
    const badgeW = useModeA ? (a.count > 1 ? 3.6 : 2.1) : 4.2;
    const leftEdge = a.xMm - badgeW / 2;
    const rightEdge = a.xMm + badgeW / 2;

    let tier = -1;
    for (let t = 0; t < tierLastRight.length; t++) {
      if (leftEdge >= tierLastRight[t] + G.minPinSameTierGapMm) {
        tier = t;
        break;
      }
    }
    if (tier === -1) {
      tier = tierLastRight.length;
      tierLastRight.push(-Infinity);
    }
    tierLastRight[tier] = rightEdge;
    a.pinTier = tier;
  }

  const pinTierCount = Math.max(1, tierLastRight.length);

  // Mode A vs Mode B placement
  let chips = [];
  let legendGrid = null;
  let overflowRangeBadgeCount = 0;

  if (useModeA) {
    const placed = placeChipsOneRow(annotations, trackWidthMm, G.chipGapMm);
    chips = annotations.map((a, idx) => ({
      ...a,
      chipX: placed[idx].chipX,
      chipW: placed[idx].chipW,
    }));
  } else {
    // Mode B: assign sequential 1..N index badges + compact multi-column grid
    const rangeBadgeTierLastRight = [];
    annotations.forEach((a, idx) => {
      a.badgeIndex = idx + 1;
      if (a.kind === 'range') {
        a.badgeInside = a.barW >= 4.8;
        if (!a.badgeInside) {
          const rBadgeW = a.badgeIndex >= 10 ? 4.0 : 3.2;
          const leftEdge = a.anchorX - rBadgeW / 2;
          const rightEdge = a.anchorX + rBadgeW / 2;
          let rTier = -1;
          for (let t = 0; t < rangeBadgeTierLastRight.length; t++) {
            if (leftEdge >= rangeBadgeTierLastRight[t] + 0.6) {
              rTier = t;
              break;
            }
          }
          if (rTier === -1) {
            rTier = rangeBadgeTierLastRight.length;
            rangeBadgeTierLastRight.push(-Infinity);
          }
          rangeBadgeTierLastRight[rTier] = rightEdge;
          a.rangeBadgeTier = rTier;
        }
      }
    });
    overflowRangeBadgeCount = rangeBadgeTierLastRight.length;

    const maxEntryW = Math.max(
      24,
      ...annotations.map((a) => 5.5 + measureText(a.gridLabelText, 6.4, false))
    );
    const colCount = Math.max(2, Math.min(4, Math.floor(trackWidthMm / (maxEntryW + 2.5))));
    const rowCount = Math.ceil(annotations.length / colCount);
    legendGrid = {
      colCount,
      rowCount,
      colWidthMm: trackWidthMm / colCount,
      items: annotations,
    };
  }

  const rulerTicks = buildRulerTicks(effectiveLength, trackWidthMm);

  // Calculate total vertical height of this roll card
  const lanesTotalH =
    laneCount > 0
      ? laneCount * G.rangeLaneHeightMm + Math.max(0, laneCount - 1) * G.rangeLaneGapMm + 0.5
      : 0;

  const hasTopPill = !useModeA || pointClusters.some((p) => p.count > 1);
  const pinTierStepMm = hasTopPill ? 3.1 : G.pinTierHeightMm;
  const pinZoneH =
    pointClusters.length > 0
      ? pinTierCount * pinTierStepMm + (hasTopPill ? G.pinTopPillPadMm : 0)
      : 1.0;

  const calloutSectionH = useModeA
    ? G.leaderHeightMm + G.chipHeightMm
    : (overflowRangeBadgeCount > 0 ? overflowRangeBadgeCount * 3.0 + 0.6 : 0) +
      G.legendTopGapMm +
      (legendGrid ? legendGrid.rowCount * G.legendRowHeightMm : 0);

  const cardHeightMm =
    G.cardPadTopMm +
    G.rollHeaderHeightMm +
    G.rulerHeightMm +
    pinZoneH +
    G.fabricHeightMm +
    lanesTotalH +
    calloutSectionH +
    G.cardPadBottomMm;

  return {
    roll,
    recordedLength,
    effectiveLength,
    laneCount,
    pinTierCount,
    pinTierStepMm,
    pinZoneH,
    lanesTotalH,
    useModeA,
    annotations,
    chips,
    legendGrid,
    overflowRangeBadgeCount,
    rulerTicks,
    cardHeightMm,
  };
}
