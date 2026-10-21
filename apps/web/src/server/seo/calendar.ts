/** Source calendars stay separate; a GA4 date is not automatically a GSC PT date. */
export function matureWindow(timeZone: string, now = Date.now()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const end = new Date(Date.parse(date + 'T00:00:00Z') - 3 * 86400000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(end + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(from + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
  return { from, to: end, days };
}
