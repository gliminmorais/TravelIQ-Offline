import type { Booking } from './model';
import type { DateBasis } from './report-dates';

type Ticket = { bookingId: string; bytes: ArrayBuffer };
export type BrandingSettings = { reportHeader: string; logo: string };
export const defaultBranding: BrandingSettings = {
  reportHeader: 'TRAVELIQ OFFLINE / REPORTS',
  logo: '',
};
export type BookingReportRequest = {
  basis: DateBasis;
  start: string;
  end: string;
  rows: {
    customer: string;
    bookedOn: string;
    departure: string;
    airline: string;
    charge: string;
    profit: string;
    outstanding: string;
  }[];
};

type TravelIQDesktop = {
  load: () => Promise<Booking[]>;
  save: (bookings: Booking[], ticket?: Ticket) => Promise<void>;
  getTicketFolder: () => Promise<string>;
  chooseTicketFolder: () => Promise<string>;
  backup: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  getBranding: () => Promise<BrandingSettings>;
  setReportHeader: (value: string) => Promise<BrandingSettings>;
  setBusinessLogo: (dataUrl: string) => Promise<BrandingSettings>;
  exportBookingPdf: (request: BookingReportRequest) => Promise<boolean>;
};

declare global {
  interface Window {
    travelIQDesktop?: TravelIQDesktop;
  }
}

export function desktop() {
  const bridge = window.travelIQDesktop;
  if (!bridge) throw new Error('Open the installed TravelIQ desktop app to use this workspace.');
  return bridge;
}
