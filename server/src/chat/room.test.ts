import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatRoom, MAX_CHAT_CLIENT_FRAME_BYTES } from './room';

class AutoResponsePair {
  constructor(
    readonly request: string,
    readonly response: string
  ) {}
}

beforeAll(() => {
  vi.stubGlobal('WebSocketRequestResponsePair', AutoResponsePair);
});

function makeRoom() {
  const setWebSocketAutoResponse = vi.fn();
  const state = { setWebSocketAutoResponse } as unknown as DurableObjectState;
  const room = new ChatRoom(state, {} as never);
  return { room, setWebSocketAutoResponse };
}

function makeSocket(address: string) {
  const send = vi.fn();
  const close = vi.fn();
  const ws = {
    deserializeAttachment: () => ({ address, blocked: [] }),
    send,
    close,
  } as unknown as WebSocket;
  return { ws, send, close };
}

describe('ChatRoom application frame guards', () => {
  it('keeps runtime ping/pong auto-response configured', () => {
    const { setWebSocketAutoResponse } = makeRoom();
    expect(setWebSocketAutoResponse).toHaveBeenCalledOnce();
    expect(setWebSocketAutoResponse.mock.calls[0][0]).toMatchObject({
      request: 'ping',
      response: 'pong',
    });
  });

  it('rejects anonymous frames before parsing them', async () => {
    const { room } = makeRoom();
    const { ws, send, close } = makeSocket('');

    await room.webSocketMessage(ws, '{ definitely not json');

    expect(close).toHaveBeenCalledWith(1008, 'Read-only connection');
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'error',
      code: 'not_authenticated',
    });
  });

  it('closes oversized authenticated text and binary frames before parsing', async () => {
    const { room } = makeRoom();
    const textSocket = makeSocket('bc1qtestaddress000000000000000000000');
    await room.webSocketMessage(
      textSocket.ws,
      '🚀'.repeat(MAX_CHAT_CLIENT_FRAME_BYTES / 4 + 1)
    );
    expect(textSocket.close).toHaveBeenCalledWith(1009, 'Message too large');
    expect(textSocket.send).not.toHaveBeenCalled();

    const binarySocket = makeSocket('bc1qtestaddress000000000000000000000');
    await room.webSocketMessage(binarySocket.ws, new ArrayBuffer(1));
    expect(binarySocket.close).toHaveBeenCalledWith(1003, 'Text frames only');
    expect(binarySocket.send).not.toHaveBeenCalled();
  });

  it('preserves normal authenticated parsing and error responses', async () => {
    const { room } = makeRoom();
    const { ws, send, close } = makeSocket(
      'bc1qtestaddress000000000000000000000'
    );

    await room.webSocketMessage(ws, JSON.stringify({ type: 'future-event' }));

    expect(close).not.toHaveBeenCalled();
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'error',
      code: 'unknown_type',
    });
  });
});
