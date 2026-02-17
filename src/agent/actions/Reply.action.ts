import { Injectable } from '@nestjs/common';

@Injectable()
export class ReplyAction {
  // This should be a simple action that takes the message and sends it to the appropriate channel & platform
  // Should receive the already generated message from the LLM, and just handle the sending part
  // This to keep It agnostic, therefore reusable across all agents, and not just the social media one
  async execute() {}
}
