import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Divider, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  clearPerformanceLog,
  getPerformanceLog,
  hydratePerformanceLog,
  subscribePerformanceLog,
  type PerformanceLog,
  type RequestEntry,
} from '@/lib/performance';

function formatDuration(ms: number) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${Math.round(ms)} ms`;
}

function formatTime(t: number) {
  const date = new Date(t);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function RequestRow({ entry, palette }: { entry: RequestEntry; palette: typeof Colors.light }) {
  return (
    <View style={styles.requestRow}>
      <View style={styles.requestMain}>
        <Text variant="labelMedium" style={{ color: palette.text }}>
          {entry.method} {entry.path}
        </Text>
        <Text variant="bodySmall" style={{ color: palette.muted }}>
          {formatTime(entry.t)}
          {entry.status !== null ? ` · HTTP ${entry.status}` : ''}
          {entry.error ? ' · failed' : ''}
        </Text>
      </View>
      <Text
        variant="labelLarge"
        style={{ color: entry.error ? palette.danger : entry.ms >= 1000 ? palette.warning : palette.text, fontFamily: Fonts.mono }}>
        {formatDuration(entry.ms)}
      </Text>
    </View>
  );
}

export default function PerformanceScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<PerformanceLog>(() => getPerformanceLog());

  useEffect(() => {
    void hydratePerformanceLog().then(() => setLog(getPerformanceLog()));
    const unsubscribe = subscribePerformanceLog(() => setLog(getPerformanceLog()));
    const interval = setInterval(() => setLog(getPerformanceLog()), 2000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleClear = useCallback(() => {
    Alert.alert('Clear performance history?', 'This removes all recorded request timings, slow frames, and memory samples.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearPerformanceLog() },
    ]);
  }, []);

  const slowestRequests = useMemo(
    () => [...log.requests].sort((left, right) => right.ms - left.ms).slice(0, 10),
    [log.requests],
  );
  const recentRequests = useMemo(() => [...log.requests].reverse().slice(0, 30), [log.requests]);
  const recentSlowFrames = useMemo(() => [...log.slowFrames].reverse().slice(0, 15), [log.slowFrames]);
  const memorySample = log.memory[log.memory.length - 1];
  const memoryMin = log.memory.length > 0 ? Math.min(...log.memory.map((sample) => sample.heap ?? 0)) : undefined;
  const memoryMax = log.memory.length > 0 ? Math.max(...log.memory.map((sample) => sample.heap ?? 0)) : undefined;
  const averageMs = log.requests.length > 0
    ? log.requests.reduce((sum, entry) => sum + entry.ms, 0) / log.requests.length
    : undefined;
  const slowest = slowestRequests[0];

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.summaryRow}>
        <Card style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Card.Content>
            <Text variant="labelMedium" style={{ color: palette.muted }}>Requests</Text>
            <Text variant="titleLarge" style={{ color: palette.text }}>{log.requests.length}</Text>
            {averageMs !== undefined ? (
              <Text variant="bodySmall" style={{ color: palette.muted }}>avg {formatDuration(averageMs)}</Text>
            ) : null}
          </Card.Content>
        </Card>
        <Card style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Card.Content>
            <Text variant="labelMedium" style={{ color: palette.muted }}>Slow frames</Text>
            <Text variant="titleLarge" style={{ color: palette.text }}>{log.slowFrames.length}</Text>
            {log.slowFrames.length > 0 ? (
              <Text variant="bodySmall" style={{ color: palette.muted }}>
                worst {formatDuration(Math.max(...log.slowFrames.map((frame) => frame.ms)))}
              </Text>
            ) : null}
          </Card.Content>
        </Card>
        <Card style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Card.Content>
            <Text variant="labelMedium" style={{ color: palette.muted }}>JS heap</Text>
            <Text variant="titleLarge" style={{ color: palette.text }}>
              {memorySample?.heap !== undefined && memorySample?.heap !== null ? formatBytes(memorySample.heap) : 'n/a'}
            </Text>
            {memoryMin !== undefined && memoryMax !== undefined && memoryMax > memoryMin ? (
              <Text variant="bodySmall" style={{ color: palette.muted }}>
                peak {formatBytes(memoryMax)}
              </Text>
            ) : null}
          </Card.Content>
        </Card>
      </View>

      {slowest ? (
        <Card style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Card.Content>
            <Text variant="labelLarge" style={{ color: palette.text }}>Slowest request</Text>
            <Text variant="bodyLarge" style={{ color: palette.text, marginTop: 4 }}>
              {slowest.method} {slowest.path}
            </Text>
            <Text variant="labelLarge" style={{ color: slowest.ms >= 1000 ? palette.warning : palette.danger, fontFamily: Fonts.mono }}>
              {formatDuration(slowest.ms)}
            </Text>
            <Text variant="bodySmall" style={{ color: palette.muted }}>
              {formatTime(slowest.t)}
              {slowest.status !== null ? ` · HTTP ${slowest.status}` : ''}
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      <Card style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Card.Title
          title="Slowest requests"
          titleStyle={{ color: palette.text }}
          subtitle="Top 10 by duration, all recorded API calls"
          subtitleStyle={{ color: palette.muted }}
        />
        <Card.Content style={styles.listContent}>
          {slowestRequests.length === 0 ? (
            <Text variant="bodySmall" style={{ color: palette.muted }}>No requests recorded yet. Use the app and check back.</Text>
          ) : (
            slowestRequests.map((entry, index) => (
              <View key={`${entry.t}-${index}`}>
                {index > 0 ? <Divider style={{ backgroundColor: palette.border }} /> : null}
                <RequestRow entry={entry} palette={palette} />
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Card.Title
          title="Recent requests"
          titleStyle={{ color: palette.text }}
          subtitle="Last 30, newest first"
          subtitleStyle={{ color: palette.muted }}
        />
        <Card.Content style={styles.listContent}>
          {recentRequests.length === 0 ? (
            <Text variant="bodySmall" style={{ color: palette.muted }}>No requests recorded yet.</Text>
          ) : (
            recentRequests.map((entry, index) => (
              <View key={`${entry.t}-${index}`}>
                {index > 0 ? <Divider style={{ backgroundColor: palette.border }} /> : null}
                <RequestRow entry={entry} palette={palette} />
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Card.Title
          title="Slow frames"
          titleStyle={{ color: palette.text }}
          subtitle="JS frame gaps over 50 ms (jank)"
          subtitleStyle={{ color: palette.muted }}
        />
        <Card.Content style={styles.listContent}>
          {recentSlowFrames.length === 0 ? (
            <Text variant="bodySmall" style={{ color: palette.muted }}>No slow frames recorded yet.</Text>
          ) : (
            recentSlowFrames.map((frame, index) => (
              <View key={`${frame.t}-${index}`}>
                {index > 0 ? <Divider style={{ backgroundColor: palette.border }} /> : null}
                <View style={styles.requestRow}>
                  <Text variant="labelMedium" style={{ color: palette.text }}>{formatTime(frame.t)}</Text>
                  <Text variant="labelLarge" style={{ color: frame.ms >= 1000 ? palette.warning : palette.text, fontFamily: Fonts.mono }}>
                    {formatDuration(frame.ms)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      <Button mode="outlined" textColor={palette.danger} onPress={handleClear} style={styles.clearButton}>
        Clear history
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 16 },
  card: { borderWidth: 1, borderRadius: 16 },
  listContent: { paddingTop: 0 },
  requestRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 10 },
  requestMain: { flex: 1, minWidth: 0 },
  clearButton: { marginTop: 4 },
});
