import { AbstractSublevel } from 'abstract-level';
import { Mutex } from 'async-mutex';

import { DB, Logger, Services, jsonEncoded, prefixes } from '../types.js';
import {
  XcmMessageNotify,
  XcmMessageReceived,
  XcmMessageSent
} from './types.js';
import { Janitor } from 'services/persistence/janitor.js';

export type NotificationReceiver = (message: XcmMessageNotify) => Promise<void> | void;
type SubLevel<TV> = AbstractSublevel<DB, Buffer | Uint8Array | string, string, TV>;

export type ChainBlock = {
  chainId: string | number,
  blockHash: string,
  blockNumber: string
}

/**
 * Matches sent XCM messages on the destination.
 * It does not assume any ordering.
 *
 * Current matching logic takes into account that messages at origin and destination
 * might or might not have a unique ID set via SetTopic instruction.
 * Therefore, it supports matching logic using both message hash and message ID.
 *
 * When unique message ID is implemented in all XCM events, we can:
 * - simplify logic to match only by message ID
 * - check notification storage by message ID and do not store for matching if already matched
 */
export class MatchingEngine {
  #db: DB;
  #log: Logger;
  #janitor: Janitor;

  #outbound: SubLevel<XcmMessageSent>;
  #inbound: SubLevel<XcmMessageReceived>;
  #mutex: Mutex;
  #noticationReceiver: any;

  constructor(
    {
      log, storage: { root: db }, janitor
    }: Services
  ) {
    this.#db = db;
    this.#log = log;
    this.#janitor = janitor;
    this.#mutex = new Mutex();

    this.#outbound = this.#sl(prefixes.matching.outbound);
    this.#inbound = this.#sl(prefixes.matching.inbound);
  }

  async onOutboundMessage(outMsg: XcmMessageSent) {
    const log = this.#log;

    // Confirmation key at destination
    await this.#mutex.runExclusive(async () => {
      const hashKey = `${outMsg.messageHash}:${outMsg.recipient}`;

      if (outMsg.messageId) {
        // Still we don't know if the inbound is upgraded,
        // i.e. uses message ids
        const idKey = `${outMsg.messageId}:${outMsg.recipient}`;
        try {
          const inMsg = await Promise.any([
            this.#inbound.get(idKey),
            this.#inbound.get(hashKey)
          ]);

          log.info(
            '[%s:out] MATCHED hash=%s id=%s',
            outMsg.chainId,
            hashKey,
            idKey
          );
          await this.#inbound.batch()
            .del(idKey)
            .del(hashKey)
            .write();
          await this.#notify(outMsg, inMsg);
        } catch {
          log.info(
            '[%s:out] STORED hash=%s id=%s (subId=%s)',
            outMsg.chainId,
            hashKey,
            idKey,
            outMsg.subscriptionId
          );
          await this.#outbound.batch()
            .put(idKey, outMsg)
            .put(hashKey, outMsg)
            .write();
        }
      } else {
        try {
          const inMsg = await this.#inbound.get(hashKey);
          log.info(
            '[%s:out] MATCHED hash=%s',
            outMsg.chainId,
            hashKey
          );
          await this.#inbound.del(hashKey);
          await this.#notify(outMsg, inMsg);
        } catch {
          log.info(
            '[%s:out] STORED hash=%s (subId=%s)',
            outMsg.chainId,
            hashKey,
            outMsg.subscriptionId
          );
          await this.#outbound.put(hashKey, outMsg);
        }
      }
    });
  }

  async onInboundMessage(inMsg: XcmMessageReceived)  {
    const log = this.#log;

    await this.#mutex.runExclusive(async () => {
      const hashKey = `${inMsg.messageHash}:${inMsg.chainId}`;
      const idKey = `${inMsg.messageId}:${inMsg.chainId}`;

      if (hashKey === idKey) {
        try {
          const outMsg = await this.#outbound.get(hashKey);
          log.info(
            '[%s:in] MATCHED hash=%s',
            inMsg.chainId,
            hashKey
          );
          await this.#outbound.del(hashKey);
          await this.#notify(outMsg, inMsg);
        } catch {
          log.info(
            '[%s:in] STORED hash=%s (subId=%s)',
            inMsg.chainId,
            hashKey,
            inMsg.subscriptionId
          );
          await this.#inbound.put(hashKey, inMsg);
          await this.#janitor.schedule({
            sublevel: prefixes.matching.inbound,
            key: hashKey
          });
        }
      } else {
        try {
          const outMsg = await Promise.any([
            this.#outbound.get(idKey),
            this.#outbound.get(hashKey)
          ]);
          log.info(
            '[%s:in] MATCHED hash=%s id=%s',
            inMsg.chainId,
            hashKey,
            idKey
          );
          await this.#outbound.batch()
            .del(idKey)
            .del(hashKey)
            .write();
          await this.#notify(outMsg, inMsg);
        } catch {
          log.info(
            '[%s:in] STORED hash=%s id=%s (subId=%s)',
            inMsg.chainId,
            hashKey,
            idKey,
            inMsg.subscriptionId
          );
          await this.#inbound.batch()
            .put(idKey, inMsg)
            .put(hashKey, inMsg)
            .write();
          await this.#janitor.schedule(
            {
              sublevel: prefixes.matching.inbound,
              key: hashKey
            },
            {
              sublevel: prefixes.matching.inbound,
              key: idKey
            }
          );
        }
      }
    });
  }

  onNotification(receiver: NotificationReceiver) {
    this.#noticationReceiver = receiver;
  }

  async stop() {
    await this.#mutex.waitForUnlock();
  }

  async #notify(
    outMsg: XcmMessageSent,
    inMsg: XcmMessageReceived
  ) {
    try {
      const message: XcmMessageNotify = new XcmMessageNotify(outMsg, inMsg);
      await this.#noticationReceiver(message);
    } catch (e) {
      this.#log.error(e, 'Error on notification');
    }
  }

  #sl<TV>(prefix: string) {
    return this.#db.sublevel<string, TV>(prefix, jsonEncoded);
  }
}