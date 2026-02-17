import { Injectable } from '@nestjs/common';

@Injectable()
export class EscalateAction {
  // This should be a simple action that also generates an alert but pauses conversation and notifies a human agent to take over. Similar to the alert
  // But this is more for "stopping" the agent rather than just sending an alert.
  // Intended to be used for ending situations -> Can't be handled anymore by the agent
  async execute() {}
}
