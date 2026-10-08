import { PushService } from './push.service';
import { generateVapidKeys } from './push-vapid';

const user = { userId: 'u1', email: 'p@x', role: 'PARENT', schoolId: null };

function service(devices: { id: string; endpoint: string }[] = []) {
  const prisma = {
    pushSubscription: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockImplementation((args: { skip?: number }) => Promise.resolve(args?.skip ? [] : devices)),
      deleteMany: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  return { svc: new PushService(prisma as never), prisma };
}

describe('push notifications', () => {
  const env = { ...process.env };
  const fetchMock = jest.fn();
  beforeEach(() => {
    const keys = generateVapidKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.PUSH_ALLOWED_HOSTS = '';
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });
  afterAll(() => {
    process.env = env;
  });

  it('is off, and says so, without keys', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { svc } = service();
    expect(svc.config()).toEqual({ enabled: false, publicKey: null });
    await expect(svc.subscribe(user, 'https://fcm.googleapis.com/fcm/send/x')).rejects.toThrow('pas configurées');
    expect(await svc.wake('u1')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a device of a known push service and refuses any other address', async () => {
    const { svc, prisma } = service();
    expect(svc.config().enabled).toBe(true);
    await expect(svc.subscribe(user, 'https://fcm.googleapis.com/fcm/send/x')).resolves.toMatchObject({ success: true });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalled();
    await expect(svc.subscribe(user, 'http://169.254.169.254/latest')).rejects.toThrow('service de notification reconnu');
    await expect(svc.subscribe(user, 'https://interne.example/push')).rejects.toThrow('service de notification reconnu');
  });

  it('wakes each device with an empty, signed request', async () => {
    const { svc, prisma } = service([{ id: 'd1', endpoint: 'https://fcm.googleapis.com/fcm/send/a' }, { id: 'd2', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/b' }]);
    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    expect(await svc.wake('u1')).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/a');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toMatch(/^vapid t=/);
    expect(prisma.pushSubscription.update).toHaveBeenCalledTimes(2);
  });

  it('forgets a device the push service no longer knows', async () => {
    const { svc, prisma } = service([{ id: 'gone', endpoint: 'https://fcm.googleapis.com/fcm/send/gone' }]);
    fetchMock.mockResolvedValue({ ok: false, status: 410 });
    expect(await svc.wake('u1')).toBe(0);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'gone' } });
  });

  it('never calls an address outside the allowed services, even if it was stored', async () => {
    const { svc, prisma } = service([{ id: 'bad', endpoint: 'http://localhost:5432/' }]);
    expect(await svc.wake('u1')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'bad' } });
  });

  it('survives a network failure', async () => {
    const { svc } = service([{ id: 'd1', endpoint: 'https://fcm.googleapis.com/fcm/send/a' }]);
    fetchMock.mockRejectedValue(new Error('réseau coupé'));
    await expect(svc.wake('u1')).resolves.toBe(0);
  });
});
