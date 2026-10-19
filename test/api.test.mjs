import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/api.mjs';

// Mock dependencies
jest.mock('../netlify/functions/lib/db.mjs', () => ({
  getClient: jest.fn(),
  getDb: jest.fn()
}));
jest.mock('../netlify/functions/lib/security.mjs', () => ({
  ...jest.requireActual('../netlify/functions/lib/security.mjs'),
  requireUser: jest.fn(),
  asId: (id) => id, // Simplify: just return the string as ObjectId mock
  now: jest.fn()
}));

const { getDb } = require('../netlify/functions/lib/db.mjs');
const { requireUser, asId, now } = require('../netlify/functions/lib/security.mjs');

test('batch/open: free batch accessible without subscription', async () => {
  // Arrange
  const userId = 'user123';
  const batchId = 'batch456';
  const fixedDate = new Date('2026-01-01');
  now.mockReturnValue(fixedDate);

  requireUser.mockResolvedValue({ _id: userId });

  const mockBatch = {
    _id: batchId,
    title: 'Free Batch',
    destinationUrl: 'https://example.com/free-batch',
    published: true,
    accessType: 'free'
  };

  const mockDb = {
    collection: (name) => {
      if (name === 'batches') {
        return { findOne: jest.fn().mockResolvedValue(mockBatch) };
      }
      if (name === 'siteSettings') {
        return { findOne: jest.fn().mockResolvedValue({ maintenance: false }) };
      }
      return null;
    }
  };
  getDb.mockResolvedValue(mockDb);

  // Act
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'batch/open', batchId })
  };
  const response = await handler(event);

  // Assert
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.destinationUrl, 'https://example.com/free-batch');
});

test('batch/open: paid batch requires subscription', async () => {
  // Arrange
  const userId = 'user123';
  const batchId = 'batch456';
  const fixedDate = new Date('2026-01-01');
  now.mockReturnValue(fixedDate);

  requireUser.mockResolvedValue({ _id: userId });

  const mockBatch = {
    _id: batchId,
    title: 'Paid Batch',
    destinationUrl: 'https://example.com/paid-batch',
    published: true,
    accessType: 'paid'
  };
  const mockSubscription = {
    _id: 'sub123',
    userId,
    batchIds: [batchId],
    status: 'active',
    startsAt: new Date('2025-01-01'),
    expiresAt: new Date('2026-12-31')
  };

  const mockDb = {
    collection: (name) => {
      if (name === 'batches') {
        return { findOne: jest.fn().mockResolvedValue(mockBatch) };
      }
      if (name === 'subscriptions') {
        return { findOne: jest.fn().mockResolvedValue(mockSubscription) };
      }
      if (name === 'siteSettings') {
        return { findOne: jest.fn().mockResolvedValue({ maintenance: false }) };
      }
      return null;
    }
  };
  getDb.mockResolvedValue(mockDb);

  // Act
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'batch/open', batchId })
  };
  const response = await handler(event);

  // Assert
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.destinationUrl, 'https://example.com/paid-batch');
});

test('batch/open: another paid batch blocked without subscription', async () => {
  // Arrange
  const userId = 'user123';
  const batchId = 'batch456';
  const differentBatchId = 'batch789';
  const fixedDate = new Date('2026-01-01');
  now.mockReturnValue(fixedDate);

  requireUser.mockResolvedValue({ _id: userId });

  const mockBatch = {
    _id: differentBatchId,
    title: 'Different Paid Batch',
    destinationUrl: 'https://example.com/different-batch',
    published: true,
    accessType: 'paid'
  };
  const mockSubscription = {
    _id: 'sub123',
    userId,
    batchIds: [batchId], // Only has subscription for batch456, not batch789
    status: 'active',
    startsAt: new Date('2025-01-01'),
    expiresAt: new Date('2026-12-31')
  };

  const mockDb = {
    collection: (name) => {
      if (name === 'batches') {
        return { findOne: jest.fn().mockResolvedValue(mockBatch) };
      }
      if (name === 'subscriptions') {
        return { findOne: jest.fn().mockResolvedValue(mockSubscription) };
      }
      if (name === 'siteSettings') {
        return { findOne: jest.fn().mockResolvedValue({ maintenance: false }) };
      }
      return null;
    }
  };
  getDb.mockResolvedValue(mockDb);

  // Act
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'batch/open', batchId: differentBatchId })
  };
  const response = await handler(event);

  // Assert
  assert.strictEqual(response.statusCode, 402);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.code, 'PLAN_REQUIRED');
});

test('batch/open: paid batch blocked with pending payment', async () => {
  // Arrange
  const userId = 'user123';
  const batchId = 'batch456';
  const fixedDate = new Date('2026-01-01');
  now.mockReturnValue(fixedDate);

  requireUser.mockResolvedValue({ _id: userId });

  const mockBatch = {
    _id: batchId,
    title: 'Paid Batch',
    destinationUrl: 'https://example.com/paid-batch',
    published: true,
    accessType: 'paid'
  };
  const mockSubscription = null; // No active subscription (payment pending)

  const mockDb = {
    collection: (name) => {
      if (name === 'batches') {
        return { findOne: jest.fn().mockResolvedValue(mockBatch) };
      }
      if (name === 'subscriptions') {
        return { findOne: jest.fn().mockResolvedValue(mockSubscription) };
      }
      if (name === 'siteSettings') {
        return { findOne: jest.fn().mockResolvedValue({ maintenance: false }) };
      }
      return null;
    }
  };
  getDb.mockResolvedValue(mockDb);

  // Act
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'batch/open', batchId })
  };
  const response = await handler(event);

  // Assert
  assert.strictEqual(response.statusCode, 402);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.code, 'PLAN_REQUIRED');
});

test('batch/open: paid batch blocked with expired subscription', async () => {
  // Arrange
  const userId = 'user123';
  const batchId = 'batch456';
  const fixedDate = new Date('2026-01-01');
  now.mockReturnValue(fixedDate);

  requireUser.mockResolvedValue({ _id: userId });

  const mockBatch = {
    _id: batchId,
    title: 'Paid Batch',
    destinationUrl: 'https://example.com/paid-batch',
    published: true,
    accessType: 'paid'
  };
  // Subscription exists but expired (expiresAt is in the past)
  const mockSubscription = null; // Because query requires expiresAt > now, and if expired, findOne returns null

  const mockDb = {
    collection: (name) => {
      if (name === 'batches') {
        return { findOne: jest.fn().mockResolvedValue(mockBatch) };
      }
      if (name === 'subscriptions') {
        return { findOne: jest.fn().mockResolvedValue(mockSubscription) };
      }
      if (name === 'siteSettings') {
        return { findOne: jest.fn().mockResolvedValue({ maintenance: false }) };
      }
      return null;
    }
  };
  getDb.mockResolvedValue(mockDb);

  // Act
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ action: 'batch/open', batchId })
  };
  const response = await handler(event);

  // Assert
  assert.strictEqual(response.statusCode, 402);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.code, 'PLAN_REQUIRED');
});