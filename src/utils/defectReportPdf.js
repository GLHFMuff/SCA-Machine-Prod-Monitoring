import { jsPDF } from 'jspdf';
import {
  REPORT_PAGE,
  REPORT_GEOMETRY,
  formatYard,
  prepareOpDefectReport,
  layoutRollDiagram,
} from './defectReportLayout.js';

/**
 * Draw crisp pure-B&W geometric pattern fill inside rect [x, y, w, h]
 * using analytic line clipping (100% viewer/printer safe, zero gray washes).
 * @param {jsPDF} doc
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} patternIndex
 * @param {number} [borderWidth=0.3]
 */
function drawPatternRect(doc, x, y, w, h, patternIndex, borderWidth = 0.3) {
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, 'F');

  doc.setDrawColor(0, 0, 0);

  const drawForwardDiag = (step, lw) => {
    doc.setLineWidth(lw);
    // Lines of form: (px - x) - (py - y) = c  => py = y + px - x - c
    for (let c = -h; c <= w; c += step) {
      const pts = [];
      // Intersect left edge px = x => py = y - c
      const yL = y - c;
      if (yL >= y && yL <= y + h) pts.push([x, yL]);
      // Intersect right edge px = x + w => py = y + w - c
      const yR = y + w - c;
      if (yR >= y && yR <= y + h) pts.push([x + w, yR]);
      // Intersect top edge py = y => px = x + c
      const xT = x + c;
      if (xT > x && xT < x + w) pts.push([xT, y]);
      // Intersect bottom edge py = y + h => px = x + h + c
      const xB = x + h + c;
      if (xB > x && xB < x + w) pts.push([xB, y + h]);

      if (pts.length >= 2) {
        doc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      }
    }
  };

  const drawBackwardDiag = (step, lw) => {
    doc.setLineWidth(lw);
    // Lines of form: (px - x) + (py - y) = c
    for (let c = 0; c <= w + h; c += step) {
      const pts = [];
      const yL = y + c;
      if (yL >= y && yL <= y + h) pts.push([x, yL]);
      const yR = y + c - w;
      if (yR >= y && yR <= y + h) pts.push([x + w, yR]);
      const xT = x + c;
      if (xT > x && xT < x + w) pts.push([xT, y]);
      const xB = x + c - h;
      if (xB > x && xB < x + w) pts.push([xB, y + h]);

      if (pts.length >= 2) {
        doc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      }
    }
  };

  const p = ((patternIndex % 5) + 5) % 5;
  if (p === 0) {
    drawForwardDiag(1.25, 0.22);
  } else if (p === 1) {
    drawBackwardDiag(1.25, 0.22);
  } else if (p === 2) {
    drawForwardDiag(1.65, 0.18);
    drawBackwardDiag(1.65, 0.18);
  } else if (p === 3) {
    doc.setLineWidth(0.24);
    for (let px = x + 0.8; px < x + w - 0.2; px += 1.05) {
      doc.line(px, y, px, y + h);
    }
  } else {
    // Pattern 4: Crisp horizontal double band + ticks
    doc.setLineWidth(0.24);
    const y1 = y + h * 0.34;
    const y2 = y + h * 0.66;
    doc.line(x, y1, x + w, y1);
    doc.line(x, y2, x + w, y2);
    doc.setLineWidth(0.2);
    for (let px = x + 1.0; px < x + w - 0.3; px += 1.4) {
      doc.line(px, y1, px, y2);
    }
  }

  doc.setLineWidth(borderWidth);
  doc.rect(x, y, w, h, 'S');
}

/**
 * Draw a downward solid black pointer triangle centered at x, tip at tipY.
 * @param {jsPDF} doc
 * @param {number} cx
 * @param {number} tipY
 * @param {number} width
 * @param {number} height
 */
function drawDownTriangle(doc, cx, tipY, width = 1.9, height = 1.6) {
  doc.setFillColor(0, 0, 0);
  doc.triangle(
    cx - width / 2,
    tipY - height,
    cx + width / 2,
    tipY - height,
    cx,
    tipY,
    'F'
  );
}

