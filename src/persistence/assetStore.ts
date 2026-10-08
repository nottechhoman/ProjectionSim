const DB_NAME = 'projectionlab-v4-assets';
/** Where v2 / v3 kept imported media on the same site. Read-only fallback. */
export const LEGACY_DB_NAME = 'projectionlab-advanced-assets';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

function openDb(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveAssetBlob(assetId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Load a media blob. Media imported by the previous version lives in its own
 * database: fall back to it and copy the blob over, so old projects keep their media.
 */
export async function loadAssetBlob(assetId: string): Promise<Blob | null> {
  const blob = await loadFrom(DB_NAME, assetId);
  if (blob) return blob;
  const legacy = await loadFrom(LEGACY_DB_NAME, assetId).catch(() => null);
  if (legacy) await saveAssetBlob(assetId, legacy).catch(() => undefined);
  return legacy;
}

async function loadFrom(name: string, assetId: string): Promise<Blob | null> {
  if (name === LEGACY_DB_NAME && !(await databaseExists(name))) return null;
  const db = await openDb(name);
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.close();
    return null;
  }
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(assetId);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

export async function deleteAssetBlob(assetId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listAssetBlobIds(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys.map(String);
}

/** Avoid creating an empty legacy database just by looking for it. */
async function databaseExists(name: string): Promise<boolean> {
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
  if (!idb.databases) return true;
  try {
    return (await idb.databases()).some((d) => d.name === name);
  } catch {
    return true;
  }
}
