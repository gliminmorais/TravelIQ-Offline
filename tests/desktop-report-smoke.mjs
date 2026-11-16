import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Run against the packaged app: node tests/desktop-report-smoke.mjs [optional output directory]
const output = process.argv[2] ? resolve(process.argv[2]) : tmpdir();
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(output, 'traveliq-report-'));
const executablePath = resolve('release/win-unpacked/TravelIQ Offline.exe');
const profile = join(temp, 'isolated-user-data');
const logo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAABcbTqwAAACG0lEQVR4nO3cQU7jQBBA0dhiFe7GloMwC+YEwwIOwpa74S0jRgpSSKZCILaru97bYmEL9e9ybGDYnGF7d/92zvGQ0fT0MHz12JMHioLKsYzRF8VB706t8aP1CIOKpiPT5GCCiIOqtkemyV4g4qC67adIws8gUN1HIKYHHLbwLxBxwL5dE26xICAQCAxur+D/TBAICAQCAoGAQCAgEAgIBKoE8nr7svYl0JluAhEHc+gmkB2hcEldBCIK5jL2GIdguJTmA4E5NR1INClMETbVA4G5NRvIVyaEKULJQCx8lnK12Jk69vr4Z+1LKO/61+9ZfgZj79PDtKFMIBY7S2sqkO8SFt0HYpGzhrFKHALjOzzFSvwEhfWlnyCX3PlNEboLBNaUOhA7Pmsbq8UhOroIBDJIGcjcu7wpQrOBWLxkki6QpQiR5gKxaMlmrByHIGkmEMgoRSB2crK6qh7H+/mvn29+9j38yW23v8iZYoJAVmPl6ZHtOsjHBIGMgWTbtbNdD4UDsRhpxbC9u39b+qSZA/npEy36svgEyRwHrP4exA5NSzzFgoBAICAQCAgEAgKBgEAgIBAICAQCAoGAQCAgEAgIBAICgcA4PT0M0QFQ1XsbJggEBAKnAnGbBft2TXxMEJHAYQtusSCwF4gpQnXTp6e6BxNEJFQ1HXnlEb4DWeN/ZsHSoqEQfgYxTejdqTV+1lt0E4VNB87Z+P8CDUWeUFxkeA8AAAAASUVORK5CYII=',
  'base64',
);
const launch = () =>
  electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    timeout: 30000,
  });
function sample(id, name, bookedOn, departure) {
  return {
    id,
    customerId: id,
    customerName: name,
    phone: '0000012345',
    email: '',
    pnr: 'PRIVATE-' + id,
    bookedOn,
    currency: 'INR',
    status: 'confirmed',
    archived: false,
    version: 1,
    createdAt: '2026-11-17T07:10:00.000Z',
    passengers: [{ name, ticketNumber: '' }],
    segments: [
      {
        origin: 'TRV',
        destination: 'MAA',
        airline: 'Example Air',
        flightNumber: 'EX 1',
        departure: departure + 'T10:00',
        arrival: '',
      },
    ],
    customerCharged: '150.30',
    agencyCost: '100.10',
    transactions: [],
  };
}
const fixtures = [
  sample('A', 'Booked Day Example & Co', '2026-11-17', '2026-11-24'),
  ...Array.from({ length: 40 }, (_, i) =>
    sample(
      'D' + i,
      'Departure Customer ' + String(i + 1).padStart(2, '0'),
      '2026-10-15',
      '2026-11-17',
    ),
  ),
];
const count = (page) =>
  page.locator('.kpi').filter({ hasText: 'Total bookings' }).locator('strong');
const select = (page, label) => page.getByRole('combobox', { name: label });
async function exportPdf(instance, page, filename) {
  const outputPath = join(temp, filename);
  await instance.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, outputPath);
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect
    .poll(async () => (await stat(outputPath).catch(() => null))?.size || 0, { timeout: 20000 })
    .toBeGreaterThan(0);
  assert.equal((await readFile(outputPath)).subarray(0, 5).toString(), '%PDF-');
  return outputPath;
}

await mkdir(dirname(profile), { recursive: true });
let instance = await launch();
try {
  const page = await instance.firstWindow();
  await expect(count(page)).toHaveText('0');
  await page.getByRole('button', { name: 'New booking', exact: true }).click();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  await expect(page.getByLabel('Booked date', { exact: true })).toHaveValue(today);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate((bookings) => window.travelIQDesktop.save(bookings), fixtures);
  await page.reload();
  await expect(count(page)).toHaveText('41');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Report header', { exact: true }).fill('Example Travel & Co');
  await page.getByRole('button', { name: 'Save report header', exact: true }).click();
  await expect(page.getByText('Report header saved', { exact: true })).toBeVisible();
  await page.getByLabel('Business logo image', { exact: true }).setInputFiles({
    name: 'fictional-logo.png',
    mimeType: 'image/png',
    buffer: logo,
  });
  await expect(page.getByAltText('Business logo preview')).toBeVisible();
  await expect(page.locator('.sidebar-logo')).toBeVisible();
  await instance.close();
  instance = await launch();
  const reopened = await instance.firstWindow();
  await expect(reopened.locator('.sidebar-logo')).toBeVisible();
  await expect(count(reopened)).toHaveText('41');
  await expect(select(reopened, 'Reporting date basis')).toHaveValue('booking');
  await expect(select(reopened, 'Export format')).toHaveValue('pdf');
  await reopened.getByLabel('Start date (Booked date)', { exact: true }).fill('2026-11-17');
  await reopened.getByLabel('End date (Booked date)', { exact: true }).fill('2026-11-17');
  await expect(count(reopened)).toHaveText('1');
  const bookedPdf = await exportPdf(instance, reopened, 'booked-date.pdf');
  await select(reopened, 'Reporting date basis').selectOption('departure');
  await expect(reopened.getByLabel('Start date (Departure date)', { exact: true })).toHaveValue(
    '2026-11-17',
  );
  await expect(count(reopened)).toHaveText('40');
  const departurePdf = await exportPdf(instance, reopened, 'departure-date.pdf');
  await reopened.getByRole('button', { name: 'Bookings', exact: true }).click();
  await expect(reopened.getByRole('columnheader').filter({ hasText: 'Booked date' })).toBeVisible();
  await expect(
    reopened.getByRole('button', { name: 'Booked Day Example & Co', exact: true }),
  ).toHaveCount(0);
  await reopened.getByRole('button', { name: 'Forecasting', exact: true }).click();
  await expect(
    reopened.getByText('Monthly totals by departure date. Complete calendar months only.'),
  ).toBeVisible();
  await expect(select(reopened, 'Reporting date basis')).toHaveValue('departure');
  await select(reopened, 'Export format').selectOption('csv');
  const csv = join(temp, 'bookings.csv');
  await instance.evaluate(({ session }, destination) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(destination));
  }, csv);
  await reopened.getByRole('button', { name: 'Export CSV', exact: true }).click();
  await expect.poll(async () => (await stat(csv).catch(() => null))?.size || 0).toBeGreaterThan(0);
  const csvContent = await readFile(csv, 'utf8');
  assert.match(csvContent, /"booked_on","departure"/);
  assert.match(csvContent, /Departure Customer 40/);
  assert.doesNotMatch(csvContent, /Booked Day Example/);
  console.log(JSON.stringify({ bookedPdf, departurePdf, csv, result: 'PASS' }));
} finally {
  await instance.close();
}
