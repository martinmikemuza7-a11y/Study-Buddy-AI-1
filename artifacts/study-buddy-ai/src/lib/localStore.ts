export type LocalChunk = {
  id: number;
  materialId: number;
  courseId: number;
  content: string;
  page: number | null;
  slide: number | null;
  name: string;
};

export type LocalSnapshot = {
  courses: unknown[];
  materials: Record<string, unknown[]>;
  sessions: Record<string, unknown[]>;
  progress: Record<string, unknown>;
  knowledge: Record<string, LocalChunk[]>;
  chats: Record<string, Array<{ role: 'user' | 'ai'; text: string }>>;
  updatedAt: string;
};

const DB_NAME = 'study-buddy-offline-v2';
const DB_VERSION = 1;
const STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage'));
  });
}

export async function readSnapshot(userId: string): Promise<LocalSnapshot | null> {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(userId);
    request.onsuccess = () => resolve((request.result as LocalSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read offline storage'));
  });
}

export async function writeSnapshot(userId: string, patch: Partial<LocalSnapshot>): Promise<void> {
  if (!('indexedDB' in window)) return;
  const current = (await readSnapshot(userId)) ?? {
    courses: [], materials: {}, sessions: {}, progress: {}, knowledge: {}, chats: {}, updatedAt: new Date().toISOString(),
  };
  const serverCourses = Array.isArray(patch.courses) ? patch.courses : current.courses;
  const pendingOfflineCourses = current.courses.filter((item) => typeof (item as { id?: unknown })?.id === 'number' && ((item as { id: number }).id < 0));
  const mergedCourses = Array.from(new Map([...serverCourses, ...pendingOfflineCourses].map(item => [String((item as { id?: unknown })?.id ?? Math.random()), item])).values());
  const next: LocalSnapshot = { ...current, ...patch, courses: mergedCourses, updatedAt: new Date().toISOString() };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(next, userId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not write offline storage'));
  });
}

export async function patchSnapshot(userId: string, updater: (current: LocalSnapshot) => LocalSnapshot): Promise<LocalSnapshot> {
  const current = (await readSnapshot(userId)) ?? {
    courses: [], materials: {}, sessions: {}, progress: {}, knowledge: {}, chats: {}, updatedAt: new Date().toISOString(),
  };
  const next = updater(current);
  await writeSnapshot(userId, next);
  return next;
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
