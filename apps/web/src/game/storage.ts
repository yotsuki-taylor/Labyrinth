import type { SaveState, MetaSave } from './state.js';

const LOCAL_KEY = 'labyrinth_save_v1';
const CLOUD_KEY = 'labyrinth_meta_v1';

/** Telegram WebApp CloudStorage shape (callback-based). */
interface CloudStorage {
  getItem(key: string, cb: (err: Error | null, value: string | null) => void): void;
  setItem(key: string, value: string, cb?: (err: Error | null, ok: boolean) => void): void;
}

function cloud(): CloudStorage | null {
  const wa = window.Telegram?.WebApp;
  if (!wa?.CloudStorage) return null;
  // CloudStorage was added in Bot API 6.9; older clients throw/log if called.
  if (typeof wa.isVersionAtLeast === 'function' && !wa.isVersionAtLeast('6.9')) return null;
  return wa.CloudStorage;
}

// Guards against clients that never invoke the callback, so init() can't hang.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: T) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const timer = setTimeout(() => finish(fallback), ms);
    p.then((v) => {
      clearTimeout(timer);
      finish(v);
    }).catch(() => {
      clearTimeout(timer);
      finish(fallback);
    });
  });
}

// --- localStorage (full state, same device) ---

export function loadLocal(): SaveState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SaveState) : null;
  } catch {
    return null;
  }
}

export function saveLocal(state: SaveState): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Quota or disabled storage — ignore; CloudStorage still holds progress.
  }
}

// --- Telegram CloudStorage (permanent progress, cross-device) ---

export function loadCloudMeta(): Promise<MetaSave | null> {
  const cs = cloud();
  if (!cs) return Promise.resolve(null);
  const p = new Promise<MetaSave | null>((resolve) => {
    try {
      cs.getItem(CLOUD_KEY, (err, value) => {
        if (err || !value) return resolve(null);
        try {
          resolve(JSON.parse(value) as MetaSave);
        } catch {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
  return withTimeout(p, 3000, null);
}

export function saveCloudMeta(meta: MetaSave): Promise<void> {
  const cs = cloud();
  if (!cs) return Promise.resolve();
  const p = new Promise<void>((resolve) => {
    try {
      // CloudStorage caps values at 4096 chars; meta stays well under that.
      cs.setItem(CLOUD_KEY, JSON.stringify(meta), () => resolve());
    } catch {
      resolve();
    }
  });
  return withTimeout(p, 3000, undefined);
}
