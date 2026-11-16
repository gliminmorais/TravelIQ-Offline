const { contextBridge, ipcRenderer } = require('electron');

async function call(name, ...args) {
  const reply = await ipcRenderer.invoke(`traveliq:${name}`, ...args);
  if (!reply.ok) throw Error(reply.message);
  return reply.value;
}

contextBridge.exposeInMainWorld('travelIQDesktop', {
  load: () => call('load'),
  save: (bookings, ticket) => call('save', bookings, ticket),
  getTicketFolder: () => call('getTicketFolder'),
  chooseTicketFolder: () => call('chooseTicketFolder'),
  backup: () => call('backup'),
  restore: () => call('restore'),
});
