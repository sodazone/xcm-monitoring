import { jest } from '@jest/globals';

import { umpReceive, umpSend } from '../../../testing/xcm.js';

import { extractUmpReceive, extractUmpSend } from './ump.js';

describe('ump operator', () => {
  describe('extractUmpSend', () => {
    it('should extract UMP sent message', done => {
      const {
        blocks,
        apiPromise,
        sendersControl,
        messageControl,
        getUmp
      } = umpSend;

      const calls = jest.fn();

      const test$ = extractUmpSend(
        apiPromise,
        {
          sendersControl,
          messageControl
        },
        getUmp
      )(blocks);

      test$.subscribe({
        next: msg => {
          calls();
          expect(msg).toBeDefined();
          expect(msg.blockNumber).toBeDefined();
          expect(msg.blockHash).toBeDefined();
          expect(msg.instructions).toBeDefined();
          expect(msg.messageData).toBeDefined();
          expect(msg.messageHash).toBeDefined();
          expect(msg.recipient).toBeDefined();
        },
        complete: () => {
          expect(calls).toBeCalledTimes(1);
          done();
        }
      });
    });
  });

  describe('extractUmpReceive', () => {
    it('should extract failed UMP received message', done => {
      const { successBlocks } = umpReceive;

      const calls = jest.fn();

      const test$ = extractUmpReceive(1000)(successBlocks);

      test$.subscribe({
        next: msg => {
          calls();
          expect(msg).toBeDefined();
          expect(msg.blockNumber).toBeDefined();
          expect(msg.blockHash).toBeDefined();
          expect(msg.event).toBeDefined();
          expect(msg.messageHash).toBeDefined();
          expect(msg.outcome).toBeDefined();
          expect(msg.outcome).toBe('Success');
        },
        complete: () => {
          expect(calls).toBeCalledTimes(1);
          done();
        }
      });
    });

    it('should extract XCMP receive with outcome fail', done => {
      const { failBlocks } = umpReceive;

      const calls = jest.fn();

      const test$ = extractUmpReceive(1000)(failBlocks);

      test$.subscribe({
        next: msg => {
          calls();
          expect(msg).toBeDefined();
          expect(msg.blockNumber).toBeDefined();
          expect(msg.blockHash).toBeDefined();
          expect(msg.event).toBeDefined();
          expect(msg.messageHash).toBeDefined();
          expect(msg.outcome).toBeDefined();
          expect(msg.outcome).toBe('Fail');
        },
        complete: () => {
          expect(calls).toBeCalledTimes(1);
          done();
        }
      });
    });
  });
});