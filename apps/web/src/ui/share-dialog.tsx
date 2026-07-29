import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/i18n';

type Props = {
  open: boolean;
  url: string;
  onClose: () => void;
};

export function ShareDialog({ open, url, onClose }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      closeRef.current?.focus();
      return;
    }
    if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus(t('share.copied'));
    } catch {
      setCopyStatus(t('share.copyFailed'));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="share-title"
      aria-describedby="share-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-w-lg rounded-lg border border-border bg-bg p-5 text-fg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id="share-title" className="text-lg font-semibold">
          {t('share.title')}
        </h2>
        <p id="share-description" className="text-sm text-muted">
          {t('share.omissions')}
        </p>
        <input
          aria-label={t('share.url')}
          value={url}
          readOnly
          className="rounded-md border border-border bg-surface p-2 text-sm"
        />
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
          {copyStatus}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-border px-3"
          >
            {t('share.close')}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="min-h-11 rounded-md bg-accent px-3 text-accent-fg"
          >
            {t('share.copy')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
