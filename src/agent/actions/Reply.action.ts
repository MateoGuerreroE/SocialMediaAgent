import { ConsoleLogger, Injectable } from '@nestjs/common';
import { CredentialType, Platform, PlatformChannel } from 'src/generated/prisma/enums';
import { WhatsappService } from 'src/ingress/Whatsapp.service';
import { ClientCredentialEntity } from 'src/types/entities';
import { ConflictError } from 'src/types/errors';

@Injectable()
export class ReplyAction {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly whatsappService: WhatsappService,
  ) {}
  // This should be a simple action that takes the message and sends it to the appropriate channel & platform
  // Should receive the already generated message from the LLM, and just handle the sending part
  // This to keep It agnostic, therefore reusable across all agents, and not just the social media one
  async execute({
    message,
    platform,
    channel,
    target,
    credential,
  }: {
    message: string;
    platform: Platform;
    target: string;
    channel: PlatformChannel;
    credential: ClientCredentialEntity;
  }) {}

  async replyMetaDM({
    credential,
    message,
    platform,
    target,
  }: {
    message: string;
    platform: Platform;
    target: string;
    credential: ClientCredentialEntity;
  }): Promise<void> {
    if (platform === Platform.INSTAGRAM && credential.type !== CredentialType.APP_ACCESS_TOKEN) {
      throw new ConflictError('Invalid credential type for replying to meta DM on Instagram');
    } else if (
      platform === Platform.FACEBOOK &&
      credential.type !== CredentialType.PAGE_ACCESS_TOKEN
    ) {
      throw new ConflictError('Invalid credential type for replying to meta DM on Facebook');
    }

    const targetUrl = `https://graph.${platform === Platform.INSTAGRAM ? 'instagram' : 'facebook'}.com/v24.0/${target}/messages`;

    const formData = new URLSearchParams();
    formData.append('recipient', JSON.stringify({ id: target }));
    formData.append('message', JSON.stringify({ text: message }));

    const result = await this.postForm(targetUrl, formData, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${credential.value}`,
    });

    if (result.ok) {
      // TODO - we should also log the messageId and conversationId here for better traceability, but we need to modify the response of the API call to get that information first
      this.logger.log(`Successfully replied to meta DM on ${platform} for target ${target}`);
      return;
    }
    this.logger.error(
      `Failed to reply to meta DM on ${platform} for target ${target}: ${JSON.stringify(result.error)}`,
    );
    return;
  }

  async replyMetaComment({
    credential,
    message,
    platform,
    target,
  }: {
    message: string;
    platform: Platform;
    target: string;
    credential: ClientCredentialEntity;
  }): Promise<string | null> {
    if (credential.type !== CredentialType.PAGE_ACCESS_TOKEN) {
      throw new ConflictError('Invalid credential type for replying to meta comment');
    }

    const targetUrl = `https://graph.facebook.com/v24.0/${target}/${platform === Platform.INSTAGRAM ? 'replies' : 'comments'}`;

    const formData = new URLSearchParams();
    formData.append('message', message);
    formData.append('access_token', credential.value);

    const result = await this.postForm<{ id: string }>(targetUrl, formData, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (result.ok) {
      this.logger.log(`Successfully replied to meta comment on ${platform} for target ${target}`);
      return result.data.id;
    }
    this.logger.error(
      `Failed to reply to meta comment on ${platform} for target ${target}: ${JSON.stringify(result.error)}`,
    );
    return null;
  }

  private async postForm<T = unknown>(
    url: string,
    formData: URLSearchParams,
    headers: Record<string, string>,
  ): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    if (response.ok) {
      return { ok: true, data: await response.json() };
    }

    const error = await this.parseErrorResponse(response);
    return { ok: false, error };
  }

  private async parseErrorResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : e);
      return await response.text();
    }
  }
}
