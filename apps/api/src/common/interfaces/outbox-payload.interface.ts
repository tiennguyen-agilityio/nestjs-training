/**
 * `user.role-sync`: push this user's role to the auth provider. Only the id:
 * the handler reads the role the user has when the message is delivered.
 */
export interface UserRoleSyncPayload {
  clerkId: string;
}
