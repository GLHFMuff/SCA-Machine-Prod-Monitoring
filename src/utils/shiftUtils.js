export const DEFAULT_SHIFT_LIST = [
  { id: 1, name: 'Shift 1', start: '07:00', end: '15:00' },
  { id: 2, name: 'Shift 2', start: '15:00', end: '23:00' },
  { id: 3, name: 'Shift 3', start: '23:00', end: '07:00' },
];

export function parseTimeHHMM(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return null;
  const [hh, mm] = trimmed.split(':').map(Number);
  return hh * 60 + mm;
}

export function isOvernightShift(shift) {
  const start = parseTimeHHMM(shift?.start);
  const end = parseTimeHHMM(shift?.end);
  return start !== null && end !== null && start > end;
}

/**
 * Determine which configured shift matches `now` based on start/end HH:mm ranges.
 * Supports overnight shifts where start > end (e.g. 23:00 - 07:00).
 */
export function detectActiveShift(shifts = [], now = new Date()) {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const shift of shifts) {
    const startMins = parseTimeHHMM(shift?.start);
    const endMins = parseTimeHHMM(shift?.end);
    if (startMins === null || endMins === null || startMins === endMins) continue;

    if (startMins < endMins) {
      if (nowMinutes >= startMins && nowMinutes < endMins) return shift;
    } else if (nowMinutes >= startMins || nowMinutes < endMins) {
      return shift;
    }
  }

  return null;
}

export function formatClockHHMM(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

