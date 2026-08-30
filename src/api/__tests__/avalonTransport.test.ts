import { beforeEach, describe, expect, it, vi } from 'vitest';

const tcp = vi.hoisted(() => ({ createConnection: vi.fn() }));

vi.mock('react-native-tcp-socket', () => ({ default: tcp }));

import {
  AVALON_MAX_RESPONSE_BYTES,
  sendCommand,
} from '../avalon';

type Handler = (...args: never[]) => void;

function installSocket() {
  const handlers = new Map<string, Handler>();
  const socket = {
    write: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
      return socket;
    }),
  };
  tcp.createConnection.mockImplementation(
    (_options: unknown, connected: () => void) => {
      queueMicrotask(connected);
      return socket;
    }
  );
  return {
    socket,
    emit(event: string, value?: unknown) {
      handlers.get(event)?.(value as never);
    },
  };
}

beforeEach(() => {
  tcp.createConnection.mockReset();
});

describe('Avalon TCP response bounds', () => {
  it('still accepts a normal response split across chunks and NUL-terminated', async () => {
    const transport = installSocket();
    const resultPromise = sendCommand('10.0.0.2', 'version');
    transport.emit('data', '{"STATUS":[{"STATUS":"S"}],');
    transport.emit('data', '"VERSION":[{"MODEL":"Q"}]}\0');

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(transport.socket.destroy).toHaveBeenCalledOnce();
  });

  it('rejects an over-limit response and destroys the socket', async () => {
    const transport = installSocket();
    const resultPromise = sendCommand('10.0.0.2', 'estats');
    transport.emit('data', 'x'.repeat(AVALON_MAX_RESPONSE_BYTES + 1));

    const result = await resultPromise;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RESPONSE_TOO_LARGE');
    expect(transport.socket.destroy).toHaveBeenCalledOnce();
  });

  it('counts multibyte text by UTF-8 bytes', async () => {
    const transport = installSocket();
    const resultPromise = sendCommand('10.0.0.2', 'estats');
    transport.emit(
      'data',
      '🚀'.repeat(Math.floor(AVALON_MAX_RESPONSE_BYTES / 4) + 1)
    );

    const result = await resultPromise;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RESPONSE_TOO_LARGE');
  });
});
