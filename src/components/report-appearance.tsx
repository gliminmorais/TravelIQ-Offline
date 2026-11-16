'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { desktop, type BrandingSettings } from '@/lib/desktop';
import { Card, Field } from './ui';

async function logoData(file: File) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw Error('Choose a PNG or JPEG image under 5 MB.');
  }
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw Error('This image could not be opened. Choose a valid PNG or JPEG.');
  }
  try {
    const scale = Math.min(1, 720 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('The image could not be prepared.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    image.close();
  }
}

export function ReportAppearance({
  branding,
  onSave,
}: {
  branding: BrandingSettings;
  onSave: (branding: BrandingSettings) => void;
}) {
  const [header, setHeader] = useState(branding.reportHeader);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  async function changeLogo(file?: File) {
    setBusy(true);
    try {
      onSave(await desktop().setBusinessLogo(file ? await logoData(file) : ''));
      toast.success(file ? 'Business logo saved' : 'Business logo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The logo could not be saved.');
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <Card title="Report appearance" subtitle="Your logo and report header are stored on this PC">
      <div className="setting-row report-logo-row">
        <div>
          <strong>Business logo</strong>
          <small>PNG or JPEG, up to 5 MB. It appears in the app and prints in grayscale.</small>
          {branding.logo && (
            <Image
              unoptimized
              src={branding.logo}
              width={116}
              height={54}
              alt="Business logo preview"
              className="settings-logo"
            />
          )}
        </div>
        <div className="report-setting-actions">
          <input
            type="file"
            ref={picker}
            accept="image/png,image/jpeg"
            hidden
            aria-label="Business logo image"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void changeLogo(file);
            }}
          />
          <button type="button" disabled={busy} onClick={() => picker.current?.click()}>
            {branding.logo ? 'Change logo' : 'Choose logo'}
          </button>
          {branding.logo && (
            <button type="button" disabled={busy} onClick={() => void changeLogo()}>
              Remove logo
            </button>
          )}
        </div>
      </div>
      <form
        className="setting-row report-header-row"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const next = await desktop().setReportHeader(header);
            onSave(next);
            setHeader(next.reportHeader);
            toast.success('Report header saved');
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : 'The report header could not be saved.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <Field label="Report header">
            <input
              type="text"
              value={header}
              maxLength={80}
              onChange={(e) => setHeader(e.target.value)}
            />
          </Field>
          <small>Shown above “Booking report”. Leave blank to restore the default.</small>
        </div>
        <button type="submit" disabled={busy || header.trim() === branding.reportHeader}>
          Save report header
        </button>
      </form>
    </Card>
  );
}
