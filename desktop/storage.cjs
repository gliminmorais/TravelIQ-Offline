const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const BACKUP_TYPE = 'TravelIQ Offline backup';
const MAX_BACKUP = 64 * 1024 * 1024;
const MAX_PDF = 4 * 1024 * 1024;
const text = (value, max, min = 0) =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const day = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const localTime = (value) =>
  text(value, 16, 16) && /T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && day(value.slice(0, 10));
const money = (value) => typeof value === 'string' && /^\d{1,9}(\.\d{1,2})?$/.test(value);
const signed = (value) => typeof value === 'string' && /^-?\d{1,9}(\.\d{1,2})?$/.test(value);
const validRecord = (b) =>
  b &&
  text(b.id, 100, 1) &&
  text(b.customerId, 100, 1) &&
  text(b.customerName, 100, 2) &&
  text(b.phone, 20) &&
  text(b.email, 200) &&
  text(b.pnr, 20) &&
  day(b.bookedOn) &&
  ['pending', 'confirmed', 'cancelled', 'refunded'].includes(b.status) &&
  b.currency === 'INR' &&
  money(b.agencyCost) &&
  money(b.customerCharged) &&
  Number.isSafeInteger(b.version) &&
  b.version > 0 &&
  typeof b.archived === 'boolean' &&
  text(b.createdAt, 40, 1) &&
  Number.isFinite(Date.parse(b.createdAt)) &&
  Array.isArray(b.passengers) &&
  b.passengers.length > 0 &&
  b.passengers.length <= 20 &&
  b.passengers.every((p) => p && text(p.name, 100, 2) && text(p.ticketNumber, 30)) &&
  Array.isArray(b.segments) &&
  b.segments.length > 0 &&
  b.segments.length <= 12 &&
  b.segments.every(
    (s) =>
      s &&
      text(s.airline, 80, 1) &&
      text(s.flightNumber, 16) &&
      text(s.origin, 3, 3) &&
      /^[A-Z]{3}$/.test(s.origin) &&
      text(s.destination, 3, 3) &&
      /^[A-Z]{3}$/.test(s.destination) &&
      s.origin !== s.destination &&
      localTime(s.departure) &&
      (s.arrival === '' || localTime(s.arrival)),
  ) &&
  Array.isArray(b.transactions) &&
  b.transactions.every(
    (t) =>
      t &&
      text(t.id, 100, 1) &&
      ['payment', 'refund', 'adjustment'].includes(t.type) &&
      signed(t.amount) &&
      (t.type === 'adjustment' || (Number(t.amount) > 0 && !t.costAdjustment)) &&
      (t.costAdjustment === undefined || signed(t.costAdjustment)) &&
      day(t.date) &&
      text(t.note, 300),
  );

function validateBookings(bookings) {
  if (
    !Array.isArray(bookings) ||
    !bookings.every(validRecord) ||
    new Set(bookings.map((b) => b.id)).size !== bookings.length
  ) {
    throw Error('Invalid booking data. No changes were saved.');
  }
  const rows = bookings.map((b) => JSON.stringify(b));
  if (rows.reduce((total, row) => total + Buffer.byteLength(row) + 1, 0) > MAX_BACKUP - 4096) {
    throw Error('The booking data is too large. No changes were saved.');
  }
  return rows;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function writeAtomically(destination, bytes) {
  const temp = path.join(path.dirname(destination), `.traveliq-${randomUUID()}.tmp`);
  let created = false;
  try {
    const handle = fs.openSync(temp, 'wx', 0o600);
    created = true;
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temp, destination);
  } finally {
    if (created) {
      try {
        fs.unlinkSync(temp);
      } catch {
        /* already renamed or the disk was removed */
      }
    }
  }
}

