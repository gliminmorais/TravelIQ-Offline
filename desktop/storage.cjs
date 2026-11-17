const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { businessLogo, reportHeader } = require('./branding.cjs');

const BACKUP_TYPE = 'TravelIQ Offline backup';
const MAX_BACKUP = 64 * 1024 * 1024;
const MAX_PDF = 4 * 1024 * 1024;
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
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

function discardFile(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* The file is gone or the disk is unavailable. */
  }
}

function writeAtomically(destination, bytes, { newFile = false } = {}) {
  const temp = path.join(path.dirname(destination), `.traveliq-${randomUUID()}.tmp`);
  let tempExists = false;
  let reserved = false;
  try {
    const handle = fs.openSync(temp, 'wx', 0o600);
    tempExists = true;
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    if (newFile) {
      // Claim the filename after the temporary file is complete.
      const reservation = fs.openSync(destination, 'wx', 0o600);
      reserved = true;
      fs.closeSync(reservation);
    }
    fs.renameSync(temp, destination);
    tempExists = false;
    reserved = false;
  } finally {
    if (reserved) discardFile(destination);
    if (tempExists) discardFile(temp);
  }
}

function ticketStem(customerName) {
  const name = customerName
    .trim()
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/[. ]+$/, '');
  if (/^(?:con|prn|aux|nul|(?:com|lpt)[1-9¹²³]) *\./i.test(name)) return `_${name}`;
  return name || 'Customer';
}

function nextTicketNumber(directory, stem) {
  const prefix = `${stem.toLowerCase()}_`;
  let last = 0n;
  for (const filename of fs.readdirSync(directory)) {
    const lower = filename.toLowerCase();
    if (!lower.startsWith(prefix) || !lower.endsWith('.pdf')) continue;
    const suffix = lower.slice(prefix.length, -4);
    if (/^\d+$/.test(suffix)) {
      const number = BigInt(suffix);
      if (number > last) last = number;
    }
  }
  return last + 1n;
}

function copyTicket(folder, ticket, booking) {
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
    const [year, , bookedDay] = booking.bookedOn.split('-');
    const month = monthName.format(new Date(booking.bookedOn));
    let dir = root;
    for (const part of [year, month, bookedDay]) {
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
    const stem = ticketStem(booking.customerName);
    for (let number = nextTicketNumber(dir, stem); ; number += 1n) {
      const destination = path.join(dir, `${stem}_${number}.pdf`);
      try {
        writeAtomically(destination, bytes, { newFile: true });
        return destination;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
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
  const getBranding = () => ({
    reportHeader: reportHeader(getSetting.get('reportHeader')?.value || ''),
    logo: getSetting.get('businessLogo')?.value || '',
  });
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
    getBranding,
    setBusinessLogo(value) {
      setSetting.run('businessLogo', businessLogo(value));
      return getBranding();
    },
    setReportHeader(value) {
      setSetting.run('reportHeader', reportHeader(value));
      return getBranding();
    },
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
      let copied;
      if (ticket !== undefined) {
        const booking = bookings.find((record) => record.id === ticket?.bookingId);
        if (!booking) throw Error('Choose the booking for this ticket PDF before saving.');
        copied = copyTicket(getTicketFolder(), ticket, booking);
      }
      try {
        replace(bookings, rows);
      } catch (error) {
        if (copied) discardFile(copied);
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

module.exports = { createStorage, writeAtomically };
