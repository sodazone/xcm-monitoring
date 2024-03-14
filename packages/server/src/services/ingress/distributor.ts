import { RedisClientType, createClient, commandOptions } from 'redis';

import { Services, Logger } from '../types.js';
import { IngressOptions } from '../../types.js';

type StreamHandler<T> = (message: T, client: RedisClientType) => void;

/**
 * Redis stream options.
 */
export type XAddOptions = {
  TRIM?: {
    strategy?: 'MAXLEN' | 'MINID';
    strategyModifier?: '=' | '~';
    threshold: number;
    limit?: number;
  };
};

/**
 * Represents a blockchain network configuration.
 *
 * This structure is meant to be persisted in the middleware.
 */
export type NetworkEntry = {
  id: string;
  name: string;
  isRelay: boolean;
  // TODO: owner to be able to remove owned entries
  // on configuration changes?
};

export type NetworkRecord = Record<string, NetworkEntry>;

export const NetworksKey = 'NETWORKS';

export function getBlockStreamKey(chainId: string) {
  return 'S:BLOCKS:' + chainId;
}

export function getMetadataKey(chainId: string) {
  return 'METADATA:' + chainId;
}

export function getVersionKey(chainId: string) {
  return 'RUNTIME:VERSION:' + chainId;
}

export function getStorageReqKey(chainId: string) {
  return 'RQ:STORAGE:' + chainId;
}

export function getReplyToKey(chainId: string, ...args: string[]) {
  return `RP:${chainId}:${args.join(':')}`;
}

/**
 * Represents an implementation of a Redis distributed middleware.
 *
 * This class manages the underlying Redis client and provides asynchronous interaction patterns.
 */
export class RedisDistributor {
  readonly #log: Logger;
  readonly #client: RedisClientType;

  constructor(opts: IngressOptions = {}, ctx: Services) {
    this.#log = ctx.log;

    this.#client = createClient({
      url: opts.redis,
      isolationPoolOptions: {
        autostart: true,
        max: 100,
      },
    });

    this.#client.on('error', (err: unknown) => this.#log.error(err, 'Redis client error'));
  }

  async start() {
    this.#log.info('Connect Redis [url=%s]', this.#client.options?.url ?? 'default');

    await this.#client.connect();
  }

  async stop() {
    this.#log.info('Closing Redis client');

    if (this.#client.isOpen) {
      try {
        await this.#client.disconnect();
      } catch (error) {
        this.#log.error(error, 'Error while closing Redis client');
      }
    }

    this.#log.info('Closed Redis client');
  }

  read<T>(key: string, handler: StreamHandler<T>, returnBuffers = false, id = '$') {
    this.#xread(key, id, {
      isolated: true,
      returnBuffers,
    })
      .then((stream) => {
        if (stream) {
          const { messages } = stream[0];
          const envelope = messages[0];

          handler(envelope.message as T, this.#client);

          setImmediate(() => this.read<T>(key, handler, returnBuffers, envelope.id));
        } else {
          setImmediate(() => this.read<T>(key, handler, returnBuffers, id));
        }
      })
      .catch((error) => {
        this.#log.error(error, 'Error reading stream');
      });
  }

  readBuffers<T>(key: string, handler: StreamHandler<T>, id: string = '$') {
    this.read(key, handler, true, id);
  }

  sadd(key: string, value: string | Array<string>) {
    return this.#client.SADD(key, value);
  }

  smembers(key: string) {
    return this.#client.SMEMBERS(key);
  }

  mset(...args: Array<[string, Buffer | string]>) {
    return this.#client.MSET(args);
  }

  set(key: string, value: Buffer | string) {
    return this.#client.SET(key, value);
  }

  get(key: string) {
    return this.#client.GET(key);
  }

  getBuffers(key: string) {
    return this.#client.GET(
      commandOptions({
        returnBuffers: true,
      }),
      key
    );
  }

  add(key: string, id: string, data: Record<string, string | Buffer>, opts: XAddOptions) {
    return this.#client.XADD(key, id, data, opts);
  }

  addBytes(key: string, bytes: Buffer, opts: XAddOptions) {
    return this.#client.XADD(key, '*', { bytes }, opts);
  }

  response(key: string, timeout: number = 1000) {
    return this.#client.BRPOP(
      commandOptions({
        returnBuffers: true,
      }),
      key,
      timeout
    );
  }

  #xread(key: string, id: string, options: Record<string, unknown>) {
    if (this.#client.isReady) {
      return this.#client.XREAD(
        commandOptions(options),
        [
          {
            key,
            id,
          },
        ],
        {
          BLOCK: 500,
          COUNT: 1,
        }
      );
    } else {
      return Promise.reject('Redis client is closed');
    }
  }
}
