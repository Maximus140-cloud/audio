import { openDB, IDBPDatabase } from "idb";
import { AudiobookData } from "../types";

export const initDB = async (): Promise<IDBPDatabase> => {
  return openDB("AudiobookApp", 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore("audiobooks", { keyPath: "id" });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
      }
    },
  });
};

export const saveBook = async (book: AudiobookData) => {
  const db = await initDB();
  await db.put("audiobooks", book);
};

export const getBook = async (id: string): Promise<AudiobookData | undefined> => {
  const db = await initDB();
  return db.get("audiobooks", id);
};

export const getAllBooks = async (): Promise<AudiobookData[]> => {
  const db = await initDB();
  return db.getAll("audiobooks");
};

export const deleteBook = async (id: string) => {
  const db = await initDB();
  await db.delete("audiobooks", id);
};

export const saveSetting = async (key: string, value: any) => {
  const db = await initDB();
  await db.put("settings", value, key);
};

export const getSetting = async (key: string) => {
  const db = await initDB();
  return db.get("settings", key);
};
