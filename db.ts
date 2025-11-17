
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'music-player-db';
const STORE_NAME = 'file-handles';
const KEY = 'directory-handle';

let dbPromise: Promise<IDBPDatabase<unknown>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
}

export async function setDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, handle, KEY);
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, KEY);
}
