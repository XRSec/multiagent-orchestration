// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    // Append the product name so each harness row's actions stay distinguishable.
    t: (key: string, values?: { name?: string }) => (values?.name ? `${key} ${values.name}` : key),
  }),
}));

import { AgentVersionsRows } from '../AboutSection';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog-provider';

const getBinaryVersion = vi.fn();
const relaunchForHarnessUpdate = vi.fn();
const prepareHarnessUpdate = vi.fn();
const anyActivityBlockingRelaunch = vi.fn();

type Online = { latestVersion: string; updateAvailable: boolean } | 'failed' | null;

function versionResult(kind: string, options: { checkLatest?: boolean } | undefined, online: Online) {
  const local = { kind, binaryPath: `/${kind}`, version: '2.1.258 (Claude Code)', latestCheckFailed: false };
  if (!options?.checkLatest || !online) return { ...local, latestVersion: null, updateAvailable: false };
  if (online === 'failed') return { ...local, latestVersion: null, updateAvailable: false, latestCheckFailed: true };
  return { ...local, ...online };
}

const CLAUDE_UPDATE = { latestVersion: '2.2.0', updateAvailable: true };

function mockOnline(byKind: Partial<Record<'claude-code', Online>>) {
  getBinaryVersion.mockImplementation((kind: 'claude-code', options?: { checkLatest?: boolean }) =>
    Promise.resolve(versionResult(kind, options, byKind[kind] ?? null)),
  );
}

async function openMenu(name = 'Claude Code') {
  await waitFor(() => expect(screen.queryByText('settings.about.harnessChecking')).toBeNull());
  fireEvent.keyDown(screen.getByRole('button', { name: `settings.about.harnessManage ${name}` }), { key: 'ArrowDown' });
  await screen.findByRole('menu');
}

