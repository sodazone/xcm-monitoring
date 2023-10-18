import type { } from '@polkadot/api-augment';

import { mergeMap, map, Observable } from 'rxjs';

import type { SignedBlockExtended } from '@polkadot/api-derive/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { ApiPromise } from '@polkadot/api';

import {
  ControlQuery,
  extractEventsWithTx, extractTxWithEvents, filterNonNull,
  flattenBatch, mongoFilter, types
} from '@sodazone/ocelloids';

import {
  GenericXcmMessageReceivedWithContext,
  GenericXcmMessageSentWithContext,
  GetOutboundUmpMessages,
  HexString,
  XcmCriteria, XcmMessageReceivedWithContext,
  XcmMessageSentWithContext
} from '../types.js';

type EventRecordWithContext = {
  record: EventRecord,
  method: string,
  section: string,
  blockNumber: string,
  blockHash: HexString
}

function mapUmpQueueMessage() {
  return (source: Observable<EventRecordWithContext>):
    Observable<XcmMessageReceivedWithContext>  => {
    return (source.pipe(
      mongoFilter({
        'section': 'messageQueue',
        'method': 'Processed'
      }),
      map(({ record: { event }, blockHash, blockNumber }) => {
        const xcmMessage = event.data as any;
        if (xcmMessage.success.toPrimitive()) {
          return new GenericXcmMessageReceivedWithContext({
            event: event.toHuman(),
            blockHash,
            blockNumber,
            messageHash: xcmMessage.id.toHex(),
            outcome: 'Success',
            error: null
          });
        } else {
          return new GenericXcmMessageReceivedWithContext({
            event: event.toHuman(),
            blockHash,
            blockNumber,
            messageHash: xcmMessage.id.toHex(),
            outcome: 'Fail',
            error: null
          });
        }
      })
    )
    );
  };
}

function umpMessagesSent() {
  return (source: Observable<types.EventWithIdAndTx>)
        : Observable<XcmMessageSentWithContext> => {
    return (source.pipe(
      map(event => {
        const xcmMessage = event.data as any;
        return {
          event: event.toHuman(),
          blockHash: event.blockHash.toHex(),
          blockNumber: event.blockNumber.toString(),
          extrinsicId: event.extrinsicId,
          messageHash: xcmMessage.messageHash.toHex()
        } as XcmMessageSentWithContext;
      })
    ));
  };
}

function findOutboundUmpMessage(
  api: ApiPromise,
  messageControl: ControlQuery,
  getOutboundUmpMessages: GetOutboundUmpMessages
) {
  return (source: Observable<XcmMessageSentWithContext>)
  : Observable<GenericXcmMessageSentWithContext> => {
    return source.pipe(
      mergeMap(sentMsg => {
        const { blockHash, messageHash } = sentMsg;
        return getOutboundUmpMessages(blockHash).pipe(
          map(messages =>  {
            return messages
              .map(data => {
                const xcmProgram = api.registry.createType(
                  'XcmVersionedXcm', data
                );
                return new GenericXcmMessageSentWithContext({
                  ...sentMsg,
                  messageData: data,
                  recipient: 0, // always relay
                  messageHash: xcmProgram.hash.toHex(),
                  instructions: xcmProgram.toHuman()
                });
              }).find(msg => {
                return msg.messageHash === messageHash;
              });
          }),
          filterNonNull(),
          map(p => {
            // XXX HACK
            // To keep consistency until message ids using topic instructions are
            // standarised, we just override the message hash, as a workaround when
            // the instruction is present.
            const instructions : any = p.instructions;
            const setTopic = (instructions['V3'] as any[]).find((i: any) => i['SetTopic'] !== undefined);
            const hashPatch =  setTopic ? setTopic['SetTopic'] as HexString : p.messageHash;
            return {
              ...p,
              messageHash: hashPatch
            } as GenericXcmMessageSentWithContext;
          }),
          mongoFilter(messageControl)
        );
      }));
  };
}

export function extractUmpSend(
  api: ApiPromise,
  {
    sendersControl,
    messageControl
  }: XcmCriteria,
  getOutboundUmpMessages: GetOutboundUmpMessages
) {
  return (source: Observable<SignedBlockExtended>)
      : Observable<XcmMessageSentWithContext> => {
    return source.pipe(
      extractTxWithEvents(),
      flattenBatch(),
      mongoFilter(sendersControl),
      extractEventsWithTx(),
      mongoFilter({
        'section': 'parachainSystem',
        'method': 'UpwardMessageSent'
      }),
      umpMessagesSent(),
      findOutboundUmpMessage(api, messageControl, getOutboundUmpMessages)
    );
  };
}

export function extractUmpReceive() {
  return (source: Observable<SignedBlockExtended>)
    : Observable<XcmMessageReceivedWithContext>  => {
    return (source.pipe(
      mergeMap(({ block: { header }, events}) =>
        events.map(record => ({
          record,
          method: record.event.method,
          section: record.event.section,
          blockNumber: header.number.toString(),
          blockHash: header.hash.toHex()
        } as EventRecordWithContext)
        )),
      mapUmpQueueMessage()
    ));
  };
}
