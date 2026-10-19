import { MongoClient } from 'mongodb';

let clientPromise;
let indexesPromise;

export async function getClient() {
  if (!process.env.MONGODB_URI) { const error = new Error('MONGODB_URI is not configured. Copy .env.example to .env and add your MongoDB Atlas connection string.'); error.statusCode = 503; throw error; }
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  const db = client.db(process.env.MONGODB_DB || 'study_premium');
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      db.collection('users').createIndex({ emailLower: 1 }, { unique: true, name: 'users_email_unique' }),
      db.collection('users').createIndex({ mobile: 1 }, { unique: true, name: 'users_mobile_unique' }),
      db.collection('sites').createIndex({ section: 1, sortOrder: 1 }),
      db.collection('plans').createIndex({ published: 1, sortOrder: 1 }),
      db.collection('payments').createIndex({ orderId: 1 }, { unique: true, name: 'payments_order_unique' }),
      db.collection('payments').createIndex({ utrLower: 1 }, { unique: true, sparse: true, name: 'payments_utr_unique' }),
      db.collection('subscriptions').createIndex({ orderId: 1 }, { unique: true, name: 'subscriptions_order_unique' }),
      db.collection('subscriptions').createIndex({ userId: 1, status: 1, expiresAt: 1 }),
      db.collection('notifications').createIndex({ userId: 1, createdAt: -1 }),
      db.collection('auditLogs').createIndex({ createdAt: -1 }),
      db.collection('rateLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]).catch((error) => {
      indexesPromise = undefined;
      throw error;
    });
  }
  await indexesPromise;
  return db;
}