describe('AboutSection agent binary versions', () => {
  const renderRows = () =>
    render(
      <ConfirmDialogProvider>
        <AgentVersionsRows />
      </ConfirmDialogProvider>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    prepareHarnessUpdate.mockResolvedValue({ ready: true });
    anyActivityBlockingRelaunch.mockResolvedValue(false);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      relaunchForHarnessUpdate,
      prepareHarnessUpdate,
      anyActivityBlockingRelaunch,
      maker: {
        agent: {
          getBinaryVersion,
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('requests and renders only Claude Code version (zero UI footprint for codex and pi)', async () => {
    getBinaryVersion.mockImplementation((kind: string) =>
      Promise.resolve({
        kind,
        binaryPath: `/${kind}`,
        version: '2.1.258 (Claude Code)',
        latestVersion: null,
        updateAvailable: false,
        latestCheckFailed: false,
      }),
    );

    renderRows();

    await waitFor(() => expect(getBinaryVersion).toHaveBeenCalledTimes(2));
    expect(getBinaryVersion).toHaveBeenCalledWith('claude-code');
    expect(getBinaryVersion).toHaveBeenCalledWith('claude-code', { checkLatest: true });
    await waitFor(() => {
      expect(screen.getByText('settings.about.claudeCodeVersionLabel')).toBeTruthy();
      expect(screen.getByText('2.1.258')).toBeTruthy();
      expect(screen.queryByText('settings.about.codexVersionLabel')).toBeNull();
      expect(screen.queryByText('settings.about.piVersionLabel')).toBeNull();
    });
  });

  it('shows the local version while the online comparison is still checking', async () => {
    getBinaryVersion.mockImplementation((kind: string, options?: { checkLatest?: boolean }) =>
      options?.checkLatest ? new Promise(() => {}) : Promise.resolve(versionResult(kind, options, null)),
    );

    renderRows();

    await waitFor(() => expect(screen.getAllByText('2.1.258')).toHaveLength(1));
    expect(screen.queryByText('settings.about.version.loading')).toBeNull();
    expect(screen.getAllByText('settings.about.harnessChecking')).toHaveLength(1);
  });

  it('marks update available when online check reports a newer version', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });

    renderRows();

    await screen.findByText('settings.about.harnessUpdateAvailable');
    expect(screen.getAllByText('settings.about.harnessUpdateAvailable')).toHaveLength(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('2.2.0')).toBeNull();

    await openMenu('Claude Code');
    const update = screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*2\.2\.0/ });
    expect(update.getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByText('settings.about.harnessCheckedAt')).toBeTruthy();
  });

  it('disables the update action when the channel has no newer version', async () => {
    mockOnline({ 'claude-code': { latestVersion: '2.1.0', updateAvailable: false } });

    renderRows();
    await openMenu('Claude Code');

    const update = screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*2\.1\.0/ });
    expect(update.getAttribute('aria-disabled')).toBe('true');
  });

  it('reports a failed online check inline and keeps the local version', async () => {
    mockOnline({ 'claude-code': 'failed' });

    renderRows();

    await screen.findByText('settings.about.harnessCheckFailed');
    expect(screen.getAllByText('settings.about.harnessCheckFailed')).toHaveLength(1);
    expect(screen.getAllByText('2.1.258')).toHaveLength(1);
    const status = screen.getByRole('status');
    expect(status.className).toContain('min-w-0');
    expect(status.className).not.toContain('shrink-0');
    expect(status.querySelector('.break-words')).toBeTruthy();
    expect(status.closest('[class*="overflow-hidden"]')).toBeTruthy();

    await openMenu('Claude Code');
    expect(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*—/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText('settings.about.harnessCheckedAt')).toBeNull();
  });

  it('disables update while a later check is still in flight', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });

    renderRows();
    await screen.findByText('settings.about.harnessUpdateAvailable');

    getBinaryVersion.mockImplementation((kind: 'claude-code', options?: { checkLatest?: boolean }) => {
      if (kind === 'claude-code' && options?.checkLatest) return new Promise(() => {});
      return Promise.resolve(versionResult(kind, options, null));
    });
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: 'settings.about.harnessCheck' }));

    await screen.findByText('settings.about.harnessChecking');
    fireEvent.keyDown(screen.getByRole('button', { name: 'settings.about.harnessManage Claude Code' }), { key: 'ArrowDown' });
    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*2\.2\.0/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('checks again from the menu, keeps the last version, and disables update when that check fails', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });

    renderRows();
    await screen.findByText('settings.about.harnessUpdateAvailable');

    mockOnline({ 'claude-code': 'failed' });
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: 'settings.about.harnessCheck' }));

    await screen.findByText('settings.about.harnessCheckFailed');
    expect(getBinaryVersion.mock.calls.filter(([kind, options]) => kind === 'claude-code' && options?.checkLatest)).toHaveLength(2);
    await openMenu('Claude Code');
    expect(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*2\.2\.0/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('settings.about.harnessCheckedAt')).toBeTruthy();
  });

  it('disables update when a later check rejects before returning a result', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });

    renderRows();
    await screen.findByText('settings.about.harnessUpdateAvailable');

    getBinaryVersion.mockImplementation((kind: 'claude-code', options?: { checkLatest?: boolean }) => {
      if (kind === 'claude-code' && options?.checkLatest) return Promise.reject(new Error('ipc closed'));
      return Promise.resolve(versionResult(kind, options, null));
    });
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: 'settings.about.harnessCheck' }));

    await screen.findByText('settings.about.harnessCheckFailed');
    await openMenu('Claude Code');
    expect(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code.*2\.2\.0/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('requires confirmation and relaunches only for the confirmed harness', async () => {
    mockOnline({ 'claude-code': { ...CLAUDE_UPDATE, latestVersion: 'v2.2.0' } });
    relaunchForHarnessUpdate.mockResolvedValue({ accepted: true });

    renderRows();
    await openMenu('Claude Code');

    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    await screen.findByText('settings.about.harnessUpdateDescription Claude Code');
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();
    expect(prepareHarnessUpdate).toHaveBeenCalledExactlyOnceWith('claude-code', 'v2.2.0');
    fireEvent.click(screen.getByRole('button', { name: 'settings.about.harnessUpdateConfirm Claude Code' }));
    await waitFor(() => expect(relaunchForHarnessUpdate).toHaveBeenCalledExactlyOnceWith('claude-code', 'v2.2.0'));
  });

  it('shows preparation before asking to restart and permits a retry after download failure', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });
    const preparation = Promise.withResolvers<{ ready: true }>();
    prepareHarnessUpdate.mockReturnValueOnce(preparation.promise);
    renderRows();
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    await screen.findByText('settings.about.piKernel.download');
    expect(screen.queryByText('settings.about.harnessUpdateDescription Claude Code')).toBeNull();
    expect(anyActivityBlockingRelaunch).not.toHaveBeenCalled();
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();
    preparation.reject(new Error('download failed'));
    await waitFor(() => expect(screen.queryByText('settings.about.piKernel.download')).toBeNull());
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    await screen.findByText('settings.about.harnessUpdateDescription Claude Code');
    expect(prepareHarnessUpdate).toHaveBeenCalledTimes(2);
  });

  it('does not open a restart confirmation after the settings row was unmounted during preparation', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });
    const preparation = Promise.withResolvers<{ ready: true }>();
    prepareHarnessUpdate.mockReturnValueOnce(preparation.promise);
    const rendered = renderRows();
    await openMenu('Claude Code');
    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    await screen.findByText('settings.about.piKernel.download');
    rendered.unmount();
    preparation.resolve({ ready: true });
    await preparation.promise;
    expect(anyActivityBlockingRelaunch).not.toHaveBeenCalled();
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();
  });

  it('asks again before a harness restart would interrupt in-flight work', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });
    anyActivityBlockingRelaunch.mockResolvedValue(true);
    relaunchForHarnessUpdate.mockResolvedValue({ accepted: true });

    renderRows();
    await openMenu('Claude Code');

    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'settings.about.harnessUpdateConfirm Claude Code' }));
    await screen.findByText('settings.about.harnessUpdateBusyDescription Claude Code');
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'settings.about.harnessUpdateConfirm Claude Code' }));
    await waitFor(() => expect(relaunchForHarnessUpdate).toHaveBeenCalledExactlyOnceWith('claude-code', '2.2.0'));
  });

  it('does not relaunch when the busy probe fails and the interruption warning is declined', async () => {
    mockOnline({ 'claude-code': CLAUDE_UPDATE });
    anyActivityBlockingRelaunch.mockRejectedValue(new Error('ipc channel closed'));

    renderRows();
    await openMenu('Claude Code');

    fireEvent.click(screen.getByRole('menuitem', { name: /harnessUpdateButton Claude Code/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'settings.about.harnessUpdateConfirm Claude Code' }));
    await screen.findByText('settings.about.harnessUpdateBusyDescription Claude Code');

    fireEvent.click(screen.getByRole('button', { name: 'settings.about.harnessUpdateCancel' }));
    expect(relaunchForHarnessUpdate).not.toHaveBeenCalled();
  });
});
