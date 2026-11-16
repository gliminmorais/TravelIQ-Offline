# TravelIQ Offline

A private Windows desktop edition of TravelIQ. Bookings, finances, PDF import, reports, and CSV export run locally without a server, an internet connection, or a login. New installations start with an empty workspace.

- [Install and choose a ticket folder](INSTALL.md)
- [Private release downloads](https://github.com/gliminmorais/TravelIQ-Offline/releases)

The app keeps its SQLite database on the computer. Imported PDFs are copied separately to the folder selected in Settings. Bookings and reports remain available if you move the PDFs or disconnect the drive. Folder changes apply to future copies. Save a booking backup from Settings and back up the PDF folder separately. A restore saves a safety copy of current bookings first.

## Build from source (Windows x64)

Use Node.js 24. Internet is needed on the build machine to fetch development dependencies, not on the computer using the finished installer.

```powershell
npm ci
npm test
npm run test:desktop
npm run dist:win
```

The packaged installer is written to `release/TravelIQ-Offline-Setup-1.0.1-x64.exe`. Electron bundles the desktop runtime and SQLite; the static Next.js interface is bundled inside the app. The app loads through an internal protocol and blocks external renderer requests. No ticket PDF, database file or backup belongs in Git.

## Publish an update

In a local checkout of this private repository, make and test your changes. Run `npm version patch --no-git-tag-version` to update both package files, then commit them with your changes and push to `main`. The Windows installer workflow builds and publishes the new `.exe`; check [Actions](https://github.com/gliminmorais/TravelIQ-Offline/actions) for the result and [Releases](https://github.com/gliminmorais/TravelIQ-Offline/releases) for the download. Every release needs a new version number. You can also run the **Windows installer** workflow manually for `main`.

On the target computer, close TravelIQ and run the newer installer over the existing installation. Keep the same Windows account and installation folder. The local database and external ticket folder stay in place. Use **Settings → Save backup** before updating if you want a separate recovery copy.
