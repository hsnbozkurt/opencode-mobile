import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  Divider,
  IconButton,
  List,
  Menu,
  Portal,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatRelativeTime, getSessionSubtitle } from '@/lib/opencode/format';
import type { FileNode, Session } from '@/lib/opencode/types';
import { useOpencode } from '@/providers/opencode-provider';

export default function WorkspaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const {
    activeProject,
    connection,
    createSession,
    deleteSession,
    currentProjectPath,
    currentSessionId,
    isRefreshingSessions,
    isRefreshingWorkspaceCatalog,
    openSession,
    projects,
    refreshSessions,
    refreshWorkspaceCatalog,
    refreshWorkspaceStatus,
    renameSession,
    selectProject,
    serverRootPath,
    sessionPreviewById,
    sessionStatuses,
    sessions,
    archivedSessions,
    archiveSession,
    restoreSession,
    refreshArchivedSessions,
    shareSession,
    unshareSession,
    searchWorkspaceFiles,
    openWorkspaceFile,
    workspaceFiles,
    workspaceFileStatuses,
    selectedWorkspaceFile,
    saveWorkspaceFile,
    vcsInfo,
    worktrees,
    refreshWorktrees,
    createWorktree,
    resetWorktree,
    removeWorktree,
    browseServerDirectory,
    searchServerDirectories,
    addProject,
  } = useOpencode();
  const [isCreating, setIsCreating] = useState(false);
  const [activePanel, setActivePanel] = useState<'chats' | 'files' | 'tools'>('chats');
  const [showArchived, setShowArchived] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string>();
  const [projectMenuVisible, setProjectMenuVisible] = useState(false);
  const [updatingSessionId, setUpdatingSessionId] = useState<string | undefined>();
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  const [renameValue, setRenameValue] = useState('');
  const [fileQuery, setFileQuery] = useState('');
  const [editingFile, setEditingFile] = useState<{ path: string; original: string; value: string }>();
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [updatingArchivedSessionId, setUpdatingArchivedSessionId] = useState<string>();
  const [worktreeName, setWorktreeName] = useState('');
  const [worktreeStartCommand, setWorktreeStartCommand] = useState('');
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [isRefreshingWorktrees, setIsRefreshingWorktrees] = useState(false);
  const [updatingWorktree, setUpdatingWorktree] = useState<string>();
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerRoot, setPickerRoot] = useState<string>();
  const [pickerDir, setPickerDir] = useState<string>();
  const [pickerEntries, setPickerEntries] = useState<FileNode[]>([]);
  const [pickerResults, setPickerResults] = useState<string[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAdding, setPickerAdding] = useState<string>();
  const pickerSearchTimer = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string>();

  const isRefreshing = isRefreshingSessions || isRefreshingWorkspaceCatalog;
  const orderedSessions = useMemo(
    () => [...sessions].sort((left, right) => {
      const leftPriority = left.id === currentSessionId ? 0 : sessionStatuses[left.id]?.type === 'idle' ? 2 : 1;
      const rightPriority = right.id === currentSessionId ? 0 : sessionStatuses[right.id]?.type === 'idle' ? 2 : 1;
      return leftPriority - rightPriority || right.time.updated - left.time.updated;
    }),
    [currentSessionId, sessionStatuses, sessions],
  );

  async function handleRefresh() {
    await Promise.all([refreshWorkspaceCatalog(), refreshSessions(), refreshWorkspaceStatus()])
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not refresh the workspace.'));
  }

  async function handleNewChat() {
    setIsCreating(true);
    try {
      const session = await createSession();
      await openSession(session.id);
      router.push('/(tabs)');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a session.');
    } finally {
      setIsCreating(false);
    }
  }

  function parentDirectory(dir: string) {
    const normalized = dir.replace(/[\\/]+$/, '');
    const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
    return idx > 0 ? normalized.slice(0, idx + 1) : undefined;
  }

  function joinServerPath(root: string, rel: string) {
    const separator = /^[A-Za-z]:/.test(root) ? '\\' : '/';
    return root.replace(/[\\/]+$/, '') + separator + rel.replace(/[\\/]/g, separator);
  }

  async function loadPickerListing(directory: string) {
    setPickerLoading(true);
    try {
      setPickerEntries(await browseServerDirectory(directory));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not list the folder.');
    } finally {
      setPickerLoading(false);
    }
  }

  function openProjectPicker() {
    setPickerQuery('');
    setPickerResults([]);
    const start = serverRootPath || activeProject?.path || currentProjectPath;
    if (!start) {
      setError('The server root folder is unknown.');
      return;
    }
    setPickerRoot(start);
    setPickerDir(start);
    setProjectPickerVisible(true);
    void loadPickerListing(start);
  }

  function handlePickerQueryChange(value: string) {
    setPickerQuery(value);
    if (pickerSearchTimer.current) {
      clearTimeout(pickerSearchTimer.current);
      pickerSearchTimer.current = undefined;
    }
    if (!value.trim() || !pickerRoot) {
      setPickerResults([]);
      return;
    }
    pickerSearchTimer.current = setTimeout(() => {
      void searchServerDirectories(value.trim(), pickerRoot)
        .then((paths) => setPickerResults(paths.map((path) => joinServerPath(pickerRoot, path))))
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not search folders.'));
    }, 300);
  }

  async function handleAddProject(directory: string) {
    setPickerAdding(directory);
    try {
      await addProject(directory);
      selectProject(directory);
      if (pickerSearchTimer.current) {
        clearTimeout(pickerSearchTimer.current);
        pickerSearchTimer.current = undefined;
      }
      setProjectPickerVisible(false);
      setPickerQuery('');
      setPickerResults([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the project.');
    } finally {
      setPickerAdding(undefined);
    }
  }

  async function handleDelete(sessionId: string) {
    setUpdatingSessionId(sessionId);
    try {
      await deleteSession(sessionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the session.');
    } finally {
      setUpdatingSessionId(undefined);
    }
  }

  async function handleArchive(sessionId: string) {
    setUpdatingSessionId(sessionId);
    try {
      await archiveSession(sessionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not archive the session.');
    } finally {
      setUpdatingSessionId(undefined);
    }
  }

  async function handleArchivedSession(sessionId: string, action: 'restore' | 'delete') {
    setUpdatingArchivedSessionId(sessionId);
    try {
      if (action === 'restore') await restoreSession(sessionId);
      else {
        await deleteSession(sessionId);
        await refreshArchivedSessions();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not ${action} the session.`);
    } finally {
      setUpdatingArchivedSessionId(undefined);
    }
  }

  function confirmDestructive(title: string, message: string, actionLabel: string, action: () => void) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${title}\n\n${message}`)) action();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: action },
    ]);
  }

  function confirmDelete(session: Session) {
    const message = `“${session.title || 'Untitled chat'}” and all of its data will be permanently deleted.`;
    confirmDestructive('Delete session?', message, 'Delete', () => void handleDelete(session.id));
  }

  async function handleShare(session: Session) {
    setUpdatingSessionId(session.id);
    try {
      if (session.share?.url) {
        await unshareSession(session.id);
      } else {
        const shared = await shareSession(session.id);
        if (shared.share?.url) await Clipboard.setStringAsync(shared.share.url);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update session sharing.');
    } finally {
      setUpdatingSessionId(undefined);
    }
  }

  function confirmShare(session: Session) {
    if (session.share?.url) {
      void handleShare(session);
      return;
    }
    const message = 'Anyone with the generated link may be able to view this session.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`Share session publicly?\n\n${message}`)) void handleShare(session);
      return;
    }
    Alert.alert('Share session publicly?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Share', onPress: () => void handleShare(session) },
    ]);
  }

  function renderSessionItem(session: Session, index: number, total: number) {
    return (
      <View key={session.id}>
        <List.Item
          title={session.title || 'Untitled chat'}
          description={sessionPreviewById[session.id] || getSessionSubtitle(session)}
          onPress={() => {
            void openSession(session.id)
              .then(() => router.push('/(tabs)'))
              .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open the session.'));
          }}
          titleStyle={{ color: palette.text, fontWeight: currentSessionId === session.id ? '700' : '500' }}
          descriptionStyle={{ color: palette.muted }}
          right={() => (
            <View style={styles.sessionMeta}>
              <Text style={{ color: palette.tint }}>{sessionStatuses[session.id]?.type || 'idle'}</Text>
              <Menu
                visible={sessionActionId === session.id}
                onDismiss={() => setSessionActionId(undefined)}
                anchor={<IconButton icon="dots-vertical" accessibilityLabel={`Actions for ${session.title || 'Untitled chat'}`} onPress={() => setSessionActionId(session.id)} />}>
                <Menu.Item title="Rename" leadingIcon="pencil" onPress={() => { setSessionActionId(undefined); setRenamingSessionId(session.id); setRenameValue(session.title || ''); }} />
                <Menu.Item title={session.share?.url ? 'Unshare' : 'Share'} leadingIcon="share-variant" onPress={() => { setSessionActionId(undefined); confirmShare(session); }} />
                <Menu.Item title="Archive" leadingIcon="archive-outline" disabled={updatingSessionId === session.id} onPress={() => { setSessionActionId(undefined); void handleArchive(session.id); }} />
                <Menu.Item title="Delete" leadingIcon="delete-outline" titleStyle={{ color: palette.danger }} onPress={() => { setSessionActionId(undefined); confirmDelete(session); }} />
              </Menu>
            </View>
          )}
        />
        {renamingSessionId === session.id ? (
          <View style={[styles.renameRow, compact && styles.compactFormRow]}>
            <TextInput testID="workspace-session-title-input" mode="outlined" dense value={renameValue} onChangeText={setRenameValue} style={styles.renameInput} />
            <Button mode="contained" onPress={() => void renameSession(session.id, renameValue)
              .then(() => setRenamingSessionId(undefined))
              .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not rename the session.'))}>Save</Button>
            <Button onPress={() => setRenamingSessionId(undefined)}>Cancel</Button>
          </View>
        ) : null}
        {index < total - 1 ? <Divider /> : null}
      </View>
    );
  }

  return (
    <>
      <Appbar.Header
        style={[styles.header, { backgroundColor: palette.surface, paddingTop: insets.top, height: 64 + insets.top }]}
        statusBarHeight={0}
        elevated>
        <View style={styles.headerMain}>
          <Menu
            visible={projectMenuVisible}
            onDismiss={() => setProjectMenuVisible(false)}
            anchor={
              <Pressable onPress={() => setProjectMenuVisible(true)} style={({ pressed }) => [styles.headerSelector, pressed && styles.headerSelectorPressed]}>
                <View style={styles.headerCopy}>
                  <Text numberOfLines={1} variant="titleMedium" style={[styles.headerTitle, { color: palette.text }]}>{activeProject?.label || 'Workspace'}</Text>
                  <Text numberOfLines={1} variant="bodySmall" style={{ color: palette.muted }}>{connection.status === 'connected' ? activeProject?.path || currentProjectPath || serverRootPath : connection.message}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={20} color={palette.muted} />
              </Pressable>
            }>
            {projects.length === 0 ? <Menu.Item title="No projects available" disabled /> : null}
            {projects.map((project) => <Menu.Item key={project.path} title={project.label} leadingIcon={project.path === activeProject?.path ? 'check' : undefined} onPress={() => { setProjectMenuVisible(false); selectProject(project.path); }} />)}
            {projects.length > 0 ? <Divider /> : null}
            <Menu.Item title="Add project…" leadingIcon="folder-plus-outline" onPress={() => { setProjectMenuVisible(false); openProjectPicker(); }} />
          </Menu>
        </View>
        <View style={styles.headerActions}>
          <Appbar.Action testID="workspace-sync-button" icon="sync" accessibilityLabel="Sync projects" onPress={() => void refreshWorkspaceCatalog()} />
          <Appbar.Action testID="workspace-refresh-button" icon="refresh" accessibilityLabel="Refresh workspace" onPress={() => void handleRefresh()} />
          <Appbar.Action testID="workspace-new-chat-button" icon="plus" accessibilityLabel="New chat" disabled={!activeProject || isCreating} onPress={() => void handleNewChat()} />
        </View>
      </Appbar.Header>
      <ScrollView
        style={[styles.screen, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.content, styles.centeredContent]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor={palette.tint} />}>
      <SegmentedButtons value={activePanel} onValueChange={(value) => setActivePanel(value as typeof activePanel)} buttons={[{ value: 'chats', label: 'Chats' }, { value: 'files', label: 'Files' }, { value: 'tools', label: 'Tools' }]} />

      {activePanel === 'chats' ? <Card mode="contained" style={[styles.card, { backgroundColor: palette.surface }]}>
        <Card.Title title={showArchived ? 'Archived chats' : 'Chats'} subtitle={showArchived ? 'Restore or permanently delete chats.' : activeProject ? 'Current and running chats appear first.' : 'Choose a project to load chats.'} right={() => <IconButton icon={showArchived ? 'archive-remove-outline' : 'archive-outline'} accessibilityLabel={showArchived ? 'Show active chats' : 'Show archived chats'} onPress={() => { setShowArchived((value) => !value); if (!showArchived) void refreshArchivedSessions(); }} />} />
        <Card.Content style={styles.listContent}>
          {showArchived ? archivedSessions.length === 0 ? <Text style={[styles.emptyText, { color: palette.muted }]}>No archived chats.</Text> : archivedSessions.map((session, index) => <View key={session.id}><View style={styles.archiveRow}><View style={styles.archiveCopy}><Text variant="titleMedium" style={{ color: palette.text }}>{session.title || 'Untitled chat'}</Text><Text style={{ color: palette.muted }}>{session.directory} · {formatRelativeTime(session.time.updated)}</Text></View><View style={styles.iconActions}><IconButton icon="restore" accessibilityLabel={`Restore ${session.title || 'Untitled chat'}`} loading={updatingArchivedSessionId === session.id} onPress={() => void handleArchivedSession(session.id, 'restore')} /><IconButton icon="delete-outline" iconColor={palette.danger} accessibilityLabel={`Delete ${session.title || 'Untitled chat'}`} disabled={updatingArchivedSessionId === session.id} onPress={() => confirmDestructive('Delete archived session?', `“${session.title || 'Untitled chat'}” and all of its data will be permanently deleted.`, 'Delete', () => void handleArchivedSession(session.id, 'delete'))} /></View></View>{index < archivedSessions.length - 1 ? <Divider /> : null}</View>) : <>{!activeProject ? <Text style={{ color: palette.muted }}>Select a project first.</Text> : null}{activeProject && orderedSessions.length === 0 ? <Text style={{ color: palette.muted }}>No chats in this workspace yet.</Text> : null}{orderedSessions.map((session, index) => renderSessionItem(session, index, orderedSessions.length))}</>}
        </Card.Content>
      </Card> : null}

      {activePanel === 'files' ? <Card mode="contained" style={[styles.card, { backgroundColor: palette.surface }]}>
        <Card.Title title="Workspace files" subtitle={vcsInfo?.branch ? `Branch: ${vcsInfo.branch}` : 'Search and inspect files'} />
        <Card.Content style={styles.fileSection}>
          <View style={[styles.renameRow, compact && styles.compactFormRow]}>
            <TextInput testID="workspace-file-search" mode="outlined" dense placeholder="Search files" value={fileQuery} onChangeText={setFileQuery} style={styles.renameInput} />
            <Button mode="contained" onPress={() => void searchWorkspaceFiles(fileQuery).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not search workspace files.'))}>Search</Button>
          </View>
          {workspaceFileStatuses.length > 0 ? <Text style={{ color: palette.muted }}>{workspaceFileStatuses.length} changed files</Text> : null}
          {workspaceFiles.map((path) => <List.Item key={path} title={path} onPress={() => void openWorkspaceFile(path).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open the file.'))} />)}
          {selectedWorkspaceFile ? (
            <View style={[styles.filePreview, { borderColor: palette.border, backgroundColor: palette.background }]}>
              <Text variant="labelLarge" style={{ color: palette.text }}>{selectedWorkspaceFile.path}</Text>
              {editingFile?.path === selectedWorkspaceFile.path ? (
                <>
                  <Text style={{ color: palette.warning }}>Saving applies your edits as a VCS patch to the working tree. Review the changes before continuing.</Text>
                  <TextInput
                    testID="workspace-file-editor"
                    mode="outlined"
                    multiline
                    value={editingFile.value}
                    onChangeText={(value) => setEditingFile({ ...editingFile, value })}
                    style={[styles.fileEditor, styles.code]}
                  />
                  <View style={styles.inlineActions}>
                    <Button
                      testID="workspace-file-save-button"
                      mode="contained"
                      loading={isSavingFile}
                      disabled={isSavingFile || editingFile.value === editingFile.original}
                      onPress={() => {
                        setIsSavingFile(true);
                        void saveWorkspaceFile(editingFile.path, editingFile.original, editingFile.value)
                          .then(() => setEditingFile(undefined))
                          .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not save the file.'))
                          .finally(() => setIsSavingFile(false));
                      }}>
                      Save patch
                    </Button>
                    <Button disabled={isSavingFile} onPress={() => setEditingFile(undefined)}>Cancel</Button>
                  </View>
                </>
              ) : (
                <>
                  <Text selectable style={[styles.code, { color: palette.text }]}>{selectedWorkspaceFile.content.content}</Text>
                  <Button
                    mode="outlined"
                    style={styles.selfStart}
                    onPress={() => setEditingFile({
                      path: selectedWorkspaceFile.path,
                      original: selectedWorkspaceFile.content.content,
                      value: selectedWorkspaceFile.content.content,
                    })}>
                    Edit
                  </Button>
                </>
              )}
            </View>
          ) : null}
        </Card.Content>
      </Card> : null}

      {activePanel === 'tools' ? <Card mode="contained" style={[styles.card, { backgroundColor: palette.surface }]}>
        <Card.Title
          title="Worktrees"
          subtitle="Create isolated working directories or manage existing ones."
          right={() => (
            isRefreshingWorktrees
              ? <ActivityIndicator style={styles.headerAction} color={palette.tint} />
              : <IconButton
                  icon="refresh"
                  accessibilityLabel="Refresh worktrees"
                  disabled={!activeProject}
                  onPress={() => {
                    setIsRefreshingWorktrees(true);
                    void refreshWorktrees()
                      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not refresh worktrees.'))
                      .finally(() => setIsRefreshingWorktrees(false));
                  }}
                />
          )}
        />
        <Card.Content style={styles.worktreeSection}>
          <View style={[styles.worktreeForm, compact && styles.compactFormRow]}>
            <TextInput testID="workspace-worktree-name" mode="outlined" dense label="Name (optional)" value={worktreeName} onChangeText={setWorktreeName} style={styles.renameInput} />
            <TextInput testID="workspace-worktree-command" mode="outlined" dense label="Start command (optional)" value={worktreeStartCommand} onChangeText={setWorktreeStartCommand} style={styles.renameInput} />
            <Button
              testID="workspace-worktree-create"
              mode="contained"
              loading={isCreatingWorktree}
              disabled={!activeProject || isCreatingWorktree}
              onPress={() => {
                setIsCreatingWorktree(true);
                void createWorktree(worktreeName, worktreeStartCommand)
                  .then(() => { setWorktreeName(''); setWorktreeStartCommand(''); })
                  .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not create the worktree.'))
                  .finally(() => setIsCreatingWorktree(false));
              }}>
              Create
            </Button>
          </View>
          {worktrees.length === 0 ? <Text style={{ color: palette.muted }}>No worktrees available.</Text> : null}
          {worktrees.map((worktree, index) => {
            const directory = typeof worktree === 'string' ? worktree : worktree.directory;
            const title = typeof worktree === 'string' ? directory.split('/').filter(Boolean).pop() || directory : worktree.name;
            const detail = typeof worktree === 'string' || !worktree.branch ? directory : `${worktree.branch} · ${directory}`;
            return (
              <View key={directory}>
                <View style={[styles.archiveRow, compact && styles.compactArchiveRow]}>
                  <View style={styles.archiveCopy}>
                    <Text variant="titleMedium" style={{ color: palette.text }}>{title}</Text>
                    <Text selectable style={{ color: palette.muted }}>{detail}</Text>
                  </View>
                  <View style={styles.iconActions}>
                    <IconButton
                      icon="backup-restore"
                      accessibilityLabel={`Reset ${title}`}
                      loading={updatingWorktree === directory}
                      disabled={updatingWorktree === directory}
                      iconColor={palette.danger}
                      onPress={() => confirmDestructive(
                        'Reset worktree?',
                        `This discards uncommitted changes in ${directory}.`,
                        'Reset',
                        () => {
                          setUpdatingWorktree(directory);
                          void resetWorktree(directory)
                            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not reset the worktree.'))
                            .finally(() => setUpdatingWorktree(undefined));
                        },
                      )}
                    />
                    <IconButton
                      icon="delete-outline"
                      accessibilityLabel={`Remove ${title}`}
                      disabled={updatingWorktree === directory}
                      iconColor={palette.danger}
                      onPress={() => confirmDestructive(
                        'Remove worktree?',
                        `${directory} will be removed. This cannot be undone.`,
                        'Remove',
                        () => {
                          setUpdatingWorktree(directory);
                          void removeWorktree(directory)
                            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not remove the worktree.'))
                            .finally(() => setUpdatingWorktree(undefined));
                        },
                      )}
                    />
                  </View>
                </View>
                {index < worktrees.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </Card.Content>
      </Card> : null}
      </ScrollView>
      <Portal>
        <Dialog visible={projectPickerVisible} onDismiss={() => setProjectPickerVisible(false)}>
          <Dialog.Title>Add project</Dialog.Title>
          <Dialog.Content style={styles.pickerContent}>
            <TextInput
              testID="workspace-project-picker-search"
              mode="outlined"
              dense
              placeholder="Search folders on the server"
              value={pickerQuery}
              onChangeText={handlePickerQueryChange}
            />
            {pickerQuery.trim() ? null : (
              <View style={styles.pickerPathRow}>
                <IconButton
                  testID="workspace-project-picker-up"
                  icon="arrow-up"
                  accessibilityLabel="Parent folder"
                  disabled={!pickerDir || !parentDirectory(pickerDir)}
                  onPress={() => {
                    if (!pickerDir) {
                      return;
                    }
                    const up = parentDirectory(pickerDir);
                    if (up) {
                      setPickerDir(up);
                      void loadPickerListing(up);
                    }
                  }}
                />
                <Text numberOfLines={1} variant="bodySmall" style={[styles.pickerPath, { color: palette.muted }]}>{pickerDir}</Text>
              </View>
            )}
            <ScrollView style={styles.pickerList} nestedScrollEnabled>
              {pickerLoading ? (
                <ActivityIndicator style={styles.pickerLoading} color={palette.tint} />
              ) : pickerQuery.trim() ? (
                pickerResults.length === 0 ? (
                  <Text style={[styles.pickerEmpty, { color: palette.muted }]}>No folders match “{pickerQuery}”.</Text>
                ) : (
                  pickerResults.map((path) => (
                    <List.Item
                      key={path}
                      title={path.split(/[\\/]/).pop() || path}
                      description={path}
                      titleStyle={{ color: palette.text }}
                      descriptionStyle={{ color: palette.muted }}
                      right={() => (
                        <IconButton
                          icon="folder-plus-outline"
                          accessibilityLabel={`Add project ${path}`}
                          loading={pickerAdding === path}
                          disabled={pickerAdding !== undefined}
                          onPress={() => void handleAddProject(path)}
                        />
                      )}
                      onPress={() => {
                        if (!pickerAdding) void handleAddProject(path);
                      }}
                    />
                  ))
                )
              ) : pickerEntries.length === 0 ? (
                <Text style={[styles.pickerEmpty, { color: palette.muted }]}>No folders found.</Text>
              ) : (
                pickerEntries
                  .filter((entry) => entry.type === 'directory')
                  .sort((left, right) => (Number(left.name.startsWith('.')) - Number(right.name.startsWith('.'))) || left.name.localeCompare(right.name))
                  .map((entry) => (
                    <List.Item
                      key={entry.absolute}
                      title={entry.name}
                      titleStyle={{ color: palette.text }}
                      right={() => (
                        <IconButton
                          icon="folder-plus-outline"
                          accessibilityLabel={`Add project ${entry.absolute}`}
                          loading={pickerAdding === entry.absolute}
                          disabled={pickerAdding !== undefined}
                          onPress={() => void handleAddProject(entry.absolute)}
                        />
                      )}
                      onPress={() => {
                        setPickerDir(entry.absolute);
                        void loadPickerListing(entry.absolute);
                      }}
                    />
                  ))
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setProjectPickerVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={Boolean(error)} onDismiss={() => setError(undefined)}>{error}</Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 28, width: '100%' },
  centeredContent: { maxWidth: 1100, alignSelf: 'center' },
  header: { elevation: 0 },
  headerMain: { alignSelf: 'stretch', flex: 1, justifyContent: 'center', minWidth: 0 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0 },
  headerSelector: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginRight: 8, minHeight: 48, paddingRight: 4 },
  headerSelectorPressed: { opacity: 0.82 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: Fonts.display, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  card: { borderRadius: 16 },
  listContent: { paddingHorizontal: 0 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'flex-start' },
  headerAction: { marginRight: 16, alignSelf: 'center' },
  sessionMeta: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  compactSessionMeta: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'flex-start' },
  sessionDetails: { flexDirection: 'row', gap: 8 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  iconActions: { flexDirection: 'row', alignItems: 'center' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  compactFormRow: { flexDirection: 'column', alignItems: 'stretch' },
  renameInput: { flex: 1 },
  emptyText: { paddingHorizontal: 16, paddingBottom: 8 },
  archiveRow: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactArchiveRow: { alignItems: 'flex-start', flexDirection: 'column' },
  archiveCopy: { flex: 1, minWidth: 0 },
  fileSection: { gap: 8, paddingHorizontal: 0 },
  filePreview: { margin: 16, padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  fileEditor: { minHeight: 240 },
  selfStart: { alignSelf: 'flex-start' },
  worktreeSection: { gap: 8 },
  worktreeForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  code: { fontFamily: 'monospace', fontSize: 12 },
  pickerContent: { gap: 4 },
  pickerPathRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  pickerPath: { flex: 1, minWidth: 0 },
  pickerList: { maxHeight: 420 },
  pickerLoading: { padding: 24 },
  pickerEmpty: { padding: 12 },
});
