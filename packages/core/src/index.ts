export const CORE_READY = true;

// Export mínima para Task 3 (i18n en apps/web). Task 4 la sustituye por el
// registry definitivo tipado; este test no cambia.
export const SERVICES: readonly { id: string; labelKey: string }[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
];
