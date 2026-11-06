/* Couche IndexedDB minimale. Tous les stores sont créés dès la version 1. */
const NAME = 'flipmanager', VERSION = 1;
const STORES = ['articles', 'images', 'sales', 'comparables', 'listings', 'settings', 'backups'];
let dbPromise;

export function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (db.objectStoreNames.contains(s)) continue;
        const os = db.createObjectStore(s, { keyPath: 'id' });
        if (s === 'images') os.createIndex('articleId', 'articleId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* Exécute une opération dans une transaction ; résout à la fin de la transaction (écriture garantie). */
async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const getByIndex = (store, index, value) => run(store, 'readonly', (os) => os.index(index).getAll(value));
export const put = (store, obj) => run(store, 'readwrite', (os) => os.put(obj));
export const remove = (store, id) => run(store, 'readwrite', (os) => os.delete(id));

/* Plusieurs écritures (put / del) sur plusieurs stores dans UNE transaction : tout ou rien. */
export async function batch(ops) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set(ops.map((o) => o.store))], 'readwrite');
    for (const o of ops) { const os = tx.objectStore(o.store); if (o.del !== undefined) os.delete(o.del); else os.put(o.put); }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/* Remplace TOUT le contenu des stores donnés dans une seule transaction : si une écriture échoue, rien n'est modifié.
   data = { articles: [...], sales: [...], ... } */
export async function replaceAll(data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const names = Object.keys(data), tx = db.transaction(names, 'readwrite');
    for (const n of names) { const os = tx.objectStore(n); os.clear(); for (const obj of data[n]) os.put(obj); }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
