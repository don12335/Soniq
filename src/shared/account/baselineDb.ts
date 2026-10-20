import type { CloudData } from "./merge";
export type Baseline = { revision: number; data: CloudData };

let connection: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("soniq_cloud_sync_v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("baselines");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

export async function readBaseline(id: string): Promise<Baseline> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction("baselines", "readonly").objectStore("baselines").get(id);
    request.onsuccess = () => resolve(request.result ?? { revision: -1, data: {} });
    request.onerror = () => reject(request.error);
  });
}

export async function writeBaseline(id: string, value: Baseline): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("baselines", "readwrite");
    transaction.objectStore("baselines").put(value, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
