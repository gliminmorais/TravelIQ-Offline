import type { Booking } from './model';

type Ticket = { bytes: ArrayBuffer };

type TravelIQDesktop = {
  load: () => Promise<Booking[]>;
  save: (bookings: Booking[], ticket?: Ticket) => Promise<void>;
  getTicketFolder: () => Promise<string>;
  chooseTicketFolder: () => Promise<string>;
  backup: () => Promise<boolean>;
  restore: () => Promise<boolean>;
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
