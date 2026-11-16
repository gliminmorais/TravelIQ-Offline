# TravelIQ Offline

A private Windows desktop edition of TravelIQ. Bookings, finances, PDF import, reports, and CSV export run locally without a server, an internet connection, or a login. New installations start with an empty workspace.

- [Install and choose a ticket folder](INSTALL.md)
- [Private release downloads](https://github.com/gliminmorais/TravelIQ-Offline/releases)

The app keeps its SQLite database on the computer. Imported PDFs are copied separately to the folder selected in Settings. Bookings and reports remain available if you move the PDFs or disconnect the drive. Folder changes apply to future copies. Save a booking backup from Settings and back up the PDF folder separately. A restore saves a safety copy of current bookings first.

**Booking exports:** PDF is the default, with CSV available in the format dropdown. The A4 portrait PDF uses black text and thin gray rules. Set a logo and report header under **Settings → Report appearance**. Use **Booked date** (default) or **Departure date** to filter the booking views and all exported rows.

## Build from source (Windows x64)

Use Node.js 24. Internet is needed on the build machine to fetch development dependencies, not on the computer using the finished installer.

```powershell
npm ci
npm test
npm run test:desktop
npm run dist:win
```

The packaged installer is written to `release/TravelIQ-Offline-Setup-<version>-x64.exe`. Electron bundles the desktop runtime and SQLite; the static Next.js interface is bundled inside the app. The app loads through an internal protocol and blocks external renderer requests. No ticket PDF, database file or backup belongs in Git.

To publish an update, make and test your changes, run `npm version patch --no-git-tag-version`, then commit the source and both updated package files and push to `main`. Check the **Windows installer** workflow and download the new version from **Releases** once it succeeds. Every release needs its own version number. Install the newer version over the existing copy.
