/**
 * Date utility helpers for DD/MM/YYYY formatting
 */

export function getTodayDDMMYYYY() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getTodayYYYYMMDD() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

export function toDDMMYYYY(val) {
  if (!val) return getTodayDDMMYYYY();
  const s = String(val).trim();

  // If already DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1].padStart(2, '0');
    const mm = ddmmyyyy[2].padStart(2, '0');
    const yyyy = ddmmyyyy[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // If YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = yyyymmdd[1];
    const mm = yyyymmdd[2].padStart(2, '0');
    const dd = yyyymmdd[3].padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  // If DD-MM-YYYY
  const ddmmyyyyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const dd = ddmmyyyyDash[1].padStart(2, '0');
    const mm = ddmmyyyyDash[2].padStart(2, '0');
    const yyyy = ddmmyyyyDash[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

export function toYYYYMMDD(val) {
  if (!val) return getTodayYYYYMMDD();
  const s = String(val).trim();

  // If already YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = yyyymmdd[1];
    const mm = yyyymmdd[2].padStart(2, '0');
    const dd = yyyymmdd[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // If DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1].padStart(2, '0');
    const mm = ddmmyyyy[2].padStart(2, '0');
    const yyyy = ddmmyyyy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // If DD-MM-YYYY
  const ddmmyyyyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const dd = ddmmyyyyDash[1].padStart(2, '0');
    const mm = ddmmyyyyDash[2].padStart(2, '0');
    const yyyy = ddmmyyyyDash[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  }

  return getTodayYYYYMMDD();
}

