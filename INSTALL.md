# Install TravelIQ Offline

1. Download `TravelIQ-Offline-Setup-1.0.1-x64.exe` from the private GitHub release or copy it to the target PC using a USB drive. A GitHub account with repository access is needed only for a direct download from the private release.
2. On a 64-bit Windows PC, run the installer and open **TravelIQ Offline** from the Start menu or desktop. The workspace starts empty. SQLite and the PDF reader are included; no additional software or account is needed.
3. Connect the external hard drive. In **Settings**, select **Select folder** and choose a folder on that drive, for example `E:\TravelIQ Tickets`. Keep this folder on a local drive rather than a cloud-sync folder if you want ticket files to remain entirely offline.
4. Import a PDF, verify its fields, enter amounts, and save. The original PDF is copied unchanged into a year/month subfolder. The booking itself is saved on the PC. If the drive is unavailable or full, reconnect it or choose another folder and retry in the same form.
5. Use **Settings → Save backup** to back up booking data. Keep a separate copy of the PDF folder. Changing the ticket folder affects future saves; it does not move existing PDFs. Deleting a booking does not delete its PDF copy.

This installer is unsigned and Windows might show an unknown-publisher warning. Only use a copy you obtained from your own private repo or directly from the saved build.

## Uninstall

Open the Windows Start menu, search for **Uninstall TravelIQ Offline**, and follow the prompts. You can also use **Settings → Apps → Installed apps → TravelIQ Offline → Uninstall**. The booking database and settings are preserved for reinstallation. Ticket PDFs stored outside the app's installation folder, including on an external drive, are untouched. If you ever kept ticket copies inside the app's installation folder, move those copies out before uninstalling.
