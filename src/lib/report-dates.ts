import type { Booking, Segment } from './model';

export type DateBasis = 'booking' | 'departure';
export const dateBasisLabel: Record<DateBasis, string> = {
  booking: 'Booked date',
  departure: 'Departure date',
};

export function localDay(date = new Date()) {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function reportDay(booking: Pick<Booking, 'bookedOn' | 'segments'>, basis: DateBasis) {
  return basis === 'booking' ? booking.bookedOn : booking.segments[0]?.departure.slice(0, 10) || '';
}

export function nextDeparture(booking: Pick<Booking, 'segments'>, today: string) {
  return booking.segments.reduce<Segment | undefined>(
    (next, segment) =>
      segment.departure.slice(0, 10) >= today && (!next || segment.departure < next.departure)
        ? segment
        : next,
    undefined,
  );
}

export const validRangeDay = (day: string) =>
  day === '' ||
  (/^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day);

export function dateInRange(day: string, start: string, end: string) {
  return (!start && !end) || (!!day && (!start || day >= start) && (!end || day <= end));
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export const firstCompleteMonth = (start: string) =>
  !start || start.endsWith('-01') ? start.slice(0, 7) : shiftMonth(start.slice(0, 7), 1);

export function completeThrough(today: string, end: string) {
  const currentMonth = today.slice(0, 7);
  if (!end || end.slice(0, 7) >= currentMonth) return shiftMonth(currentMonth, -1);
  const endMonth = end.slice(0, 7);
  const nextMonth = new Date(shiftMonth(endMonth, 1) + '-01T00:00:00Z');
  nextMonth.setUTCDate(0);
  return nextMonth.toISOString().slice(0, 10) === end ? endMonth : shiftMonth(endMonth, -1);
}
