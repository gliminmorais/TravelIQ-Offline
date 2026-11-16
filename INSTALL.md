# Install TravelIQ Offline

1. Download the latest `TravelIQ-Offline-Setup-*-x64.exe` from the private GitHub release or copy it to the target PC using a USB drive. A GitHub account with repository access is needed only for a direct download from the private release.
2. On a 64-bit Windows PC, run the installer and open **TravelIQ Offline** from the Start menu or desktop. The workspace starts empty. SQLite and the PDF reader are included; no additional software or account is needed.
3. Connect the external hard drive. In **Settings**, select **Select folder** and choose a folder on that drive, for example `E:\TravelIQ Tickets`. Keep this folder on a local drive rather than a cloud-sync folder if you want ticket files to remain entirely offline.
4. Import a PDF, verify its fields, enter amounts, and save. The original PDF is copied unchanged into a year/month subfolder. The booking itself is saved on the PC. If the drive is unavailable or full, reconnect it or choose another folder and retry in the same form.
5. Use **Settings → Save backup** to back up booking data. Keep a separate copy of the PDF folder. Changing the ticket folder affects future saves; it does not move existing PDFs. Deleting a booking does not delete its PDF copy.

## Export a report

Choose a date range and either **Booked date** (the default) or **Departure date**. Both export formats use your current filters. Choose **Export PDF** for the portrait report, or select **CSV** in the format dropdown. The PDF keeps both dates visible, uses the selected date basis in the heading, and prints without shaded backgrounds.

Go to **Settings → Report appearance** to choose a PNG or JPEG business logo and save a custom report header. The logo appears in color in the app and in grayscale in the PDF. These settings stay on this PC.

## Update

Close TravelIQ, then run the newer installer over the existing copy while signed in to the same Windows account. Your local bookings, settings and ticket files stay in place. There is no need to uninstall first.

This installer is unsigned and Windows might show an unknown-publisher warning. Only use a copy you obtained from your own private repo or directly from the saved build.
