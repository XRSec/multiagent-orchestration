import type { SettingsSearchModule } from './settingsSearchTypes';

/** Static search metadata owned by this settings module; no component mounting or IPC. */
export default {
  id: 'billing',
  order: 3,
  entries: [
    /* [Disabled: 计费与用量]
    { id: 'billing', tab: 'billing', targetId: 'settings-panel-billing', titleKey: 'settings.tabs.billing', sectionKey: 'settings.sections.billing' },
    */
  ],
} satisfies SettingsSearchModule;
