const assert = require('node:assert/strict');
const test = require('node:test');
const { makeBookingReport } = require('./report.cjs');

const request = {
  basis: 'booking',
  start: '2026-11-17',
  end: '2026-11-17',
  rows: [
    {
      customer: '<script>Example & Co</script>',
      bookedOn: '2026-11-17',
      departure: '2026-12-02',
      airline: 'Example Air',
      charge: '999999999.99',
      profit: '-2.15',
      outstanding: '0.01',
      pnr: 'PRIVATE-PNR',
      route: 'PRIVATE-ROUTE',
      status: 'PRIVATE-STATUS',
    },
    {
      customer: 'Example B',
      bookedOn: '2026-11-17',
      departure: '2026-12-03',
      airline: 'Example Air',
      charge: '0.02',
      profit: '4.25',
      outstanding: '0.00',
    },
  ],
};

test('produces the approved portrait report, safely escapes user text, and totals decimal amounts', () => {
  const html = makeBookingReport(request, { reportHeader: 'Maya & Co <Travel>' });
  assert.match(html, /A4 portrait/);
  assert.match(html, /Maya &amp; Co &lt;Travel&gt;/);
  assert.match(html, /&lt;script&gt;Example &amp; Co&lt;\/script&gt;/);
  assert.match(html, /Booked date/);
  assert.match(html, /17 Nov 2026/);
  assert.match(html, /1,00,00,00,000\.01/);
  assert.match(html, /₹2\.10/);
  assert.doesNotMatch(html, /PRIVATE-|<script|reflect adjustments|active booking filters/i);
});

test('updates the report range label when using departure dates without dropping either column', () => {
  const html = makeBookingReport({ ...request, basis: 'departure', start: '', end: '' }, {});
  assert.match(html, /Departure date · All dates/);
  assert.match(html, /<th[^>]*>Booked date<\/th>/);
  assert.match(html, /<th[^>]*>Departure date<\/th>/);
  assert.throws(() => makeBookingReport({ ...request, rows: [] }, {}), /no bookings/i);
  assert.throws(() => makeBookingReport({ ...request, start: '2026-02-30' }, {}), /date/i);
});
