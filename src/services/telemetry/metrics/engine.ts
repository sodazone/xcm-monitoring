import { Counter } from 'prom-client';

import {
  TelementryEngineEvents as events, TelemetryObserver
} from '../../types.js';
import { XcmReceived, XcmSent } from '../../monitoring/types.js';

export function engineMetrics(
  { source }: TelemetryObserver
) {
  const inCount = new Counter({
    name: 'xcmon_engine_in_total',
    help: 'Matching engine inbound messages.',
    labelNames: ['subscription', 'origin', 'outcome']
  });
  const outCount = new Counter({
    name: 'xcmon_engine_out_total',
    help: 'Matching engine outbound messages.',
    labelNames: ['subscription', 'origin', 'destination']
  });
  const matchCount = new Counter({
    name: 'xcmon_engine_matched_total',
    help: 'Matching engine matched messages.',
    labelNames: ['subscription', 'origin', 'destination', 'outcome']
  });

  source.on(events.Inbound,
    (message: XcmReceived) => {
      inCount.labels(
        message.subscriptionId,
        message.chainId,
        message.outcome.toString()
      ).inc();
    });

  source.on(events.Outbound,
    (message: XcmSent) => {
      outCount.labels(
        message.subscriptionId,
        message.chainId,
        message.recipient
      ).inc();
    });

  source.on(events.Matched,
    (inMsg: XcmReceived, outMsg: XcmSent) => {
      matchCount.labels(
        outMsg.subscriptionId,
        outMsg.chainId,
        outMsg.recipient,
        inMsg.outcome.toString()
      ).inc();
    });
}