import { auditFieldsOf, stampAudit } from './audit.util.js';
import type { AuditableEntity } from '../entities/auditable.entity.js';

const a1 = 'admin-1';
const a2 = 'admin-2';

const auditable = (fields: Partial<AuditableEntity> = {}): AuditableEntity =>
  ({
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    deletedAt: null,
    ...fields,
  }) as AuditableEntity;

describe('stampAudit', () => {
  it('create sets createdBy and updatedBy to the actor', () => {
    const entity = auditable();

    stampAudit(entity, 'create', a1, null);

    expect(entity.createdBy).toBe(a1);
    expect(entity.updatedBy).toBe(a1);
    expect(entity.deletedBy).toBeNull();
  });

  it('update sets only updatedBy', () => {
    const entity = auditable({ createdBy: a1, updatedBy: a1 });

    stampAudit(entity, 'update', a2, null);

    expect(entity.createdBy).toBe(a1);
    expect(entity.updatedBy).toBe(a2);
    expect(entity.deletedBy).toBeNull();
  });

  it('a soft delete sets deletedBy and updatedBy', () => {
    const entity = auditable({
      createdBy: a1,
      updatedBy: a1,
      deletedAt: new Date(),
    });

    stampAudit(entity, 'update', a2, null);

    expect(entity.createdBy).toBe(a1);
    expect(entity.updatedBy).toBe(a2);
    expect(entity.deletedBy).toBe(a2);
  });

  it('a restore clears deletedBy and sets updatedBy', () => {
    const entity = auditable({
      createdBy: a1,
      updatedBy: a2,
      deletedBy: a2,
      deletedAt: null,
    });

    stampAudit(entity, 'update', a1, new Date());

    expect(entity.createdBy).toBe(a1);
    expect(entity.updatedBy).toBe(a1);
    expect(entity.deletedBy).toBeNull();
  });

  it('an update of a row that stays deleted keeps deletedBy', () => {
    const deletedAt = new Date();
    const entity = auditable({ updatedBy: a1, deletedBy: a1, deletedAt });

    stampAudit(entity, 'update', a2, deletedAt);

    expect(entity.updatedBy).toBe(a2);
    expect(entity.deletedBy).toBe(a1);
  });

  it('stamps nothing for a system write (null actor)', () => {
    const entity = auditable({
      createdBy: a1,
      updatedBy: a1,
      deletedAt: new Date(),
    });

    stampAudit(entity, 'update', null, null);
    stampAudit(entity, 'create', null, null);

    expect(entity.createdBy).toBe(a1);
    expect(entity.updatedBy).toBe(a1);
    expect(entity.deletedBy).toBeNull();
  });
});

describe('auditFieldsOf', () => {
  it('returns the ids, or null for an empty column', () => {
    expect(
      auditFieldsOf(
        auditable({ createdBy: a1, updatedBy: a2, deletedBy: null }),
      ),
    ).toEqual({ createdBy: 'admin-1', updatedBy: 'admin-2', deletedBy: null });
  });
});
