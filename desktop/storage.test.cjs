const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createStorage } = require('./storage.cjs');

const booking = {
  id: 'booking-1',
  customerId: 'customer-1',
  customerName: 'Example Traveller',
  phone: '1234567890',
  email: '',
  pnr: 'SAMPLE',
  bookedOn: '2026-11-17',
  status: 'confirmed',
  currency: 'INR',
  agencyCost: '100.00',
  customerCharged: '125.00',
  passengers: [{ name: 'Example Traveller', ticketNumber: '' }],
  segments: [
    {
      airline: 'Example Air',
      flightNumber: 'EX 1',
      origin: 'TRV',
      destination: 'MAA',
      departure: '2026-11-17T10:00',
      arrival: '',
    },
  ],
  transactions: [],
  archived: false,
  version: 1,
  createdAt: '2026-11-17T04:30:00.000Z',
};
const ticket = () => ({ bytes: new Uint8Array(Buffer.from('%PDF-1.7\n%%EOF\n')).buffer });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'traveliq-test-'));
  const local = path.join(root, 'local');
  const disk = path.join(root, 'external');
  fs.mkdirSync(disk);
  let db = createStorage(local);
  t.after(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    disk,
    reopen() {
      db.close();
      db = createStorage(local);
      return db;
    },
    get db() {
      return db;
    },
  };
}

test('fresh database is empty; bookings and folder survive a restart', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.db.load(), []);
  assert.equal(f.db.getTicketFolder(), '');
  f.db.setTicketFolder(f.disk);
  f.db.save([booking]);
  assert.deepEqual(f.reopen().load(), [booking]);
  assert.equal(f.db.getTicketFolder(), f.disk);
});

test('report branding survives database reopen and can be reset without touching bookings', (t) => {
  const f = fixture(t);
  const logo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR8sAAAAASUVORK5CYII=';
  assert.deepEqual(f.db.getBranding(), { reportHeader: 'TRAVELIQ OFFLINE / REPORTS', logo: '' });
  f.db.save([booking]);
  f.db.setReportHeader('  My & Co Travel  ');
  f.db.setBusinessLogo(logo);
  assert.deepEqual(f.reopen().getBranding(), { reportHeader: 'My & Co Travel', logo });
  assert.throws(() => f.db.setBusinessLogo('data:image/svg+xml,<svg onload="alert(1)"/>'), /PNG/i);
  f.db.setReportHeader('');
  f.db.setBusinessLogo('');
  assert.deepEqual(f.db.getBranding(), { reportHeader: 'TRAVELIQ OFFLINE / REPORTS', logo: '' });
  assert.deepEqual(f.db.load(), [booking]);
});

test('ticket copies go to the chosen folder; deleting bookings leaves archived PDFs in place', (t) => {
  const f = fixture(t);
  assert.throws(() => f.db.save([booking], ticket()), /choose a folder/i);
  f.db.setTicketFolder(f.disk);
  f.db.save([booking], ticket());
  const alternate = { ...booking, id: 'booking-2' };
  f.db.save([booking, alternate], ticket());
  const files = fs.readdirSync(f.disk, { recursive: true }).filter((p) => p.endsWith('.pdf'));
  assert.equal(files.length, 2);
  assert.notEqual(files[0], files[1]);
  for (const name of files) {
    assert.match(name.replaceAll('\\', '/'), /^\d{4}\/\d{2}\/ticket-[0-9a-f-]+\.pdf$/);
    assert.deepEqual(fs.readFileSync(path.join(f.disk, name)), Buffer.from(ticket().bytes));
  }
  f.db.save([]);
  assert.deepEqual(f.db.load(), []);
  assert.equal(
    fs.readdirSync(f.disk, { recursive: true }).filter((p) => p.endsWith('.pdf')).length,
    2,
  );
});

test('missing or invalid ticket prevents saving that booking; other records remain usable', (t) => {
  const f = fixture(t);
  f.db.setTicketFolder(f.disk);
  f.db.save([booking]);
  const alternate = { ...booking, id: 'booking-2' };
  assert.throws(
    () => f.db.save([booking, alternate], { bytes: new Uint8Array([1, 2]).buffer }),
    /valid PDF/i,
  );
  fs.renameSync(f.disk, f.disk + '-unplugged');
  assert.throws(() => f.db.save([booking, alternate], ticket()), /unavailable|writable/i);
  assert.deepEqual(f.db.load(), [booking]);
  f.db.save([booking, alternate]);
  assert.equal(f.db.load().length, 2);
  assert.equal(fs.existsSync(f.disk), false, 'must not recreate a missing folder');
});

test('backup/restore validates data and preserves settings; previous records get a safety copy', (t) => {
  const f = fixture(t);
  f.db.setTicketFolder(f.disk);
  f.db.save([booking]);
  const backup = path.join(f.root, 'backup.json');
  f.db.backup(backup);
  const current = { ...booking, id: 'new-booking' };
  f.db.save([current]);
  const invalid = path.join(f.root, 'bad.json');
  fs.writeFileSync(
    invalid,
    '{"type":"TravelIQ Offline backup","version":1,"bookings":[{"id":"bad"}]}',
  );
  assert.throws(() => f.db.restore(invalid), /invalid|backup/i);
  assert.deepEqual(f.db.load(), [current]);
  f.db.restore(backup);
  assert.deepEqual(f.db.load(), [booking]);
  assert.equal(f.db.getTicketFolder(), f.disk);
  const [safety] = fs.readdirSync(path.join(f.root, 'local', 'restore-backups'));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, 'local', 'restore-backups', safety))).bookings[0]
      .id,
    current.id,
  );
});
