/** HTML date fields describe Japanese calendar days, never the browser's zone. */
export function personalDateRange(startDay: string, endDay: string): { start?: string; end?: string } {
  function day(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE_RANGE');
    const [year, month, date] = value.split('-').map(Number);
    const utc = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(utc.getTime()) || utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== date) throw new Error('INVALID_DATE_RANGE');
    return utc.getTime() - 9 * 3600000;
  }
  const start = startDay ? day(startDay) : undefined;
  const end = endDay ? day(endDay) + 86400000 : undefined;
  if (start !== undefined && end !== undefined && start >= end) throw new Error('INVALID_DATE_RANGE');
  return { ...(start !== undefined ? { start: new Date(start).toISOString() } : {}), ...(end !== undefined ? { end: new Date(end).toISOString() } : {}) };
}
