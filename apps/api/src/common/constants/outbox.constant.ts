/** Outbox topics: what a message is about. */
export const OUTBOX_TOPICS = {
  USER_ROLE_SYNC: 'user.role-sync',
} as const;

/**
 * Outbox consumers: each handler's inbox identity. Keep a name stable once
 * deployed: a new name makes every past message look new to it.
 */
export const OUTBOX_CONSUMERS = {
  USER_ROLE_SYNC: 'user-role-sync',
} as const;
