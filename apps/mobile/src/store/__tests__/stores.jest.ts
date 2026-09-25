import { beforeEach, describe, expect, it } from '@jest/globals';
import { demoSessions } from '@/fixtures/demo-data';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useSettingsStore } from '@/store/settings-store';

describe('mobile UI stores', () => {
  beforeEach(() => {
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useComposerStore.setState({ draft: '', model: 'gpt-5.2-codex', thinking: 'medium', permission: 'ask', sending: false, generating: false, contextPercent: 24 });
    useHistoryStore.setState({ sessions: demoSessions, query: '' });
    useAttachmentStore.setState({ items: [] });
    useSettingsStore.setState({ theme: 'system', defaultModel: 'gpt-5.2-codex', defaultThinking: 'medium', defaultPermission: 'ask', notifications: true, haptics: true, compactHistory: false });
    useConversationStore.getState().startNewSession();
    useConversationStore.setState({ workspaceId: null });
  });

  it('keeps drawer and sheets mutually exclusive', () => {
    useNavigationStore.getState().setDrawerOpen(true);
    useNavigationStore.getState().openSheet('workspace');
    expect(useNavigationStore.getState()).toMatchObject({ drawerOpen: false, sheet: 'workspace' });
    useNavigationStore.getState().closeSheet();
    expect(useNavigationStore.getState().sheet).toBeNull();
  });

  it('selects model, thinking and permission', () => {
    useComposerStore.getState().selectModel('claude-sonnet-5');
    useComposerStore.getState().selectThinking('high');
    useComposerStore.getState().selectPermission('plan');
    expect(useComposerStore.getState()).toMatchObject({ model: 'claude-sonnet-5', thinking: 'high', permission: 'plan' });
  });

  it('rejects empty and duplicate submissions and bounds draft length', () => {
    useComposerStore.getState().setDraft('   ');
    expect(useComposerStore.getState().submitDraft()).toBe(false);
    useComposerStore.getState().setDraft('x'.repeat(12000));
    expect(useComposerStore.getState().draft).toHaveLength(10000);
    expect(useComposerStore.getState().submitDraft()).toBe(true);
    expect(useComposerStore.getState().draft).toBe('');
    expect(useComposerStore.getState().submitDraft()).toBe(false);
  });

  it('clamps context percentage and toggles generation', () => {
    useComposerStore.getState().setContextPercent(-4);
    expect(useComposerStore.getState().contextPercent).toBe(0);
    useComposerStore.getState().setContextPercent(140);
    expect(useComposerStore.getState().contextPercent).toBe(100);
    useComposerStore.getState().toggleGeneration();
    expect(useComposerStore.getState().generating).toBe(true);
    useComposerStore.getState().toggleGeneration();
    expect(useComposerStore.getState().generating).toBe(false);
  });

  it('renames, pins, archives and deletes a known session safely', () => {
    const id = 'session-mobile';
    useHistoryStore.getState().renameSession(id, '  新名称  ');
    expect(useHistoryStore.getState().sessions.find((item) => item.id === id)?.title).toBe('新名称');
    useHistoryStore.getState().renameSession(id, '   ');
    expect(useHistoryStore.getState().sessions.find((item) => item.id === id)?.title).toBe('新名称');
    useHistoryStore.getState().togglePinned(id);
    expect(useHistoryStore.getState().sessions.find((item) => item.id === id)?.pinned).toBe(true);
    useHistoryStore.getState().archiveSession(id);
    expect(useHistoryStore.getState().sessions.find((item) => item.id === id)?.archived).toBe(true);
    useHistoryStore.getState().deleteSession(id);
    expect(useHistoryStore.getState().sessions.some((item) => item.id === id)).toBe(false);
    useHistoryStore.getState().deleteSession('missing');
    expect(useHistoryStore.getState().sessions).toHaveLength(demoSessions.length - 1);
  });

  it('manages attachment deduplication, failure and removal', () => {
    const attachment = { id: 'file-1', name: 'spec.pdf', size: 2000, kind: 'pdf' as const, status: 'ready' as const };
    useAttachmentStore.getState().addAttachment(attachment);
    useAttachmentStore.getState().addAttachment({ ...attachment, name: 'spec-v2.pdf' });
    expect(useAttachmentStore.getState().items).toHaveLength(1);
    useAttachmentStore.getState().markFailed('file-1');
    expect(useAttachmentStore.getState().items[0]?.status).toBe('failed');
    useAttachmentStore.getState().removeAttachment('file-1');
    expect(useAttachmentStore.getState().items).toHaveLength(0);
  });

  it('updates settings with a safe model fallback', () => {
    useSettingsStore.getState().setDefaultModel('   ');
    expect(useSettingsStore.getState().defaultModel).toBe('gpt-5.2-codex');
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setDefaultThinking('high');
    useSettingsStore.getState().setDefaultPermission('auto');
    useSettingsStore.getState().toggleNotifications();
    useSettingsStore.getState().toggleHaptics();
    useSettingsStore.getState().toggleCompactHistory();
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', defaultThinking: 'high', defaultPermission: 'auto', notifications: false, haptics: false, compactHistory: true });
  });

  it('opens sessions, appends messages and resolves permissions once', () => {
    const session = demoSessions[0];
    if (session === undefined) throw new Error('fixture missing');
    useConversationStore.getState().openSession(session);
    useConversationStore.getState().appendMessage({ id: 'm', kind: 'user', text: '继续', createdAt: 'now' });
    expect(useConversationStore.getState().session.messages).toHaveLength(session.messages.length + 1);
    useConversationStore.getState().requestPermission({ id: 'p1', title: '运行测试', command: 'bun test', approved: null });
    useConversationStore.getState().resolvePermission(true);
    expect(useConversationStore.getState().permissionRequest?.approved).toBe(true);
  });

  it('chooses a workspace for new tasks', () => {
    useConversationStore.getState().chooseWorkspace('workspace-mobile', 'Pai Mobile');
    expect(useConversationStore.getState()).toMatchObject({ workspaceId: 'workspace-mobile' });
    expect(useConversationStore.getState().session.project).toBe('Pai Mobile');
  });
});
