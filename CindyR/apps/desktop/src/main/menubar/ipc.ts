import { ipcMain } from 'electron';

import { MENUBAR_GET_STATE_CHANNEL, MENUBAR_SET_ENABLED_CHANNEL } from '../../shared/menubarQuota.js';
import { assertTrustedAppRendererEvent } from '../security/trustedAppRenderer.js';
import { requireBoolean } from '../utils/ipcValidate.js';
import { getMenubarState, setMenubarEnabled } from './service.js';

/** Settings → Window behavior toggle. Local app renderer only; not a device-link capability. */
export function registerMenubarIpc(): void {
  /* [Disabled: 菜单栏用量显示] 始终返回不可用/关闭状态 */
  ipcMain.handle(MENUBAR_GET_STATE_CHANNEL, (event) => {
    assertTrustedAppRendererEvent(event);
    return { available: false, enabled: false, busy: false, lowOnEverything: false, items: [] };
  });
  ipcMain.handle(MENUBAR_SET_ENABLED_CHANNEL, (event) => {
    assertTrustedAppRendererEvent(event);
    return { available: false, enabled: false, busy: false, lowOnEverything: false, items: [] };
  });
}
