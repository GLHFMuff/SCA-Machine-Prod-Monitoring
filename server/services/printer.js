import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PS_SCRIPT_PATH = path.resolve(__dirname, 'direct-print.ps1');

/**
 * Run direct-print.ps1 helper with arguments
 * @param {string[]} args
 * @returns {Promise<any>}
 */
function runPrintScript(args) {
  return new Promise((resolve, reject) => {
    const fullArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS_SCRIPT_PATH,
      ...args,
    ];

    execFile('powershell.exe', fullArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const errorMsg = stderr ? stderr.trim() : (err.message || 'Unknown PowerShell error');
        return reject(new Error(errorMsg));
      }

      try {
        const trimmed = stdout.trim();
        const json = JSON.parse(trimmed);
        resolve(json);
      } catch (parseErr) {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

/**
 * List all installed Windows printers
 */
export async function listPrinters() {
  const res = await runPrintScript(['-Action', 'list']);
  const printers = res?.printers || [];
  const defaultPrinter = printers.find((p) => p.isDefault)?.name || (printers[0]?.name ?? null);
  const zebraPrinter = printers.find((p) => p.isZebra)?.name || null;

  return {
    success: true,
    printers,
    defaultPrinter,
    zebraPrinter,
  };
}

/**
 * Sanitize text for ZPL field data (^FD...^FS)
 */
function sanitizeZpl(val) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\^/g, '') // remove carets
    .replace(/~/g, '')  // remove tildes
    .trim();
}

/**
 * Generate 203 DPI ZPL code for Roll Label (100mm x 50mm Landscape)
 * @param {object} data
 * @returns {string} ZPL formatted code
 */
export function generateRollLabelZpl(data) {
  const rollNum = sanitizeZpl(data.rollNum || '01');
  const cdDesignTitle = sanitizeZpl(data.cdDesignTitle || 'CD A0301').toUpperCase();
  const color = sanitizeZpl(data.color || 'WARNA WARNI').toUpperCase();
  const kodeDesign = sanitizeZpl(data.kodeDesign || 'A0301').toUpperCase();
  const dateStr = sanitizeZpl(data.dateStr || '');
  const lengthInchStr = sanitizeZpl(data.lengthInchStr || '52"');
  const qtyStr = sanitizeZpl(data.qtyStr || '0 YARD');
  const breakdownStr = sanitizeZpl(data.breakdownStr || '');
  const barcodeContent = sanitizeZpl(data.barcodeContent || 'QR.S.0000.00000000;;;;0;');
  const qrLabel = sanitizeZpl(data.qrLabel || '');
  const k3lNumber = sanitizeZpl(data.k3lNumber || '20-D-001909');
  const isStockRoll = Boolean(data.isStockRoll);

  // Dynamic header font size depending on title length
  let headerFontH = 30;
  let headerFontW = 28;
  if (cdDesignTitle.length > 22 || color.length > 22) {
    headerFontH = 22;
    headerFontW = 20;
  } else if (cdDesignTitle.length > 15 || color.length > 15) {
    headerFontH = 26;
    headerFontW = 24;
  }

  const zplLines = [
    '^XA',
    '^PW800',           // 100 mm width (8 dots/mm = 800 dots)
    '^LL400',           // 50 mm height (400 dots)
    '^LH0,0',
    '^CI28',            // UTF-8 encoding

    // Outer border (98mm x 48mm)
    '^FO16,12^GB768,376,3^FS',

    // 1. Header (Centered CD Title & Color)
    `^FO24,24^FB752,1,0,C^A0N,${headerFontH},${headerFontW}^FD${cdDesignTitle}^FS`,
    `^FO24,56^FB752,1,0,C^A0N,${headerFontH},${headerFontW}^FD${color}^FS`,

    // 2. Left Body: QR Code (23mm x 23mm, model 2, magnification 5)
    // ^BQN,2,5 => Model 2, Magnification 5
    // ^FDQA,... => Auto data input mode, Error Correction Level M
    `^FO45,98^BQN,2,5^FDQA,${barcodeContent}^FS`,
  ];

  // QR label text below QR code (if present)
  if (qrLabel) {
    zplLines.push(`^FO30,266^FB200,2,0,C^A0N,16,14^FD${qrLabel}^FS`);
  }

  // 3. Right Body: Details Grid
  zplLines.push(
    `^FO250,96^A0N,28,26^FDNO. ROLL^FS`,
    `^FO450,96^A0N,28,26^FD:^FS`,
    `^FO475,96^A0N,28,26^FD${rollNum}^FS`,

    `^FO250,128^A0N,28,26^FDKODE DESIGN^FS`,
    `^FO450,128^A0N,28,26^FD:^FS`,
    `^FO475,128^A0N,28,26^FD${kodeDesign}^FS`,

    `^FO250,160^A0N,28,26^FDDATE^FS`,
    `^FO450,160^A0N,28,26^FD:^FS`,
    `^FO475,160^A0N,28,26^FD${dateStr}^FS`,

    `^FO250,192^A0N,28,26^FDLENGTH^FS`,
    `^FO450,192^A0N,28,26^FD:^FS`,
    `^FO475,192^A0N,28,26^FD${lengthInchStr}^FS`,

    `^FO250,224^A0N,28,26^FDQTY^FS`,
    `^FO450,224^A0N,28,26^FD:^FS`,
    `^FO475,224^A0N,28,26^FD${qtyStr}^FS`
  );

  // Breakdown line underneath QTY
  if (breakdownStr) {
    zplLines.push(`^FO475,254^A0N,18,16^FD${breakdownStr}^FS`);
  }

  // 4. Bottom Registration Area
  zplLines.push(
    `^FO24,332^FB730,1,0,C^A0N,18,16^FDNo Claim After Cutting  -  Setelah potong, klaim tidak diterima^FS`,
    `^FO24,354^FB730,1,0,C^A0N,18,16^FDNOMOR REGISTRASI BARANG K3L : ${k3lNumber}^FS`
  );

  // Stock Badge 'S' at bottom right
  if (isStockRoll) {
    zplLines.push(`^FO746,340^A0N,32,30^FDS^FS`);
  }

  zplLines.push('^XZ');
  return zplLines.join('\n');
}

/**
 * Generate 203 DPI ZPL code for E-Ticket (70mm x 110mm Portrait)
 * @param {object} data
 * @returns {string} ZPL formatted code
 */
export function generateETicketZpl(data) {
  const rollNum = sanitizeZpl(data.rollNum || '01');
  const boxTopTitle = sanitizeZpl(data.boxTopTitle || 'CD A0301').toUpperCase();
  const motif = sanitizeZpl(data.motif || 'WARNA WARNI').toUpperCase();
  const tableKodeDesign = sanitizeZpl(data.tableKodeDesign || data.kodeDesign || 'A0301').toUpperCase();
  const dateStr = sanitizeZpl(data.dateStr || '');
  const lengthStr = sanitizeZpl(data.lengthStr || '52"');
  const qtyStr = sanitizeZpl(data.qtyStr || '0 YARD');
  const breakdownStr = sanitizeZpl(data.breakdownStr || '');
  const qrUrl = sanitizeZpl(data.qrUrl || 'https://linktr.ee/rayoncunda');
  const qrLabel = sanitizeZpl(data.qrLabel || 'linktr.ee/rayoncunda');
  const k3lNumber = sanitizeZpl(data.k3lNumber || '20-D-001909');

  const zplLines = [
    '^XA',
    '^PW560',           // 70 mm width (8 dots/mm = 560 dots)
    '^LL880',           // 110 mm height (880 dots)
    '^LH0,0',
    '^CI28',            // UTF-8 encoding

    // Header (Company info)
    '^FO20,24^FB520,1,0,C^A0N,28,26^FDRAYON CUNDA^FS',
    '^FO20,54^FB520,1,0,C^A0N,18,16^FDTersono, Kec. Tersono - Batang^FS',

    // Main Box (70mm x 110mm, rounded frame)
    '^FO16,84^GB528,710,3,R16^FS',

    // Box Titles (Centered)
    `^FO24,106^FB512,1,0,C^A0N,30,28^FD${boxTopTitle}^FS`,
    `^FO24,140^FB512,1,0,C^A0N,26,24^FD${motif}^FS`,

    // Body: QR Code (23mm = ~184 dots)
    `^FO32,190^BQN,2,4^FDQA,${qrUrl}^FS`,
  ];

  if (qrLabel) {
    zplLines.push(`^FO24,332^FB170,2,0,C^A0N,16,14^FD${qrLabel}^FS`);
  }

  // Details Grid
  zplLines.push(
    `^FO195,190^A0N,22,20^FDNO. ROLL^FS^FO340,190^A0N,22,20^FD:^FS^FO360,190^A0N,22,20^FD${rollNum}^FS`,
    `^FO195,225^A0N,22,20^FDKODE DESIGN^FS^FO340,225^A0N,22,20^FD:^FS^FO360,225^A0N,22,20^FD${tableKodeDesign}^FS`,
    `^FO195,260^A0N,22,20^FDDATE^FS^FO340,260^A0N,22,20^FD:^FS^FO360,260^A0N,22,20^FD${dateStr}^FS`,
    `^FO195,295^A0N,22,20^FDLENGTH^FS^FO340,295^A0N,22,20^FD:^FS^FO360,295^A0N,22,20^FD${lengthStr}^FS`,
    `^FO195,330^A0N,22,20^FDQTY^FS^FO340,330^A0N,22,20^FD:^FS^FO360,330^A0N,22,20^FD${qtyStr}^FS`
  );

  if (breakdownStr) {
    zplLines.push(`^FO360,358^A0N,18,16^FD${breakdownStr}^FS`);
  }

  // Bottom Registration Area
  zplLines.push(
    `^FO20,815^FB520,1,0,C^A0N,18,16^FDNOMOR REGISTRASI BARANG K3L^FS`,
    `^FO20,838^FB520,1,0,C^A0N,18,16^FD${k3lNumber}^FS`
  );

  zplLines.push('^XZ');
  return zplLines.join('\n');
}

/**
 * Send raw data (ZPL/ESC-POS) to Windows printer
 */
export async function printRaw(printerName, contentString) {
  const contentBase64 = Buffer.from(contentString, 'utf-8').toString('base64');
  return runPrintScript([
    '-Action',
    'print-raw',
    '-PrinterName',
    printerName,
    '-ContentBase64',
    contentBase64,
  ]);
}

/**
 * Send image (base64) to Windows printer using GDI/System.Drawing
 */
export async function printImage(printerName, base64Data) {
  // Strip data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  const tmpFile = path.join(os.tmpdir(), `roll-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  await fs.promises.writeFile(tmpFile, buffer);

  try {
    const res = await runPrintScript([
      '-Action',
      'print-image',
      '-PrinterName',
      printerName,
      '-ImagePath',
      tmpFile,
    ]);
    return res;
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

/**
 * Unified direct print handler for roll labels and e-tickets
 */
export async function printRollLabelDirect({ printerName, labelData, rawZpl, imageBase64, ticketType = 'roll-label' }) {
  if (!printerName) {
    throw new Error('Nama printer belum ditentukan.');
  }

  const isZebra = /ZDesigner|Zebra|ZPL/i.test(printerName);

  // If printer is Zebra or raw ZPL is requested / generated
  if (isZebra || rawZpl || (!imageBase64 && labelData)) {
    let zpl = rawZpl;
    if (!zpl && labelData) {
      zpl = ticketType === 'eticket'
        ? generateETicketZpl(labelData)
        : generateRollLabelZpl(labelData);
    }
    const result = await printRaw(printerName, zpl);
    return {
      success: true,
      mode: 'raw-zpl',
      printerName,
      ticketType,
      message: result?.message || `Tiket/Label berhasil dicetak ke ${printerName}`,
    };
  }

  // Otherwise, fallback to GDI image print
  if (imageBase64) {
    const result = await printImage(printerName, imageBase64);
    return {
      success: true,
      mode: 'image',
      printerName,
      ticketType,
      message: result?.message || `Tiket/Label gambar berhasil dicetak ke ${printerName}`,
    };
  }

  throw new Error('Tidak ada data yang dapat dicetak (butuh labelData, rawZpl, atau imageBase64).');
}

