const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createStorage } = require('./storage.cjs');

const APP_URL = 'app://traveliq/';
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.rsc': 'text/x-component',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function isAppURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'app:' && url.host === 'traveliq' && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function serve(request) {
  if (!isAppURL(request.url)) return new Response(null, { status: 403 });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405 });
  let relative;
  try {
    relative = decodeURIComponent(new URL(request.url).pathname).slice(1) || 'index.html';
  } catch {
    return new Response(null, { status: 400 });
  }
  const allowed = relative
    .split('/')
    .every((part) => /^[A-Za-z0-9_.()@\[\]-]+$/.test(part) && part !== '..' && part !== '.');
  if (!allowed) return new Response(null, { status: 403 });
  try {
    const body = await readFile(path.join(app.getAppPath(), 'out', relative));
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': MIME[path.extname(relative)] || 'application/octet-stream',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

app.setName('TravelIQ Offline');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let window;
let storage;
function registerIPC() {
  function register(name, callback, fallback) {
    ipcMain.handle(`traveliq:${name}`, async (event, ...args) => {
      const frame = event.senderFrame;
      if (
        !window ||
        event.sender !== window.webContents ||
        !frame ||
        frame.parent ||
        !isAppURL(frame.url)
      ) {
        return { ok: false, message: 'This action is only available inside TravelIQ Offline.' };
      }
      try {
        return { ok: true, value: await callback(...args) };
      } catch (error) {
        return {
          ok: false,
          message: fallback || error.message || 'The action could not be completed.',
        };
      }
    });
  }
  register('load', () => storage.load(), 'Bookings could not be loaded from this computer.');
  register('save', (bookings, ticket) => {
    try {
      storage.save(bookings, ticket);
    } catch (error) {
      if (error.code?.startsWith('ERR_SQLITE'))
        throw Error(
          'Bookings could not be saved. Check the available space on this computer and try again.',
        );
      throw error;
    }
  });
  register('getTicketFolder', () => storage.getTicketFolder());
  register(
    'chooseTicketFolder',
    async () => {
      const current = storage.getTicketFolder();
      const pick = await dialog.showOpenDialog(window, {
        title: 'Choose a folder for ticket PDFs',
        buttonLabel: 'Use this folder',
        ...(current ? { defaultPath: current } : {}),
        properties: ['openDirectory'],
      });
      if (pick.canceled || !pick.filePaths[0]) return current;
      return storage.setTicketFolder(pick.filePaths[0]);
    },
    'TravelIQ could not use that folder. Choose a writable folder on this computer or on a connected disk.',
  );
  register(
    'backup',
    async () => {
      const pick = await dialog.showSaveDialog(window, {
        title: 'Save booking backup',
        defaultPath: `TravelIQ-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'TravelIQ backup', extensions: ['json'] }],
      });
      if (pick.canceled || !pick.filePath) return false;
      storage.backup(pick.filePath);
      return true;
    },
    'The backup could not be saved. Check the drive and choose a writable destination.',
  );
  register('restore', async () => {
    const pick = await dialog.showOpenDialog(window, {
      title: 'Open a booking backup',
      properties: ['openFile'],
      filters: [{ name: 'TravelIQ backup', extensions: ['json'] }],
    });
    if (pick.canceled || !pick.filePaths[0]) return false;
    const answer = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Restore booking backup',
      message: 'Replace the current bookings with this backup?',
      detail:
        'TravelIQ saves a safety copy of the current bookings first. Ticket PDFs and the chosen ticket folder do not change.',
      buttons: ['Cancel', 'Restore backup'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer.response !== 1) return false;
    storage.restore(pick.filePaths[0]);
    return true;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app
    .whenReady()
    .then(async () => {
      storage = createStorage(app.getPath('userData'));
      session.defaultSession.protocol.handle('app', serve);
      session.defaultSession.webRequest.onBeforeRequest((details, done) => {
        const local = isAppURL(details.url) || /^(blob:|data:)/.test(details.url);
        done({ cancel: !local });
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, reply) =>
        reply(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      Menu.setApplicationMenu(null);
      registerIPC();
      window = new BrowserWindow({
        title: 'TravelIQ Offline',
        width: 1320,
        height: 880,
        minWidth: 850,
        minHeight: 620,
        backgroundColor: '#f5f7fc',
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          webviewTag: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (!isAppURL(url)) event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.on('closed', () => {
        window = undefined;
      });
      window.once('ready-to-show', () => window?.show());
      await window.loadURL(APP_URL);
    })
    .catch(() => {
      dialog.showErrorBox(
        'TravelIQ Offline',
        'TravelIQ could not start. Make sure the full application is installed and its local data folder is accessible.',
      );
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    storage?.close();
    storage = undefined;
  });
}
