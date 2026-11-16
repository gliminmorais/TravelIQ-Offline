import { describe, expect, it } from 'vitest';
import {
  completeThrough,
  dateInRange,
  localDay,
  nextDeparture,
  reportDay,
} from '@/lib/report-dates';
import { forecastHistory } from '@/lib/analytics';
import type { Booking } from '@/lib/model';

function booking(bookedOn: string, departure: string): Booking {
  return {
    id: bookedOn + '-' + departure,
    customerId: 'example-customer',
    customerName: 'Example Traveller',
    phone: '',
    email: '',
    pnr: '',
    bookedOn,
    segments: [
      {
        departure: departure + 'T10:30',
        arrival: '',
        origin: 'TRV',
        destination: 'MAA',
        airline: 'Example Air',
        flightNumber: 'EX 1',
      },
    ],
    agencyCost: '1.00',
    customerCharged: '2.00',
    transactions: [],
    passengers: [],
    currency: 'INR',
    status: 'confirmed',
    createdAt: bookedOn + 'T00:00:00.000Z',
    archived: false,
    version: 1,
  };
}

describe('booking report dates', () => {
  it('uses the computer calendar day rather than the UTC date', () => {
    expect(localDay(new Date(2026, 10, 17, 0, 1))).toBe('2026-11-17');
  });

  it('filters inclusively by the selected date even when the two dates differ', () => {
    const row = booking('2026-11-17', '2026-12-02');
    expect(dateInRange(reportDay(row, 'booking'), '2026-11-17', '2026-11-17')).toBe(true);
    expect(dateInRange(reportDay(row, 'departure'), '2026-11-17', '2026-11-17')).toBe(false);
    expect(dateInRange(reportDay(row, 'departure'), '2026-12-02', '2026-12-02')).toBe(true);
  });

  it('excludes partially selected and current months from forecast training', () => {
    expect(completeThrough('2026-11-17', '2026-09-29')).toBe('2026-08');
    const rows = [
      booking('2026-01-01', '2026-07-19'),
      booking('2026-01-02', '2026-08-18'),
      booking('2026-01-03', '2026-10-02'),
    ];
    const result = forecastHistory(rows, 'departure', '2026-11-17', '2026-07-18', '2026-10-04');
    expect(result.map((r) => [r.month, r.bookings])).toEqual([
      ['2026-08', 1],
      ['2026-09', 0],
    ]);
    expect(forecastHistory(rows, 'departure', '2026-11-17', '10000-01-02', '')).toEqual([]);
  });

  it('keeps an upcoming return leg after the outbound departure has passed', () => {
    const row = booking('2026-11-01', '2026-11-16');
    const returning = { ...row.segments[0], departure: '2026-11-19T10:30' };
    row.segments.push(returning, { ...returning, departure: '2026-11-20T08:00' });
    expect(nextDeparture(row, '2026-11-17')).toBe(returning);
  });
});
