import { Observable, Subject, from } from 'rxjs';

import { TypeRegistry, Metadata } from '@polkadot/types';
import type { Registry } from '@polkadot/types-codec/types';
import type { SignedBlockExtended } from '@polkadot/api-derive/types';

import { Logger, Services } from '../../types.js';

import {
  RedisDistributor,
  getBlockStreamKey,
  getMetadataKey,
  getStorageReqKey,
  getReplyToKey,
  NetworkRecord,
  NetworkEntry,
  NetworksKey,
} from '../distributor.js';
import { IngressOptions } from '../../../types.js';

import { HeadCatcher } from '../watcher/head-catcher.js';
import { decodeSignedBlockExtended } from '../watcher/codec.js';
import { HexString } from '../../monitoring/types.js';
import { ServiceConfiguration, isRelay, isNetworkDefined } from '../../config.js';

/**
 * Creates a type registry with metadata.
 *
 * @param bytes The bytes of the metadata.
 * @returns A new TypeRegistry instance with the provided metadata.
 * @private
 */
function createRegistry(bytes: Buffer | Uint8Array) {
  const typeRegistry = new TypeRegistry();
  const metadata = new Metadata(typeRegistry, bytes);
  typeRegistry.setMetadata(metadata);
  return typeRegistry;
}

/**
 * Interface defining the operations for an IngressConsumer.
 *
 * This interface provides a contract for components functioning both locally
 * and in a distributed environment.
 */
export interface IngressConsumer {
  finalizedBlocks(chainId: string): Observable<SignedBlockExtended>;
  getStorage(chainId: string, storageKey: HexString, blockHash?: HexString): Observable<Uint8Array>;
  getRegistry(chainId: string): Promise<Registry>;
  isRelay(chainId: string): boolean;
  isNetworkDefined(chainId: string): boolean;
  getChainIds(): string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Represents an implementation of {@link IngressConsumer} that operates in a distributed environment.
 *
 * This class is responsible for managing block consumption and storage retrieval logic,
 * communicating through a distributed middleware.
 */
export class DistributedIngressConsumer implements IngressConsumer {
  readonly #log: Logger;
  readonly #blockConsumers: Record<string, Subject<SignedBlockExtended>> = {};
  readonly #registries: Record<string, Registry> = {};
  readonly #distributor: RedisDistributor;

  #networks: NetworkRecord = {};

  constructor(ctx: Services, opts: IngressOptions) {
    this.#log = ctx.log;
    this.#distributor = new RedisDistributor(opts, ctx);
  }

  async start() {
    await this.#distributor.start();
    await this.#networksFromRedis();

    for (const chainId of this.getChainIds()) {
      this.#blockConsumers[chainId] = new Subject<SignedBlockExtended>();

      // TODO this would be a stream of one (?) element
      // so we don't depend on the start order of services
      // + it can be updated on runtime upgrades
      const registry = await this.getRegistry(chainId);

      this.#log.info('[%s] Distributed block consumer', chainId);
      this.#blockStreamFromRedis(registry, chainId);
    }
  }

  async stop() {
    await this.#distributor.stop();
  }

  finalizedBlocks(chainId: string): Observable<SignedBlockExtended> {
    const consumer = this.#blockConsumers[chainId];
    if (consumer === undefined) {
      throw new Error('Missing distributed consumer for chain=' + chainId);
    }
    return consumer.asObservable();
  }

  async getRegistry(chainId: string): Promise<Registry> {
    if (this.#registries[chainId]) {
      return this.#registries[chainId];
    }
    const bytes = await this.#distributor.getBuffers(getMetadataKey(chainId));
    if (bytes) {
      const registry = createRegistry(bytes);
      this.#registries[chainId] = registry;
      return registry;
    } else {
      throw new Error(`[${chainId}] runtime metadata not found`);
    }
  }

  getStorage(chainId: string, storageKey: HexString, blockHash?: HexString): Observable<Uint8Array> {
    return this.#storageFromRedis(chainId, storageKey, blockHash);
  }

