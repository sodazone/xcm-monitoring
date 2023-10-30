import { EventEmitter } from 'node:events';

import {
  Observable, Subscription, mergeAll, zip, share, mergeMap, from, tap, switchMap, map
} from 'rxjs';
import { encode, decode } from 'cbor-x';
import { Mutex } from 'async-mutex';

import type { Header, EventRecord, AccountId } from '@polkadot/types/interfaces';
import type { Vec, Bytes } from '@polkadot/types';
import type { SignedBlockExtended } from '@polkadot/api-derive/types';
import type { PolkadotCorePrimitivesOutboundHrmpMessage } from '@polkadot/types/lookup';
import { ApiPromise } from '@polkadot/api';
import { createSignedBlockExtended } from '@polkadot/api-derive';

import {
  blocks,
  finalizedHeads,
  blockFromHeader,
  retryWithTruncatedExpBackoff,
  SubstrateApis
} from '@sodazone/ocelloids';

import { DB, Logger, Services, jsonEncoded, prefixes } from '../types.js';
import { ChainHead as ChainTip, BinBlock, GetOutboundHrmpMessages, GetOutboundUmpMessages, HexString } from './types.js';
import { Janitor } from '../../services/persistence/janitor.js';
import { ServiceConfiguration } from '../../services/config.js';

const MAX_BLOCK_DIST : bigint = process.env.XCMON_MAX_BLOCK_DIST ?
  BigInt(process.env.XCMON_MAX_BLOCK_DIST)
  : 150n; // maximum distance in #blocks
const max = (...args : bigint[]) => args.reduce((m, e) => e > m ? e : m);

/**
 * The HeadCatcher performs the following tasks ("moo" 🐮):
 * - Catches up with block headers based on the height gap for finalized blocks.
 * - Caches seen extended signed blocks and supplies them when required on finalization.
 * - Caches storage data from XCM queues.
 *
 * @see {HeadCatcher.finalizedBlocks}
 * @see {HeadCatcher.#catchUpHeads}
 */
export class HeadCatcher extends EventEmitter {
  #apis: SubstrateApis;
  #log: Logger;
  #config: ServiceConfiguration;
  #db: DB;
  #janitor: Janitor;

  #mutex: Record<string, Mutex> = {};
  #subs: Record<string, Subscription> = {};
  #pipes: Record<string, Observable<any>> = {};

  constructor(
    {
      log,
      config,
      storage: { root: db },
      janitor,
      connector
    }: Services
  ) {
    super();

    this.#log = log;
    this.#config = config;
    this.#apis = connector.connect();
    this.#db = db;
    this.#janitor = janitor;
  }

