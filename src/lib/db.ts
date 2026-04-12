import { openDB, DBSchema } from 'idb';

interface DeliveryDB extends DBSchema {
  orders: {
    key: string;
    value: any;
    indexes: { 'by-status': string; 'by-courier': string };
  };
  offlineActions: {
    key: number;
    value: { action: string; data: any; timestamp: number };
  };
}

const DB_NAME = 'delivery-pwa';
const DB_VERSION = 1;

export async function getDB() {
  return openDB<DeliveryDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
      orderStore.createIndex('by-status', 'status');
      orderStore.createIndex('by-courier', 'courier_id');
      db.createObjectStore('offlineActions', { keyPath: 'id', autoIncrement: true });
    }
  });
}

export async function cacheOrder(order: any) {
  const db = await getDB();
  await db.put('orders', order);
}

export async function getCachedOrders(filter?: { courierId?: string; status?: string }) {
  const db = await getDB();
  let orders = await db.getAll('orders');
  if (filter?.courierId) {
    orders = orders.filter(o => o.courier_id === filter.courierId);
  }
  if (filter?.status) {
    orders = orders.filter(o => o.status === filter.status);
  }
  return orders;
}

export async function addOfflineAction(action: string, data: any) {
  const db = await getDB();
  await db.add('offlineActions', { action, data, timestamp: Date.now() });
}

export async function getOfflineActions() {
  const db = await getDB();
  return db.getAll('offlineActions');
}

export async function clearOfflineActions() {
  const db = await getDB();
  const tx = db.transaction('offlineActions', 'readwrite');
  await tx.store.clear();
  await tx.done;
}