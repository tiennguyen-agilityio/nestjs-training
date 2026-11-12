import { readFile } from 'node:fs/promises';

// R4: only the repository layer touches the ORM and the open transaction.
describe('User role sync layering', () => {
  it('services, the webhook and the outbox handler import no ORM, Kysely or outbox store', async () => {
    for (const file of [
      './services/user.service.ts',
      '../webhook/services/clerk-webhook.service.ts',
      './handlers/user-role-sync.handler.ts',
    ]) {
      // Resolved from this spec, so a moved or renamed file fails the test instead of passing it.
      const source = await readFile(new URL(file, import.meta.url), 'utf8');
      expect(source, file).toMatch(/^import /m);
      expect(source, file).not.toMatch(
        /from '(@mikro-orm\/|kysely|@nestjs\/outbox\/postgres)/,
      );
    }
  });
});
