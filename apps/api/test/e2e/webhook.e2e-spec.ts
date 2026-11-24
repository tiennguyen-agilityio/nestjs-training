import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { Webhook } from 'svix';
import { AppModule } from './../../src/app.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { AuthProvider } from './../../src/common/providers/auth.provider.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserRole } from '@repo/constants';

describe('WebhookController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let webhookSecret: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await initTestApp(moduleFixture, { rawBody: true });

    orm = app.get(MikroORM);
    userService = app.get(UserService);
    webhookSecret = app
      .get(ConfigService)
      .getOrThrow<string>('CLERK_WEBHOOK_SECRET');

    const authProvider = app.get(AuthProvider);
    vi.spyOn(authProvider, 'syncUserRole').mockResolvedValue(undefined);
    vi.spyOn(authProvider, 'syncUserStatus').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  const signPayload = (
    body: string,
    msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  ): { msgId: string; timestamp: string; signature: string } => {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const webhook = new Webhook(webhookSecret);
    const signature = webhook.sign(
      msgId,
      new Date(timestampSeconds * 1000),
      body,
    );

    return { msgId, timestamp: String(timestampSeconds), signature };
  };

  describe('POST /webhooks/clerk', () => {
    it('creates the local user from a validly signed user.created event', async () => {
      const clerkId = `clerk-e2e-${Date.now()}`;
      const email = `e2e-${Date.now()}@example.com`;
      const body = JSON.stringify({
        type: 'user.created',
        data: {
          id: clerkId,
          email_addresses: [{ id: 'email-1', email_address: email }],
          primary_email_address_id: 'email-1',
          first_name: 'E2E',
          last_name: 'Test',
          phone_numbers: [],
          primary_phone_number_id: null,
          image_url: 'https://example.com/avatar.png',
          public_metadata: {},
        },
      });
      const { msgId, timestamp, signature } = signPayload(body);

      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set('Content-Type', 'application/json')
        .set('svix-id', msgId)
        .set('svix-timestamp', timestamp)
        .set('svix-signature', signature)
        .send(body)
        .expect(200)
        .expect({ data: { received: true } });

      await RequestContext.create(orm.em, async () => {
        const created = await userService.findByClerkId(clerkId);
        expect(created.email).toBe(email);
        expect(created.firstName).toBe('E2E');
        expect(created.lastName).toBe('Test');

        await userService.remove(created.id, null);
      });
    });

    it('rejects a request with an invalid signature', async () => {
      const body = JSON.stringify({
        type: 'user.created',
        data: { id: 'clerk-invalid-sig' },
      });
      const { msgId, timestamp } = signPayload(body);

      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set('Content-Type', 'application/json')
        .set('svix-id', msgId)
        .set('svix-timestamp', timestamp)
        .set('svix-signature', 'v1,tampered-signature')
        .send(body)
        .expect(400);
    });

    it('POST /webhooks/clerk processes one svix-id once', async () => {
      const clerkId = `clerk-once-${Date.now()}`;
      const msgId = `msg-once-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await RequestContext.create(orm.em, () =>
        userService.create(
          {
            clerkId,
            email: `${clerkId}@example.com`,
            firstName: 'Before',
            lastName: 'Once',
            role: UserRole.USER,
          },
          null,
        ),
      );
      const updated = (firstName: string) =>
        JSON.stringify({
          type: 'user.updated',
          data: {
            id: clerkId,
            email_addresses: [
              { id: 'email-1', email_address: `${clerkId}@example.com` },
            ],
            primary_email_address_id: 'email-1',
            first_name: firstName,
            last_name: 'Once',
            phone_numbers: [],
            primary_phone_number_id: null,
            image_url: null,
            public_metadata: {},
          },
        });
      const deliver = (body: string) => {
        const { timestamp, signature } = signPayload(body, msgId);
        return request(app.getHttpServer())
          .post('/webhooks/clerk')
          .set('Content-Type', 'application/json')
          .set('svix-id', msgId)
          .set('svix-timestamp', timestamp)
          .set('svix-signature', signature)
          .send(body)
          .expect(200);
      };

      await deliver(updated('First'));
      await deliver(updated('Second'));

      await RequestContext.create(orm.em, async () => {
        expect((await userService.findByClerkId(clerkId)).firstName).toBe(
          'First',
        );
      });
      const rows = (await orm.em
        .getConnection()
        .execute(
          'select provider, status from webhook_events where event_id = ?',
          [msgId],
        )) as { provider: string; status: string }[];
      expect(rows).toEqual([{ provider: 'CLERK', status: 'PROCESSED' }]);
    });
  });

  describe('audit', () => {
    type AuditRow = { created_by: string | null; updated_by: string | null };
    const auditRow = async (clerkId: string): Promise<AuditRow> => {
      const [row] = (await orm.em
        .getConnection()
        .execute(
          'select created_by, updated_by from users where clerk_id = ?',
          [clerkId],
        )) as AuditRow[];
      return row;
    };

    const send = async (type: string, data: object): Promise<void> => {
      const body = JSON.stringify({ type, data });
      const { msgId, timestamp, signature } = signPayload(body);
      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set('Content-Type', 'application/json')
        .set('svix-id', msgId)
        .set('svix-timestamp', timestamp)
        .set('svix-signature', signature)
        .send(body)
        .expect(200);
    };

    const clerkUser = (
      clerkId: string,
      email: string,
      overrides: object = {},
    ): object => ({
      id: clerkId,
      email_addresses: [{ id: 'email-1', email_address: email }],
      primary_email_address_id: 'email-1',
      first_name: 'Audit',
      last_name: 'Webhook',
      phone_numbers: [],
      primary_phone_number_id: null,
      image_url: 'https://example.com/avatar.png',
      public_metadata: {},
      banned: false,
      locked: false,
      ...overrides,
    });

    const seedEditedByAdmin = async (): Promise<{
      clerkId: string;
      email: string;
      adminId: string;
    }> => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const clerkId = `clerk-e2e-audit-${suffix}`;
      const email = `audit-${suffix}@example.com`;
      const adminId = await RequestContext.create(orm.em, async () => {
        const admin = await userService.create(
          {
            clerkId: `clerk-e2e-admin-${suffix}`,
            email: `admin-${suffix}@example.com`,
            firstName: 'Audit',
            lastName: 'Admin',
            role: UserRole.ADMIN,
          },
          null,
        );
        await userService.create(
          {
            clerkId,
            email,
            firstName: 'Audit',
            lastName: 'Webhook',
            avatarUrl: 'https://example.com/avatar.png',
          },
          admin.id,
        );
        return admin.id;
      });
      return { clerkId, email, adminId };
    };

    it('AC4 user.created leaves createdBy null', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const clerkId = `clerk-e2e-audit-${suffix}`;

      await send(
        'user.created',
        clerkUser(clerkId, `ac4-${suffix}@example.com`),
      );

      expect(await auditRow(clerkId)).toEqual({
        created_by: null,
        updated_by: null,
      });
    });

    it("user.updated with a new role keeps the admin's updatedBy", async () => {
      const { clerkId, email, adminId } = await seedEditedByAdmin();

      await send(
        'user.updated',
        clerkUser(clerkId, email, {
          public_metadata: { role: UserRole.ADMIN },
        }),
      );

      const [row] = (await orm.em
        .getConnection()
        .execute('select role, updated_by from users where clerk_id = ?', [
          clerkId,
        ])) as { role: string; updated_by: string | null }[];
      expect(row).toEqual({ role: UserRole.ADMIN, updated_by: adminId });
    });

    it('user.updated with a new first name sets updatedBy null', async () => {
      const { clerkId, email } = await seedEditedByAdmin();

      await send(
        'user.updated',
        clerkUser(clerkId, email, { first_name: 'Renamed' }),
      );

      expect((await auditRow(clerkId)).updated_by).toBeNull();
    });
  });
});
