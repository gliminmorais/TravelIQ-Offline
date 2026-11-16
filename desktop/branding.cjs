const DEFAULT_REPORT_HEADER = 'TRAVELIQ OFFLINE / REPORTS';
const LOGO_PREFIX = 'data:image/png;base64,';
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

function reportHeader(value) {
  if (typeof value !== 'string' || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) {
    throw Error('Enter a report header of up to 80 characters on one line.');
  }
  return value.trim() || DEFAULT_REPORT_HEADER;
}

function businessLogo(value) {
  if (value === '') return '';
  const invalid = () => Error('Choose a valid PNG or JPEG logo and try again.');
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + LOGO_PREFIX.length ||
    !value.startsWith(LOGO_PREFIX) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(LOGO_PREFIX.length))
  )
    throw invalid();
  const bytes = Buffer.from(value.slice(LOGO_PREFIX.length), 'base64');
  if (
    bytes.length < 33 ||
    bytes.length > MAX_LOGO_BYTES ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw invalid();
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 720 || height > 720) throw invalid();
  return LOGO_PREFIX + bytes.toString('base64');
}

module.exports = { DEFAULT_REPORT_HEADER, reportHeader, businessLogo };
