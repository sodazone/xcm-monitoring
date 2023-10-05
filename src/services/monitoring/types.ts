import type { AnyJson } from '@polkadot/types-codec/types';
import type { Bytes } from '@polkadot/types';

import { types, Criteria, ControlQuery } from '@sodazone/ocelloids';

export type XcmCriteria = {
  sendersControl: ControlQuery,
  messageCriteria: Criteria
}

export type XcmMessageSentWithContext = {
  event: types.EventWithIdAndTx,
  messageHash: string,
}

export interface XcmMessageWithContext extends XcmMessageSentWithContext {
  messageData: Bytes,
  recipient: number,
  instructions: AnyJson,
}

export type XcmMessageEvent = XcmMessageWithContext & {
  chainId: string | number
}

export class GenericXcmMessageWithContext implements XcmMessageWithContext {
  messageData: Bytes;
  recipient: number;
  instructions: AnyJson;
  messageHash: string;
  event: types.EventWithIdAndTx;

  constructor(msg: XcmMessageWithContext) {
    this.event = msg.event;
    this.messageData = msg.messageData;
    this.recipient = msg.recipient;
    this.instructions = msg.instructions;
    this.messageHash = msg.messageHash;
  }

  toHuman(_isExpanded?: boolean | undefined): Record<string, AnyJson> {
    return {
      messageData: this.messageData.toHex(),
      recipient: this.recipient,
      instructions: this.instructions,
      messageHash: this.messageHash,
      event: this.event.toHuman()
    };
  }
}