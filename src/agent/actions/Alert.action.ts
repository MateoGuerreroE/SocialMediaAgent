import { Injectable } from '@nestjs/common';

@Injectable()
export class AlertAction {
  // This should be an alert action that sends an alert to the configured channel (email, slack, sms, etc.) with the provided message and severity level
  // This can be continued to have also a reply, but this is in charge of client-level alerts (internally)
  // Examples on this can be to receive an alert when someone provided a certain word but continue normal conversation,
  // Or to receive an alert for an action that was done before completion (e.g. Alert when CRM integration is done or booking was completed)
  async execute() {}
}