  start() {
    const { networks } = this.#config;

    for (const network of networks) {
      // We only need to cache for smoldot
      if (network.provider.type === 'smoldot') {
        const chainId = network.id.toString();
        const isRelayChain = network.relay === undefined;
        const api = this.#apis.rx[chainId];

        this.#log.info('[%s] Register head catcher', chainId);

        const block$ = api.pipe(
          blocks(),
          retryWithTruncatedExpBackoff(),
          tap(({ block: {header} }) => {
            this.#log.info(
              '[%s] SEEN block #%s %s',
              chainId,
              header.number.toString(),
              header.hash.toHex()
            );
          })
        );
        const msgs$ = block$.pipe(
          mergeMap(block => {
            return api.pipe(
              switchMap(_api => _api.at(block.block.header.hash)),
              mergeMap(at =>
                zip([
                  from(
                    at.query.parachainSystem.hrmpOutboundMessages()
                  ) as Observable<Vec<PolkadotCorePrimitivesOutboundHrmpMessage>>,
                  from(
                    at.query.parachainSystem.upwardMessages()
                  ) as Observable<Vec<Bytes>>
                ])
              ),
              retryWithTruncatedExpBackoff(),
              map(([hrmpMessages, umpMessages]) =>  {
                return {
                  block,
                  hrmpMessages,
                  umpMessages
                };
              })
            );
          })
        );

        if (isRelayChain) {
          this.#subs[chainId] = block$.pipe(
            map(block => from(this.#putBlock(chainId, block))),
            mergeAll()
          ).subscribe(
            {
              error: error => this.#log.error(
                error,
                '[%s] Error on caching block for relay chain',
                chainId
              )
            }
          );
        } else {
          this.#subs[chainId] = msgs$.pipe(
            map(({ block, hrmpMessages, umpMessages }) => {
              const ops = [from(this.#putBlock(chainId, block))];
              const hash = block.block.header.hash.toHex();

              if (hrmpMessages.length > 0) {
                ops.push(from(this.#putBuffer(
                  chainId, prefixes.cache.keys.hrmp(hash), hrmpMessages.toU8a()
                )));
              }
              if (umpMessages.length > 0) {
                ops.push(from(this.#putBuffer(
                  chainId, prefixes.cache.keys.ump(hash), umpMessages.toU8a()
                )));
              }
              return ops;
            }),
            mergeAll()
          ).subscribe(
            {
              error: error => this.#log.error(
                error,
                '[%s] Error on caching block and XCMP messages for parachain',
                chainId
              )
            }
          );
        }
      }
    }
  }

  stop() {
    this.#log.info('Stopping head catcher');

    for (const [chain, sub] of Object.entries(this.#subs)) {
      this.#log.info(`Unsubscribe head catcher of chain ${chain}`);
      sub.unsubscribe();
      delete this.#subs[chain];
    }
  }

  /**
   * Returns an observable of extended signed blocks, providing cached block content as needed.
   *
   * When using Smoldot as a parachain light client, it cannot retrieve finalized block content
   * after the finalized block height surpasses the "best" number from the initial handshake.
   * This occurs because the block announcements never contain the "best" flag. As a result, the mapping
   * of peers to the "best" block is never updated after the initial announcement handshake. Consequently,
   * the block content cannot be retrieved due to Smoldot's retrieval logic. See:
   * - https://github.com/smol-dot/smoldot/blob/6f7afdc9d35a1377af1073be6c0791a62a9c7f45/light-base/src/sync_service.rs#L507
   * - https://github.com/smol-dot/smoldot/blob/6f7afdc9d35a1377af1073be6c0791a62a9c7f45/light-base/src/json_rpc_service/background.rs#L713
   */
  finalizedBlocks(
    chainId: string
  ) : Observable<SignedBlockExtended> {
    const api = this.#apis.promise[chainId];
    let pipe = this.#pipes[chainId];

    if (pipe) {
      return pipe;
    }

    if (this.#hasCache(chainId)) {
      pipe = this.#apis.rx[chainId].pipe(
        finalizedHeads(),
        retryWithTruncatedExpBackoff(),
        this.#catchUpHeads(chainId, api),
        mergeMap(head => from(this.#getBlock(
          chainId, api, head.hash.toHex()
        ))),
        retryWithTruncatedExpBackoff(),
        share()
      );
    } else {
      pipe = this.#apis.rx[chainId].pipe(
        finalizedHeads(),
        retryWithTruncatedExpBackoff(),
        this.#catchUpHeads(chainId, api),
        blockFromHeader(api),
        retryWithTruncatedExpBackoff(),
        share()
      );
    }

    this.#pipes[chainId] = pipe;
    return pipe;
  }

  /**
   * Returns outbound HRMP messages either from data cached in previously seen blocks,
   * or from a query storage request to the network.
   */
  outboundHrmpMessages(chainId: string) : GetOutboundHrmpMessages {
    const api = this.#apis.promise[chainId];
    const cache = this.#cache(chainId);

    if (this.#hasCache(chainId)) {
      return (hash: HexString)
      : Observable<Vec<PolkadotCorePrimitivesOutboundHrmpMessage>> => {
        return from(cache.get(prefixes.cache.keys.hrmp(hash))).pipe(
          map(buffer => {
            return api.registry.createType(
              'Vec<PolkadotCorePrimitivesOutboundHrmpMessage>', buffer
            ) as Vec<PolkadotCorePrimitivesOutboundHrmpMessage>;
          })
        );
      };
    } else {
      return (hash: HexString)
      : Observable<Vec<PolkadotCorePrimitivesOutboundHrmpMessage>> => {
        return from(api.at(hash)).pipe(
          switchMap(at =>
           from(
             at.query.parachainSystem.hrmpOutboundMessages()
           ) as Observable<Vec<PolkadotCorePrimitivesOutboundHrmpMessage>>
          ),
          retryWithTruncatedExpBackoff()
        );
      };
    }
  }

  /**
   * Returns outbound UMP messages either from data cached in previously seen blocks,
   * or from a query storage request to the network.
   */
  outboundUmpMessages(chainId: string) : GetOutboundUmpMessages {
    const api = this.#apis.promise[chainId];
    const cache = this.#cache(chainId);

    if (this.#hasCache(chainId)) {
      return (hash: HexString)
      : Observable<Vec<Bytes>> => {
        return from(cache.get(prefixes.cache.keys.ump(hash))).pipe(
          map(buffer => {
            return api.registry.createType(
              'Vec<Bytes>', buffer
            ) as Vec<Bytes>;
          })
        );
      };
    } else {
      return (hash: HexString)
      : Observable<Vec<Bytes>> => {
        return from(api.at(hash)).pipe(
          switchMap(at =>
           from(
             at.query.parachainSystem.upwardMessages()
           ) as Observable<Vec<Bytes>>
          ),
          retryWithTruncatedExpBackoff()
        );
      };
    }
  }

  /**
   * Returns true if there is a subscription for the
   * "head catcher" logic, i.e. block caching and catch-up.
   *
   * @private
   */
  #hasCache(chainId: string) {
    return this.#subs[chainId] !== undefined;
  }

  /**
   * Gets a persisted extended signed block from the storage or
   * tries to get it from the network if not found.
   *
   * @private
   */
  async #getBlock(
    chainId: string,
    api: ApiPromise,
    hash: HexString
  ) {
    try {
      const buffer = await this.#cache(chainId).get(
        prefixes.cache.keys.block(hash)
      );
      const binBlock: BinBlock = decode(buffer);

      const registry = api.registry;
      const block = registry.createType('SignedBlock', binBlock.block);
      const records = registry.createType('Vec<EventRecord>', binBlock.events, true);
      const author = registry.createType('AccountId', binBlock.author);

      const signedBlock = createSignedBlockExtended(
        registry,
        block as SignedBlockExtended,
        records as unknown as EventRecord[],
        null,
        author as AccountId
      );

      return signedBlock;
    } catch (error) {
      return await api.derive.chain.getBlock(hash);
    }
  }

  get #chainTips() {
    return this.#db.sublevel<string, ChainTip>(
      prefixes.cache.tips, jsonEncoded
    );
  }

  /**
   * Catches up the blockchain heads by fetching missing blocks between the current stored
   * head and the new incoming head, and updates the storage with the highest head information.
   *
   * Returns an array of heads containing the current head from the source along the heads
   * of the block range gap.
   *
   * This function throttles the requests to avoid overwhelming the network.
   *
   * @private
   */
  #catchUpHeads(
    chainId: string,
    api: ApiPromise
  ) {
    return (source: Observable<Header>)
    : Observable<Header> => {
      return source.pipe(
        tap(head => {
          this.#log.info('[%s] FINALIZED block #%s %s',
            chainId,
            head.number.toBigInt(),
            head.hash.toHex()
          );
        }),
        mergeMap(head => from(
          this.#doCatchUp(chainId, api, head)
        )),
        retryWithTruncatedExpBackoff(),
        mergeAll(10) // limit concurrency
      );
    };
  }

  async #doCatchUp(chainId: string, api: ApiPromise, head: Header) {
    if (this.#mutex[chainId] === undefined) {
      this.#mutex[chainId] = new Mutex();
    }

    const release = await this.#mutex[chainId].acquire();

    try {
      const heads : Header[] = [head];
      const newHeadNum = head.number.toBigInt();
      let currentHeight: bigint;

      const chainTip: ChainTip = {
        chainId,
        blockNumber: head.number.toString(),
        blockHash: head.hash.toHex(),
        parentHash: head.parentHash.toHex(),
        receivedAt: new Date()
      };

      try {
        const currentTip = await this.#chainTips.get(chainId);
        currentHeight = BigInt(currentTip.blockNumber);
      } catch (error) {
        currentHeight = newHeadNum;
      }

      const blockDistance = newHeadNum - currentHeight;

      if (blockDistance < 2) {
        // nothing to catch
        await this.#chainTips.put(chainId, chainTip);
        return heads;
      }

      const targetHeight = max(newHeadNum - MAX_BLOCK_DIST, currentHeight);

      this.#log.info(
        '[%s] CATCHING UP from #%s to #%s (trunc=%s)',
        chainId,
        targetHeight,
        newHeadNum,
        targetHeight - currentHeight
      );

      let parentHead = head;

      const delay = this.#config.networks.find(
        n => n.id === parseInt(chainId)
      )?.throttle ?? 1000;

      while (parentHead.number.toBigInt() - targetHeight > 1) {
        try {
          parentHead = await api.rpc.chain.getHeader(parentHead.parentHash);

          heads.push(parentHead);

          // TODO: log every n blocks?
          this.#log.info(
            '[%s] CATCH-UP FINALIZED block #%s %s',
            chainId,
            parentHead.number.toBigInt(),
            parentHead.hash.toHex()
          );

          // throttle
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (err) {
          console.log(err);
        }
      }

      await this.#chainTips.put(chainId, chainTip);

      return heads;
    } finally {
      release();
    }
  }

  #cache(chainId: string) {
    return this.#db.sublevel<string, Uint8Array>(
      prefixes.cache.family(chainId),
      {
        valueEncoding: 'buffer'
      }
    );
  }

  async #putBuffer(chainId: string, key: string, buffer: Uint8Array) {
    const db = this.#cache(chainId);
    await db.put(key, buffer);

    await this.#janitor.schedule({
      sublevel: prefixes.cache.family(chainId),
      key
    });
  }

  async #putBlock(chainId: string, block: SignedBlockExtended) {
    const hash = block.block.header.hash.toHex();
    const key = prefixes.cache.keys.block(hash);

    // TODO: review to use SCALE instead of CBOR
    await this.#cache(chainId).put(
      key,
      encode({
        block: block.toU8a(),
        events: block.events.map(ev => ev.toU8a()),
        author: block.author?.toU8a()
      })
    );

    await this.#janitor.schedule({
      sublevel: prefixes.cache.family(chainId),
      key
    });
  }
}