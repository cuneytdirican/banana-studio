import { describe, expect, it } from 'vitest';
import { normalizeAuditEvent } from '../../api/_lib/audit';

describe('audit events', () => {
  it('accepts allowlisted actions and trims targets', () => {
    expect(normalizeAuditEvent({
      userId: 'user-1',
      action: 'share.created',
      targetType: ' folder ',
      targetId: 'folder-1',
      metadata: { role: 'viewer' },
    })).toEqual({
      userId: 'user-1',
      action: 'share.created',
      targetType: 'folder',
      targetId: 'folder-1',
      metadata: { role: 'viewer' },
    });
  });

  it('rejects unknown actions, missing users and oversized metadata', () => {
    expect(normalizeAuditEvent({ userId: 'u', action: 'admin.escalate' })).toBeNull();
    expect(normalizeAuditEvent({ action: 'share.created' })).toBeNull();
    expect(normalizeAuditEvent({
      userId: 'u',
      action: 'share.created',
      metadata: { blob: 'x'.repeat(5_000) },
    })).toBeNull();
  });
});
