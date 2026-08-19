import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Lightweight performance history: request timings, slow-frame (jank) events,
// and memory samples, persisted to AsyncStorage so they can be reviewed later.
// Instrumentation is always on; nothing is shown live unless the user opens
// the Performance screen.

const STORAGE_KEY = '@opencode-mobile/performance-log-v1';
const MAX_REQUESTS = 1000;
const MAX_SLOW_FRAMES = 200;
const MAX_MEMORY_SAMPLES = 1200;
const SLOW_FRAME_THRESHOLD_MS = 50;
const MAX_RECORDED_FRAME_MS = 5000;
const MEMORY_SAMPLE_INTERVAL_MS = 30_000;
const FLUSH_INTERVAL_MS = 5_000;

export type RequestEntry = {
  t: number;
  method: string;
  path: string;
  status: number | null;
  ms: number;
  error?: boolean;
};

export type SlowFrameEntry = { t: number; ms: number };
export type MemoryEntry = { t: number; heap: number | null; total: number | null };

export type PerformanceLog = {
  requests: RequestEntry[];
  slowFrames: SlowFrameEntry[];
  memory: MemoryEntry[];
};

let log: PerformanceLog = { requests: [], slowFrames: [], memory: [] };
let dirty = false;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readMemory(): { heap: number | null; total: number | null } {
  try {
    const memory = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } } }).performance
      ?.memory;
    if (!memory || typeof memory.usedJSHeapSize !== 'number') {
      return { heap: null, total: null };
    }
    return { heap: memory.usedJSHeapSize, total: memory.totalJSHeapSize ?? null };
  } catch {
    return { heap: null, total: null };
  }
}

function recordMemorySample(now = Date.now()) {
  const { heap, total } = readMemory();
  if (heap === null) {
    return;
  }
  log.memory.push({ t: now, heap, total });
  if (log.memory.length > MAX_MEMORY_SAMPLES) {
    log.memory.splice(0, log.memory.length - MAX_MEMORY_SAMPLES);
  }
  dirty = true;
}

export function recordRequest(entry: RequestEntry) {
  log.requests.push(entry);
  if (log.requests.length > MAX_REQUESTS) {
    log.requests.splice(0, log.requests.length - MAX_REQUESTS);
  }
  dirty = true;
  notify();
}

export function recordSlowFrame(frameMs: number, now = Date.now()) {
  log.slowFrames.push({ t: now, ms: frameMs });
  if (log.slowFrames.length > MAX_SLOW_FRAMES) {
    log.slowFrames.splice(0, log.slowFrames.length - MAX_SLOW_FRAMES);
  }
  dirty = true;
}

export function getPerformanceLog(): PerformanceLog {
  return log;
}

export function clearPerformanceLog() {
  log = { requests: [], slowFrames: [], memory: [] };
  dirty = true;
  notify();
}

export function subscribePerformanceLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Persistence is best-effort; never let telemetry break the app.
  }
}

export async function hydratePerformanceLog() {
  if (hydrated) {
    return;
  }
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Partial<PerformanceLog>;
    log = {
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      slowFrames: Array.isArray(parsed.slowFrames) ? parsed.slowFrames : [],
      memory: Array.isArray(parsed.memory) ? parsed.memory : [],
    };
  } catch {
    // Corrupt or unreadable history: start fresh.
  }
  notify();
}

function startFlushLoop() {
  setInterval(() => {
    if (dirty) {
      dirty = false;
      void persist();
    }
  }, FLUSH_INTERVAL_MS);
}

function startFrameMonitor() {
  let last = performance.now();
  let rafId = 0;
  let running = false;

  const loop = (now: number) => {
    const gap = now - last;
    last = now;
    if (AppState.currentState === 'active' && gap > SLOW_FRAME_THRESHOLD_MS && gap < MAX_RECORDED_FRAME_MS) {
      recordSlowFrame(gap);
    }
    rafId = requestAnimationFrame(loop);
  };

  // requestAnimationFrame is paused by RN while the app is backgrounded, so
  // the loop stops and restarts cleanly with AppState transitions.
  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && !running) {
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(loop);
    } else if (state !== 'active' && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  });
  if (AppState.currentState === 'active') {
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  appStateSub;
}

function startMemorySampler() {
  recordMemorySample();
  setInterval(() => recordMemorySample(), MEMORY_SAMPLE_INTERVAL_MS);
}

let initialized = false;
export function initPerformanceMonitoring() {
  if (initialized) {
    return;
  }
  initialized = true;
  void hydratePerformanceLog();
  startFlushLoop();
  startFrameMonitor();
  startMemorySampler();
}
