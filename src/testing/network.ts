import { jest } from '@jest/globals';

import { MemoryLevel } from 'memory-level';
import * as P from '@polkadot/api';

import { _configToml } from './data.js';

jest.unstable_mockModule('node:fs', () => {
  return {
    default: {
      readFileSync: () => {
        return _configToml;
      }
    },
  };
});

jest.unstable_mockModule('level', async () => {
  return { Level: MemoryLevel };
});

jest.unstable_mockModule('@polkadot/api', () => {
  return {
    __esModule: true,
    ...P,
    WsProvider: jest.fn(() => {
      return {
        hasSubscriptions: jest.fn(() => {
          return true;
        }),
        on: jest.fn(),
        connect: jest.fn(() => Promise.resolve()),
        disconnect: jest.fn(() => Promise.resolve()),
        send: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn()
      };
    }),
    ScProvider: jest.fn(() => {
      return {
        hasSubscriptions: jest.fn(() => {
          return true;
        }),
        on: jest.fn(),
        connect: jest.fn(() => Promise.resolve()),
        disconnect: jest.fn(() => Promise.resolve()),
        send: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn()
      };
    })
  };
});
