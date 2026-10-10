// Helper: فحص موحد لحالة التفعيل — يتحمل 1/0 و "1"/"0" و true/false و undefined/null
// القاعدة: undefined/null/'' تعني القيمة الافتراضية (defaultOn)
function isEnabled(value, defaultOn = true) {
  if (value === undefined || value === null || value === '') return defaultOn;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
  const n = Number(value);
  if (!Number.isNaN(n)) return n !== 0;
  return defaultOn;
}

module.exports = { isEnabled };
