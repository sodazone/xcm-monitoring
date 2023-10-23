import { Logger, Services } from '../../types.js';
import { QuerySubscription, XcmMessageNotify } from '../types.js';
import { LogNotifier } from './log.js';
import { Notifier } from './types.js';
import { WebhookNotifier } from './webhook.js';

export class NotifierHub {
  #log: Logger;
  #notifiers: {
    [property: string]: Notifier
  };

  constructor(services: Services) {
    this.#log = services.log;
    this.#notifiers = {
      log: new LogNotifier(services),
      webhook: new WebhookNotifier(services)
    };
  }

  notify(sub: QuerySubscription, msg: XcmMessageNotify) {
    try {
      this.#notifiers[sub.notify.type].notify(sub, msg);
    } catch (error) {
      this.#log.error(error);
    }
  }
}
