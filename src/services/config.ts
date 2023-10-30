import fs from 'node:fs';

import z from 'zod';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import toml from 'toml';

import { ServerOptions } from '../types.js';

const $RpcProvider = z.object({
  type: z.literal('rpc'),
  url: z.string().min(1)
});

const $SmoldotProvider = z.object({
  type: z.literal('smoldot'),
  spec: z.string().min(1)
});

const $NetworkProvider = z.discriminatedUnion('type', [
  $RpcProvider, $SmoldotProvider
]);

const $NetworkConfiguration = z.object({
  name: z.string({
    required_error: 'Network name is required'
  }).min(1),
  id: z.number().int(),
  relay: z.string().min(1).optional(),
  provider: $NetworkProvider,
  throttle: z.optional(z.number().int().default(1000))
});

export const $ServiceConfiguration = z.object({
  networks: z.array($NetworkConfiguration).min(1),
});

export type NetworkConfiguration = z.infer<typeof $NetworkConfiguration>;
export type ServiceConfiguration = z.infer<typeof $ServiceConfiguration>;

export function isRelay({networks}: ServiceConfiguration, chainId: number) {
  return networks.findIndex(
    n => n.relay === undefined && n.id === chainId
  ) >= 0;
}

export function isNetworkDefined({networks}: ServiceConfiguration, chainId: number) {
  return networks.findIndex(
    n => n.id === chainId
  ) >= 0;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ServiceConfiguration
  }
}

const configPlugin: FastifyPluginAsync<ServerOptions> = async (fastify, options) => {
  const configPath = options.config;

  fastify.log.info(`Loading configuration from ${configPath}`);

  try {
    const config = $ServiceConfiguration.parse(
      toml.parse(
        fs.readFileSync(configPath, 'utf-8')
      )
    );
    fastify.decorate('config', config);
  } catch (err) {
    /* istanbul ignore next */
    if (err instanceof z.ZodError) {
      fastify.log.error(err.issues);
    } else {
      fastify.log.error(err);
    }
    /* istanbul ignore next */
    throw new Error('Error while loading configuration.');
  }
};

export default fp(configPlugin, { fastify: '>=4.x', name: 'config' });