/**
 * Draw crisp numbered badge pill (black or white-filled).
 * @param {jsPDF} doc
 * @param {number} cx
 * @param {number} cy
 * @param {string|number} text
 * @param {boolean} [inverted=false]
 */
function drawBadgePill(doc, cx, cy, text, inverted = false) {
  const s = String(text);
  const w = s.length >= 2 ? 3.8 : 2.9;
  const h = 2.4;
  const x = cx - w / 2;
  const y = cy - h / 2;

  if (inverted) {
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 0.6, 0.6, 'FD');
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.24);
    doc.roundedRect(x, y, w, h, 0.6, 0.6, 'FD');
    doc.setTextColor(0, 0, 0);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.text(s, cx, cy + 0.72, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

/**
 * Format local timestamp DD/MM/YYYY HH:mm
 * @returns {string}
 */
function getFormattedTimestamp() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Draw the main OP header on Page 1 and return next available Y coordinate.
 * @param {jsPDF} doc
 * @param {object} report
 * @param {number} usableWidth
 * @returns {number}
 */
function drawPage1Header(doc, report, usableWidth) {
  const x0 = REPORT_PAGE.marginLeftMm;
  const y0 = REPORT_PAGE.marginTopMm;
  const { header, stats, okRolls, coProducts } = report;

  // Pre-wrap OK rolls line if present
  let okRollLines = [];
  if (okRolls.length > 0) {
    const okText = `Roll OK (0 inspeksi, ${okRolls.length} roll): ${okRolls
      .map((r) => `#${r.roolNumber}`)
      .join(', ')}`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    okRollLines = doc.splitTextToSize(okText, usableWidth - 5);
  }

  const coProdText =
    coProducts.length > 0
      ? `  |  Co-Prod: ${coProducts
          .map((c) => `${c.inventStatus} ${formatYard(c.length)}yd`)
          .join(', ')}`
      : '';

  const baseHeight = 14.2;
  const okSectionH = okRollLines.length > 0 ? okRollLines.length * 3.1 + 1.2 : 0;
  const totalHeaderH = baseHeight + okSectionH;

  // Outer header border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.38);
  doc.setFillColor(255, 255, 255);
  doc.rect(x0, y0, usableWidth, totalHeaderH, 'FD');

  // Top solid black banner (high contrast for kertas buram)
  doc.setFillColor(0, 0, 0);
  doc.rect(x0, y0, usableWidth, 5.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.text('LAPORAN INSPEKSI KAIN PER OP', x0 + 2.5, y0 + 3.65);

  doc.setFontSize(8.2);
  const rightBanner = `OP: ${header.prodId || '-'}   |   DO: ${header.seqmentNum || '-'}`;
  doc.text(rightBanner, x0 + usableWidth - 2.5, y0 + 3.65, { align: 'right' });

  // Metadata row
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.1);
  const orderText = header.orderQty > 0 ? `${formatYard(header.orderQty)} yd` : '-';
  const mesinText =
    stats.machines.length > 0
      ? stats.machines.map((m) => `M-${m}`).join(', ')
      : header.noMesin
        ? `M-${header.noMesin}`
        : '-';
  const metaLine = `Cust: ${header.custCode}   |   Design: ${header.designCode}   |   Warna: ${header.color}   |   Order: ${orderText}   |   Mesin: ${mesinText}`;
  doc.text(metaLine, x0 + 2.5, y0 + 8.9, { maxWidth: usableWidth - 5 });

  // Thin horizontal divider
  doc.setLineWidth(0.15);
  doc.line(x0 + 2, y0 + 10.2, x0 + usableWidth - 2, y0 + 10.2);

  // Summary stats row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  const summaryLine = `Total Roll: ${stats.totalRolls} (${formatYard(stats.totalLength)} yd)  |  Roll Inspeksi: ${stats.defectRollsCount}  |  Total Inspeksi: ${stats.totalDefects} (${stats.totalPointDefects} titik, ${stats.totalRangeDefects} range)${coProdText}`;
  doc.text(summaryLine, x0 + 2.5, y0 + 13.3, { maxWidth: usableWidth - 5 });

  if (okRollLines.length > 0) {
    doc.setLineWidth(0.15);
    doc.line(x0 + 2, y0 + 14.3, x0 + usableWidth - 2, y0 + 14.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.text(okRollLines, x0 + 2.5, y0 + 17.1);
  }

  return y0 + totalHeaderH + 2.2;
}

/**
 * Draw compact continuation header on Page 2+ and return next available Y.
 * @param {jsPDF} doc
 * @param {object} report
 * @param {number} usableWidth
 * @returns {number}
 */
function drawContinuationHeader(doc, report, usableWidth) {
  const x0 = REPORT_PAGE.marginLeftMm;
  const y0 = REPORT_PAGE.marginTopMm;
  const { header } = report;

  doc.setFillColor(0, 0, 0);
  doc.rect(x0, y0, usableWidth, 4.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.text(`LAPORAN INSPEKSI KAIN — OP: ${header.prodId} (Lanjutan)`, x0 + 2.5, y0 + 3.35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.1);
  doc.text(
    `DO: ${header.seqmentNum}  |  ${header.designCode}  |  ${header.color}`,
    x0 + usableWidth - 2.5,
    y0 + 3.35,
    { align: 'right' }
  );
  doc.setTextColor(0, 0, 0);

  return y0 + 6.8;
}

/**
 * Draw one single Roll visual diagram card at yPos.
 * @param {jsPDF} doc
 * @param {object} layout - output of layoutRollDiagram
 * @param {number} yPos
 * @param {number} cardX
 * @param {number} cardW
 * @param {number} trackOffsetX
 * @param {number} trackW
 */
function drawRollCard(doc, layout, yPos, cardX, cardW, trackOffsetX, trackW) {
  const G = REPORT_GEOMETRY;
  const { roll, effectiveLength, rulerTicks, useModeA, annotations, chips, legendGrid } = layout;
  const trackX = cardX + trackOffsetX;
  const h = layout.cardHeightMm;

  // Card outer box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.28);
  doc.rect(cardX, yPos, cardW, h, 'FD');

  // 1. Roll Header Strip
  const hdrY = yPos + G.cardPadTopMm;
  const rollLabel = `ROLL #${String(roll.roolNumber).padStart(2, '0')}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  const badgeW = Math.max(15.5, doc.getTextWidth(rollLabel) + 3.6);
  doc.setFillColor(0, 0, 0);
  doc.rect(cardX + 2.0, hdrY, badgeW, 3.35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(rollLabel, cardX + 2.0 + badgeW / 2, hdrY + 2.48, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  let infoX = cardX + 2.0 + badgeW + 2.2;
  const lengthLabel = roll.isUnknownLength
    ? `Panjang: ? (est. ${formatYard(effectiveLength)} yd)`
    : `${formatYard(roll.length)} yd`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(lengthLabel, infoX, hdrY + 2.52);
  infoX += doc.getTextWidth(lengthLabel) + 2.0;

  const metaParts = [];
  if (roll.noMesin) metaParts.push(`M-${roll.noMesin}`);
  if (roll.transDate) metaParts.push(roll.transDate);
  if (roll.shift) metaParts.push(`Shift ${roll.shift}`);
  if (roll.isStock) metaParts.push('STOCK');
  if (roll.joinedPieces?.length > 0) {
    metaParts.push(`JP: ${roll.joinedPieces.map(formatYard).join(', ')} yd`);
  }

  if (metaParts.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.text(`|  ${metaParts.join('  |  ')}`, infoX, hdrY + 2.52);
  }

  // Right-side defect count summary
  const ptCnt = roll.defects.filter((d) => d.kind === 'point').length;
  const rgCnt = roll.defects.filter((d) => d.kind === 'range').length;
  const countParts = [];
  if (ptCnt > 0) countParts.push(`${ptCnt} titik`);
  if (rgCnt > 0) countParts.push(`${rgCnt} range`);
  const rightSummary = `${roll.defects.length} Inspeksi (${countParts.join(', ')})`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.9);
  doc.text(rightSummary, cardX + cardW - 2.2, hdrY + 2.7, { align: 'right' });

  // Header bottom hairline
  doc.setLineWidth(0.14);
  doc.line(cardX + 1.8, hdrY + G.rollHeaderHeightMm - 0.1, cardX + cardW - 1.8, hdrY + G.rollHeaderHeightMm - 0.1);

  // 2. Yard Ruler
  const rulerTopY = hdrY + G.rollHeaderHeightMm;
  const rulerBaseY = rulerTopY + G.rulerHeightMm;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.line(trackX, rulerBaseY, trackX + trackW, rulerBaseY);

  doc.setLineWidth(0.12);
  for (const mt of rulerTicks.minorTicks) {
    const tx = trackX + mt.xMm;
    doc.line(tx, rulerBaseY - 0.65, tx, rulerBaseY);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.7);
  doc.setLineWidth(0.18);
  for (const mj of rulerTicks.majorTicks) {
    const tx = trackX + mj.xMm;
    doc.line(tx, rulerBaseY - 1.15, tx, rulerBaseY);
    if (mj.yard === 0) {
      doc.text(mj.label, tx, rulerBaseY - 1.45, { align: 'left' });
    } else if (mj.isEnd) {
      doc.text(mj.label, cardX + cardW - 2.0, rulerBaseY - 1.45, { align: 'right' });
    } else {
      doc.text(mj.label, tx, rulerBaseY - 1.45, { align: 'center' });
    }
  }

  // 3. Coordinate bands for Pin Zone, Fabric Strip, and Range Lanes
  const fabricTopY = rulerBaseY + layout.pinZoneH;
  const fabricBottomY = fabricTopY + G.fabricHeightMm;
  const lanesTopY = fabricBottomY + 0.5;
  const lanesBottomY =
    layout.laneCount > 0 ? fabricBottomY + layout.lanesTotalH : fabricBottomY;

  // 4. Draw Fabric Roll Strip
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.38);
  doc.rect(trackX, fabricTopY, trackW, G.fabricHeightMm, 'FD');

  // Subtle dashed guide lines dropping from fabric strip down to each range bar's edges
  const rangeItems = annotations.filter((a) => a.kind === 'range');
  if (rangeItems.length > 0) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.14);
    doc.setLineDashPattern([0.6, 0.5], 0);
    for (const r of rangeItems) {
      const ly = lanesTopY + r.laneIndex * (G.rangeLaneHeightMm + G.rangeLaneGapMm);
      const xStart = trackX + r.barX0;
      const xEnd = trackX + r.barX1;
      doc.line(xStart, fabricTopY, xStart, ly);
      doc.line(xEnd, fabricTopY, xEnd, ly);
    }
    doc.setLineDashPattern([], 0);
  }

  // 5. Draw Range Lanes
  for (const r of rangeItems) {
    const ly = lanesTopY + r.laneIndex * (G.rangeLaneHeightMm + G.rangeLaneGapMm);
    const rx = trackX + r.barX0;
    drawPatternRect(doc, rx, ly, r.barW, G.rangeLaneHeightMm, r.patternIndex, 0.32);

    if (useModeA) {
      // Draw crisp anchor stem from bar bottom down to lanesBottomY + small dot inside bar
      const ax = trackX + r.anchorX;
      const midY = ly + G.rangeLaneHeightMm / 2;
      doc.setFillColor(255, 255, 255);
      doc.circle(ax, midY, 0.72, 'F');
      doc.setFillColor(0, 0, 0);
      doc.circle(ax, midY, 0.48, 'F');
      if (ly + G.rangeLaneHeightMm < lanesBottomY) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.16);
        doc.setLineDashPattern([0.45, 0.4], 0);
        doc.line(ax, ly + G.rangeLaneHeightMm, ax, lanesBottomY);
        doc.setLineDashPattern([], 0);
      }
    } else if (r.badgeInside) {
      drawBadgePill(doc, rx + r.barW / 2, ly + G.rangeLaneHeightMm / 2, r.badgeIndex, false);
    } else {
      const ax = trackX + r.anchorX;
      const badgeCenterY = lanesBottomY + 1.5 + r.rangeBadgeTier * 3.0;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.16);
      doc.line(ax, ly + G.rangeLaneHeightMm, ax, badgeCenterY - 1.2);
      drawBadgePill(doc, ax, badgeCenterY, r.badgeIndex, false);
    }
  }

  // 6. Draw Point Defect Cuts & Piercing Lines + Pin Markers (drawn AFTER lanes so piercing lines are visible!)
  const pointItems = annotations.filter((a) => a.kind === 'point');
  for (const p of pointItems) {
    const px = trackX + p.xMm;

    // Vertical solid cut line through fabric strip
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(p.count > 1 ? 0.52 : 0.36);
    doc.line(px, fabricTopY, px, fabricBottomY);

    // If range lanes exist and point falls inside (or needs leader), draw crisp piercing line
    if (layout.laneCount > 0 && (p.insideRanges || useModeA)) {
      if (p.insideRanges) {
        // White halo casing so dashed cut-line remains legible over hatch patterns
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.55);
        doc.line(px, fabricBottomY + 0.1, px, lanesBottomY);
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.24);
      doc.setLineDashPattern([0.75, 0.45], 0);
      doc.line(px, fabricBottomY, px, lanesBottomY);
      doc.setLineDashPattern([], 0);
    }

    // Top pin stem & marker above fabric strip
    const tierOffset = p.pinTier * layout.pinTierStepMm;
    const tipY = fabricTopY - 0.15 - tierOffset;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.line(px, fabricTopY, px, tipY);

    if (useModeA) {
      if (p.count > 1) {
        drawDownTriangle(doc, px, tipY, 1.8, 1.0);
        drawBadgePill(doc, px, tipY - 1.55, `x${p.count}`, true);
      } else {
        drawDownTriangle(doc, px, tipY, 1.9, 1.55);
      }
    } else {
      drawDownTriangle(doc, px, tipY, 1.4, 0.85);
      drawBadgePill(doc, px, tipY - 1.55, p.badgeIndex, p.count > 1);
    }
  }

  // 7. Callout Layer: Mode A (Fan-Out Chips) vs Mode B (Multi-Column Grid)
  if (useModeA && chips.length > 0) {
    const chipTopY = lanesBottomY + G.leaderHeightMm;
    for (const c of chips) {
      const anchorXAbs = trackX + c.anchorX;
      const chipXAbs = trackX + c.chipX;
      const chipCenterX = chipXAbs + c.chipW / 2;

      // Leader line from lanesBottomY to chipTopY (guaranteed non-crossing!)
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.17);
      doc.line(anchorXAbs, lanesBottomY, chipCenterX, chipTopY);

      // Chip box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.rect(chipXAbs, chipTopY, c.chipW, G.chipHeightMm, 'FD');

      // Glyph inside chip
      let textStartX;
      if (c.kind === 'range') {
        drawPatternRect(doc, chipXAbs + 0.9, chipTopY + 0.55, 2.3, 2.3, c.patternIndex, 0.22);
        textStartX = chipXAbs + 3.8;
      } else {
        drawDownTriangle(doc, chipXAbs + 1.8, chipTopY + 2.45, 1.5, 1.4);
        textStartX = chipXAbs + 3.0;
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(c.labelText, textStartX, chipTopY + 2.38);
    }
  } else if (!useModeA && legendGrid) {
    const rangeOverflowH =
      layout.overflowRangeBadgeCount > 0 ? layout.overflowRangeBadgeCount * 3.0 + 0.6 : 0;
    const gridTopY = lanesBottomY + rangeOverflowH + G.legendTopGapMm;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.14);
    doc.line(trackX, gridTopY - 0.6, trackX + trackW, gridTopY - 0.6);

    const { colCount, colWidthMm, items } = legendGrid;
    items.forEach((item, idx) => {
      const col = idx % colCount;
      const row = Math.floor(idx / colCount);
      const cellX = trackX + col * colWidthMm;
      const cellY = gridTopY + row * G.legendRowHeightMm;

      drawBadgePill(doc, cellX + 1.9, cellY + 1.75, item.badgeIndex, item.kind === 'point' && item.count > 1);

      let labelX = cellX + 4.4;
      if (item.kind === 'range') {
        drawPatternRect(doc, labelX, cellY + 0.7, 2.1, 2.1, item.patternIndex, 0.2);
        labelX += 2.7;
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      const availW = colWidthMm - (labelX - cellX) - 1.2;
      let txt = item.labelText;
      if (doc.getTextWidth(txt) > availW) {
        txt = item.gridLabelText;
      }
      doc.text(txt, labelX, cellY + 2.35, { maxWidth: availW });
    });
  }
}

