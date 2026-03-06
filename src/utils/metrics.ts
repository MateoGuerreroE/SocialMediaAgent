import client from 'prom-client';
import { AgentKey, Platform, PlatformChannel } from 'src/generated/prisma/enums';

export class Metrics {
  static registry = new client.Registry();
  private static _pendingTimers = new Map<
    string,
    (labels?: Partial<Record<'agent_key', string>>) => number
  >();

  private static ingressErrors = new client.Counter({
    name: 'ingress_errors_total',
    labelNames: ['platform', 'channel'],
    help: 'Number of ingress errors',
    registers: [Metrics.registry],
  });
  private static orchestrationErrors = new client.Counter({
    name: 'orchestration_errors_total',
    labelNames: ['platform', 'channel'],
    help: 'Number of orchestration errors',
    registers: [Metrics.registry],
  });
  private static agentExecutionErrors = new client.Counter({
    name: 'agent_execution_errors_total',
    help: 'Number of agent execution errors',
    labelNames: ['agent_key'],
    registers: [Metrics.registry],
  });
  private static successfulAgentExecutions = new client.Counter({
    name: 'successful_agent_executions_total',
    help: 'Number of successful agent executions',
    labelNames: ['agent_key'],
    registers: [Metrics.registry],
  });
  private static totalMessagesReceived = new client.Counter({
    name: 'messages_received_total',
    help: 'Total number of messages received',
    labelNames: ['platform', 'channel'],
    registers: [Metrics.registry],
  });
  private static totalMessagesProcessed = new client.Counter({
    name: 'messages_processed_total',
    help: 'Total number of messages processed',
    labelNames: ['platform', 'channel'],
    registers: [Metrics.registry],
  });
  private static averageProcessingTime = new client.Histogram({
    name: 'agent_processing_duration_seconds',
    help: 'End-to-end duration from orchestration window open to agent handler finally block',
    labelNames: ['agent_key', 'platform', 'channel'],
    buckets: [5, 10, 15, 20, 30, 45, 60, 90, 120],
    registers: [Metrics.registry],
  });

  static startProcessingTimer(
    conversationId: string,
    labels: { agent_key: string; platform: string; channel: string },
  ) {
    const end = Metrics.averageProcessingTime.startTimer(labels);
    Metrics._pendingTimers.set(conversationId, end);
  }

  static endProcessingTimer(conversationId: string) {
    const end = Metrics._pendingTimers.get(conversationId);
    if (end) {
      end();
      Metrics._pendingTimers.delete(conversationId);
    }
  }

  static recordIngressError(platform: Platform, channel: PlatformChannel) {
    Metrics.ingressErrors.inc({ platform, channel });
  }

  static recordOrchestrationError(platform: Platform, channel: PlatformChannel) {
    Metrics.orchestrationErrors.inc({ platform, channel });
  }

  static recordAgentExecutionError(agentKey: AgentKey) {
    Metrics.agentExecutionErrors.inc({ agent_key: agentKey });
  }

  static recordSuccessfulAgentExecution(agentKey: AgentKey) {
    Metrics.successfulAgentExecutions.inc({ agent_key: agentKey });
  }

  static recordMessageReceived(platform: Platform, channel: PlatformChannel) {
    Metrics.totalMessagesReceived.inc({ platform, channel });
  }

  static recordMessageProcessed(platform: Platform, channel: PlatformChannel) {
    Metrics.totalMessagesProcessed.inc({ platform, channel });
  }
}
