const { DEFAULT_REPORT_HEADER, reportHeader, businessLogo } = require('./branding.cjs');
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const isDay = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayLabel = (day) => (day ? date.format(new Date(day + 'T00:00:00Z')) : '—');
const integerINR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const amount = (cents) => {
  const value = cents < 0n ? -cents : cents;
  return (
    (cents < 0n ? '−' : '') +
    integerINR.format(value / 100n) +
    '.' +
    String(value % 100n).padStart(2, '0')
  );
};
function cents(value) {
  if (typeof value !== 'string' || !/^-?\d{1,18}\.\d{2}$/.test(value)) {
    throw Error('The report contains an invalid amount.');
  }
  return BigInt(value.replace('.', ''));
}
function validate(request) {
  const { basis, start, end, rows } = request || {};
  if (
    (basis !== 'booking' && basis !== 'departure') ||
    (start !== '' && !isDay(start)) ||
    (end !== '' && !isDay(end)) ||
    (start && end && start > end)
  )
    throw Error('Choose a valid report date range.');
  if (!Array.isArray(rows) || !rows.length) throw Error('There are no bookings to export.');
  if (rows.length > 10000)
    throw Error('Choose a shorter date range to export up to 10,000 bookings.');
  const values = rows.map((row) => {
    if (
      !row ||
      typeof row.customer !== 'string' ||
      !row.customer ||
      row.customer.length > 100 ||
      !isDay(row.bookedOn) ||
      (row.departure !== '' && !isDay(row.departure)) ||
      typeof row.airline !== 'string' ||
      row.airline.length > 80
    ) {
      throw Error('The report contains an invalid booking.');
    }
    const dateForRange = basis === 'booking' ? row.bookedOn : row.departure;
    if (
      (start && (!dateForRange || dateForRange < start)) ||
      (end && (!dateForRange || dateForRange > end))
    ) {
      throw Error('A booking is outside the selected report date range.');
    }
    return {
      customer: row.customer,
      bookedOn: row.bookedOn,
      departure: row.departure,
      airline: row.airline,
      charge: cents(row.charge),
      profit: cents(row.profit),
      outstanding: cents(row.outstanding),
    };
  });
  return { basis, start, end, rows: values };
}

const styles = `
  @page { size: A4 portrait; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff; font: 10pt "Segoe UI", Arial, sans-serif; }
  header { display: flex; align-items: center; gap: 16pt; min-height: 56pt; }
  .logo { width: 93pt; height: 49pt; flex: 0 0 93pt; object-fit: contain; }
  .heading { min-width: 0; }
  .eyebrow { font-size: 8.5pt; font-weight: 700; overflow-wrap: anywhere; }
  h1 { margin: 3pt 0 0; font-size: 25pt; line-height: 1.1; }
  .range { margin: 15pt 0 0; padding: 0 0 12pt; color: #333; border-bottom: .5pt solid #8c8c8c; }
  .totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10pt; padding: 16pt 0; border-bottom: .5pt solid #aaa; break-inside: avoid; }
  .total-label { display: block; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; }
  .total-value { display: block; margin-top: 7pt; font-size: 15pt; font-weight: 700; overflow-wrap: anywhere; }
  .caption { display: flex; align-items: baseline; justify-content: space-between; margin: 16pt 0 6pt; }
  .caption h2 { font-size: 13pt; margin: 0; }
  .caption span { font-size: 8.5pt; color: #333; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th, td { padding: 8pt 5pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { border-top: .5pt solid #777; border-bottom: .5pt solid #777; font-size: 7.3pt; text-transform: uppercase; }
  td { border-bottom: .45pt solid #aaa; font-size: 9pt; line-height: 1.35; }
  tr { break-inside: avoid; }
  .entry { font-weight: 650; }
  .day { white-space: nowrap; }
  .airline { color: #333; font-size: 8pt; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; }
`;

function makeBookingReport(request, branding) {
  const { basis, start, end, rows } = validate(request);
  const label = basis === 'departure' ? 'Departure date' : 'Booked date';
  const range =
    start && end
      ? start === end
        ? dayLabel(start)
        : dayLabel(start) + ' – ' + dayLabel(end)
      : start
        ? 'From ' + dayLabel(start)
        : end
          ? 'Through ' + dayLabel(end)
          : 'All dates';
  const header = escape(reportHeader(branding?.reportHeader ?? DEFAULT_REPORT_HEADER));
  const logo = businessLogo(branding?.logo || '');
  const sums = rows.reduce(
    (sum, row) => ({
      charge: sum.charge + row.charge,
      profit: sum.profit + row.profit,
      outstanding: sum.outstanding + row.outstanding,
    }),
    { charge: 0n, profit: 0n, outstanding: 0n },
  );
  const totals = [
    ['Bookings', integerINR.format(rows.length)],
    ['Adjusted charges', '₹' + amount(sums.charge)],
    ['Gross profit', '₹' + amount(sums.profit)],
    ['Outstanding', '₹' + amount(sums.outstanding)],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Booking report</title>
  <style>${styles}</style></head><body>
  <header>${logo ? `<img class="logo" src="${logo}" alt="Business logo">` : ''}
    <div class="heading"><div class="eyebrow">${header}</div><h1>Booking report</h1></div>
  </header>
  <p class="range">${label} · ${range}</p>
  <section class="totals">${totals.map(([name, value]) => `<div><span class="total-label">${name}</span><span class="total-value">${value}</span></div>`).join('')}</section>
  <div class="caption"><h2>Booking details</h2><span>All amounts in INR</span></div>
  <table>
    <colgroup><col style="width:22%"><col style="width:15%"><col style="width:19%"><col style="width:14%"><col style="width:14%"><col style="width:16%"></colgroup>
    <thead><tr><th>Customer</th><th>Booked date</th><th>Departure date</th><th class="amount">Charged</th><th class="amount">Gross profit</th><th class="amount">Outstanding</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
      <td class="entry">${escape(r.customer)}</td><td class="day">${dayLabel(r.bookedOn)}</td>
      <td><span class="day">${dayLabel(r.departure)}</span>${r.airline ? `<br><span class="airline">${escape(r.airline)}</span>` : ''}</td>
      <td class="amount">${amount(r.charge)}</td><td class="amount">${amount(r.profit)}</td><td class="amount">${amount(r.outstanding)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>
  </body></html>`;
}

const pageFooter = `<div style="box-sizing:border-box;width:100%;margin:0 .45in;border-top:1px solid #aaa;padding:6px 0;color:#444;font:10px Arial,sans-serif;display:flex;justify-content:space-between"><span>TravelIQ Offline</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

module.exports = { makeBookingReport, pageFooter };