/**
 * Draw bottom defect code legend + visual symbol guide box.
 * @param {jsPDF} doc
 * @param {object} report
 * @param {number} yPos
 * @param {number} x0
 * @param {number} usableWidth
 * @returns {number} height drawn
 */
function measureLegendBoxHeight(doc, report, usableWidth) {
  const codesText =
    report.usedCodes.length > 0
      ? `Kode Inspeksi: ${report.usedCodes
          .map((c) => `${c.code}=${c.description || c.code} (${c.count})`)
          .join('   |   ')}`
      : 'Kode Inspeksi: -';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const wrapped = doc.splitTextToSize(codesText, usableWidth - 5);
  return 6.2 + wrapped.length * 3.1;
}

function drawLegendBox(doc, report, yPos, x0, usableWidth) {
  const codesText =
    report.usedCodes.length > 0
      ? `Kode Inspeksi: ${report.usedCodes
          .map((c) => `${c.code}=${c.description || c.code} (${c.count})`)
          .join('   |   ')}`
      : 'Kode Inspeksi: -';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const wrapped = doc.splitTextToSize(codesText, usableWidth - 5);
  const boxH = 6.2 + wrapped.length * 3.1;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x0, yPos, usableWidth, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  let lx = x0 + 2.2;
  const symY = yPos + 3.4;
  doc.text('Simbol:', lx, symY);
  lx += doc.getTextWidth('Simbol:') + 2.2;

  drawDownTriangle(doc, lx + 0.9, symY + 0.1, 1.8, 1.5);
  lx += 2.6;
  doc.setFont('helvetica', 'normal');
  doc.text('= Inspeksi 1 Titik   |', lx, symY);
  lx += doc.getTextWidth('= Inspeksi 1 Titik   |') + 2.0;

  drawBadgePill(doc, lx + 1.8, symY - 0.8, 'x2', true);
  lx += 4.2;
  doc.text('= >1 Inspeksi di Titik Sama   |', lx, symY);
  lx += doc.getTextWidth('= >1 Inspeksi di Titik Sama   |') + 2.0;

  drawPatternRect(doc, lx, symY - 1.9, 2.8, 2.2, 0, 0.22);
  lx += 3.5;
  doc.text('= Range (Bertingkat = Overlap/Nested)   |   * = Melebihi Panjang Roll', lx, symY);

  doc.setLineWidth(0.12);
  doc.line(x0 + 2, yPos + 4.5, x0 + usableWidth - 2, yPos + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(wrapped, x0 + 2.2, yPos + 7.2);

  return boxH;
}

/**
 * Draw consistent monochrome page footer on every page.
 * @param {jsPDF} doc
 * @param {number} pageNum
 * @param {number} totalPages
 * @param {string} printedAt
 */
function drawPageFooter(doc, pageNum, totalPages, printedAt) {
  const x0 = REPORT_PAGE.marginLeftMm;
  const usableW = REPORT_PAGE.widthMm - REPORT_PAGE.marginLeftMm - REPORT_PAGE.marginRightMm;
  const footerY = REPORT_PAGE.heightMm - REPORT_PAGE.marginBottomMm;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.line(x0, footerY - 3.6, x0 + usableW, footerY - 3.6);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.text('Sumber: CountingKainDefect • Format Monokrom (Kertas Buram)', x0, footerY - 0.8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Dicetak: ${printedAt}   |   Hal ${pageNum} / ${totalPages}`, x0 + usableW, footerY - 0.8, {
    align: 'right',
  });
}

/**
 * Build jsPDF instance for the OP Defect Visual Report.
 * Exported separately from download trigger so Node.js verification can inspect output directly.
 * @param {object} rawReportData - { header, lines, defects, joinedPieces }
 * @param {object} [fallbackProdData]
 * @returns {{ doc: jsPDF, report: object, pageCount: number, filename: string }}
 */
export function buildDefectReportPdfDocument(rawReportData, fallbackProdData = {}) {
  const report = prepareOpDefectReport(rawReportData, fallbackProdData);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const usableWidth =
    REPORT_PAGE.widthMm - REPORT_PAGE.marginLeftMm - REPORT_PAGE.marginRightMm;
  const cardX = REPORT_PAGE.marginLeftMm;
  const trackOffsetX = 4.0;
  const trackW = usableWidth - 10.0; // 4mm left, 6mm right for end yard label
  const pageContentBottomY = REPORT_PAGE.heightMm - REPORT_PAGE.marginBottomMm - 5.0;

  const measureText = (text, fontSizePt, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSizePt);
    return doc.getTextWidth(String(text || ''));
  };

  let cursorY = drawPage1Header(doc, report, usableWidth);

  if (report.defectRolls.length === 0) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.28);
    doc.rect(cardX, cursorY, usableWidth, 22, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      'TIDAK ADA DATA INSPEKSI DI COUNTINGKAINDEFECT UNTUK OP INI',
      cardX + usableWidth / 2,
      cursorY + 9.5,
      { align: 'center' }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(
      report.stats.totalRolls > 0
        ? `Seluruh ${report.stats.totalRolls} roll produksi pada OP ini berstatus OK (0 titik inspeksi).`
        : 'Belum ada roll produksi atau catatan inspeksi yang tersimpan pada OP ini.',
      cardX + usableWidth / 2,
      cursorY + 15.2,
      { align: 'center' }
    );
    cursorY += 25;
  } else {
    const rollLayouts = report.defectRolls.map((roll) =>
      layoutRollDiagram(roll, trackW, measureText)
    );

    for (let i = 0; i < rollLayouts.length; i++) {
      const rl = rollLayouts[i];
      if (cursorY + rl.cardHeightMm > pageContentBottomY) {
        doc.addPage();
        cursorY = drawContinuationHeader(doc, report, usableWidth);
      }

      drawRollCard(doc, rl, cursorY, cardX, usableWidth, trackOffsetX, trackW);
      cursorY += rl.cardHeightMm + REPORT_GEOMETRY.cardGapMm;
    }

    // Draw legend box at the end (add page if it won't fit cleanly above footer)
    const legendH = measureLegendBoxHeight(doc, report, usableWidth);
    if (cursorY + legendH > pageContentBottomY) {
      doc.addPage();
      cursorY = drawContinuationHeader(doc, report, usableWidth);
    }
    drawLegendBox(doc, report, cursorY, cardX, usableWidth);
  }

  // Stamp page footers with accurate X / Y page counts
  const totalPages = doc.getNumberOfPages();
  const printedAt = getFormattedTimestamp();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawPageFooter(doc, p, totalPages, printedAt);
  }

  const safeProdId = (report.header.prodId || 'OP').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const filename = `Laporan_Inspeksi_${safeProdId}_${ymd}.pdf`;

  return { doc, report, pageCount: totalPages, filename };
}

/**
 * Generate and trigger immediate browser PDF download for the OP Defect Visual Report.
 * @param {object} rawReportData
 * @param {object} [fallbackProdData]
 * @returns {{ filename: string, pageCount: number, report: object }}
 */
export function downloadDefectReportPdf(rawReportData, fallbackProdData = {}) {
  const { doc, report, pageCount, filename } = buildDefectReportPdfDocument(
    rawReportData,
    fallbackProdData
  );
  doc.save(filename);
  return { filename, pageCount, report };
}