function copyTicket(folder, ticket) {
  if (!folder) throw Error('Choose a folder for ticket PDFs first, then try saving again.');
  if (!(ticket?.bytes instanceof ArrayBuffer) || ticket.bytes.byteLength > MAX_PDF) {
    throw Error('Choose a valid PDF no larger than 4 MB.');
  }
  const bytes = Buffer.from(ticket.bytes);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Error('Choose a valid PDF.');
  try {
    // The selected root must already exist. Do not recreate it if an external disk is absent.
    const root = fs.realpathSync(folder);
    if (!fs.statSync(root).isDirectory()) throw Error('Not a directory');
    const now = new Date();
    let dir = root;
    for (const part of [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0')]) {
      const child = path.join(dir, part);
      try {
        fs.mkdirSync(child);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      dir = fs.realpathSync(child);
      if (!isWithin(root, dir) || !fs.statSync(dir).isDirectory())
        throw Error('Invalid archive subfolder');
    }
    const destination = path.join(dir, `ticket-${randomUUID()}.pdf`);
    writeAtomically(destination, bytes);
    return destination;
  } catch (error) {
    throw Error(
      error.code === 'ENOSPC'
        ? 'The ticket disk is full. Free some space or choose another folder, then try saving again.'
        : 'The ticket folder is unavailable or not writable. Connect the disk or choose another folder, then try saving again.',
    );
  }
}

function createStorage(profile) {
  fs.mkdirSync(profile, { recursive: true });
  const databasePath = path.join(profile, 'traveliq.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const select = db.prepare('SELECT payload FROM bookings ORDER BY position');
  const erase = db.prepare('DELETE FROM bookings');
  const insert = db.prepare('INSERT INTO bookings (id, position, payload) VALUES (?, ?, ?)');
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare(
    'INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const load = () => select.all().map((row) => JSON.parse(row.payload));
  const getTicketFolder = () => getSetting.get('ticketFolder')?.value || '';
  const replace = (bookings, rows) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      erase.run();
      rows.forEach((row, index) => insert.run(bookings[index].id, index, row));
      db.exec('COMMIT');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  };
  const backup = (destination) => {
    const target = path.resolve(destination);
    if (
      [databasePath, `${databasePath}-journal`, `${databasePath}-wal`, `${databasePath}-shm`].some(
        (item) => path.relative(item, target) === '',
      )
    )
      throw Error('Choose a different backup filename.');
    writeAtomically(target, JSON.stringify({ type: BACKUP_TYPE, version: 1, bookings: load() }));
  };
  return {
    load,
    getTicketFolder,
    backup,
    close: () => db.close(),
    setTicketFolder(folder) {
      if (
        !path.isAbsolute(folder) ||
        folder.startsWith('\\\\') ||
        !fs.statSync(folder).isDirectory()
      ) {
        throw Error('Select a folder on this computer or a connected disk.');
      }
      fs.accessSync(folder, fs.constants.W_OK);
      setSetting.run('ticketFolder', folder);
      return folder;
    },
    save(bookings, ticket) {
      const rows = validateBookings(bookings);
      const copied = ticket === undefined ? undefined : copyTicket(getTicketFolder(), ticket);
      try {
        replace(bookings, rows);
      } catch (error) {
        if (copied) {
          try {
            fs.unlinkSync(copied);
          } catch {
            /* disk removed */
          }
        }
        throw error;
      }
    },
    restore(source) {
      let bookings;
      let rows;
      try {
        const info = fs.statSync(source);
        if (!info.isFile() || info.size > MAX_BACKUP) throw Error('Unexpected backup size');
        const archive = JSON.parse(fs.readFileSync(source, 'utf8'));
        if (archive.type !== BACKUP_TYPE || archive.version !== 1)
          throw Error('Unexpected backup format');
        bookings = archive.bookings;
        rows = validateBookings(bookings);
      } catch {
        throw Error('This is not a valid TravelIQ Offline backup. No bookings were changed.');
      }
      const safetyFolder = path.join(profile, 'restore-backups');
      fs.mkdirSync(safetyFolder, { recursive: true });
      backup(path.join(safetyFolder, `before-restore-${randomUUID()}.json`));
      replace(bookings, rows);
    },
  };
}

module.exports = { createStorage };