  getChainIds(): string[] {
    return Object.keys(this.#networks);
  }

  isRelay(chainId: string) {
    return this.#networks[chainId]?.isRelay;
  }

  isNetworkDefined(chainId: string) {
    return this.#networks[chainId] !== undefined;
  }

  async #networksFromRedis() {
    try {
      const members = await this.#distributor.smembers(NetworksKey);
      if (members.length > 0) {
        for (const m of members) {
          const network = JSON.parse(m) as NetworkEntry;
          if (this.#networks[network.id] === undefined) {
            this.#log.info(
              '[%s] READ network configuration (name=%s,relay?=%s)',
              network.id,
              network.name,
              network.isRelay
            );
            this.#networks[network.id] = network;
          }
          // TODO handle removal
        }
      }
      setTimeout(() => {
        this.#networksFromRedis();
      }, 60_000);
    } catch (error) {
      this.#log.error(error, 'Error reading networks from Redis');
      throw error;
    }
  }

  #storageFromRedis(chainId: string, storageKey: HexString, blockHash?: HexString) {
    return from(
      new Promise<Uint8Array>((resolve, reject) => {
        const distributor = this.#distributor;
        const replyTo = getReplyToKey(chainId, storageKey, blockHash ?? '$');
        const streamKey = getStorageReqKey(chainId);
        const req = {
          replyTo,
          storageKey,
          at: blockHash ?? '0x0',
        };

        distributor
          .add(streamKey, '*', req, {
            TRIM: {
              strategy: 'MAXLEN',
              strategyModifier: '~',
              threshold: 50,
            },
          })
          .then(() => {
            distributor
              .response(replyTo)
              .then((buffer) => {
                if (buffer) {
                  resolve(buffer.element);
                } else {
                  reject(`Error retrieving ${storageKey} (reply-to=${replyTo})`);
                }
              })
              .catch(reject);
          })
          .catch(reject);
      })
    );
  }

  #blockStreamFromRedis(registry: Registry, chainId: string, id: string = '$') {
    const subject = this.#blockConsumers[chainId];
    const key = getBlockStreamKey(chainId);

    this.#distributor.readBuffers<{
      bytes: Buffer;
    }>(
      key,
      (message) => {
        const buffer = message['bytes'];
        const signedBlock = decodeSignedBlockExtended(registry, buffer);
        subject.next(signedBlock);

        this.#log.info(
          '[%s] INGRESS block #%s %s',
          chainId,
          signedBlock.block.header.number.toString(),
          signedBlock.block.header.hash.toHex()
        );
      },
      id
    );
  }
}

/**
 * Represents an implementation of {@link IngressConsumer} that operates in a local environment
 * with direct connectivity to blockchain networks.
 *
 * This class is responsible for managing block consumption and storage retrieval logic
 * within a local or integrated environment.
 */
export class LocalIngressConsumer implements IngressConsumer {
  readonly #log: Logger;
  readonly #headCatcher: HeadCatcher;
  readonly #config: ServiceConfiguration;
  readonly #registries: Record<string, Registry> = {};

  constructor(ctx: Services) {
    this.#log = ctx.log;
    this.#config = ctx.localConfig;
    this.#headCatcher = new HeadCatcher(ctx);
  }

  async start() {
    this.#headCatcher.start();
  }

  async stop() {
    this.#headCatcher.stop();
  }

  getChainIds(): string[] {
    return this.#headCatcher.chainIds;
  }

  isRelay(chainId: string) {
    return isRelay(this.#config, chainId);
  }

  isNetworkDefined(chainId: string) {
    return isNetworkDefined(this.#config, chainId);
  }

  finalizedBlocks(chainId: string): Observable<SignedBlockExtended> {
    return this.#headCatcher.finalizedBlocks(chainId);
  }

  async getRegistry(chainId: string): Promise<Registry> {
    if (this.#registries[chainId]) {
      return this.#registries[chainId];
    }
    const api = await this.#headCatcher.getApiPromise(chainId).isReady;
    const metadata = await api.rpc.state.getMetadata();
    const registry = createRegistry(metadata.toU8a());
    this.#registries[chainId] = registry;
    return registry;
  }

  getStorage(chainId: string, storageKey: HexString, blockHash?: HexString): Observable<Uint8Array> {
    return this.#headCatcher.getStorage(chainId, storageKey, blockHash);
  }
}