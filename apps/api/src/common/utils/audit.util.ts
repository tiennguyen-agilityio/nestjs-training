import type { AuditableEntity } from '../entities/auditable.entity.js';

export type ActorId = string | null;

export type AuditChange = 'create' | 'update';

export interface AuditFields {
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
}

export interface ResponseOptions {
  withAudit?: boolean;
}

export function stampAudit(
  entity: AuditableEntity,
  change: AuditChange,
  actorId: ActorId,
  previousDeletedAt: Date | null,
): void {
  if (!actorId) return;

  if (change === 'create') entity.createdBy = actorId;
  entity.updatedBy = actorId;

  if (!previousDeletedAt && entity.deletedAt) entity.deletedBy = actorId;
  if (previousDeletedAt && !entity.deletedAt) entity.deletedBy = null;
}

export function auditFieldsOf(entity: AuditableEntity): AuditFields {
  return {
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    deletedBy: entity.deletedBy,
  };
}
