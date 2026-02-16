import { Module } from '@nestjs/common';
import { DataModule } from '../data/Data.module';
import { ConversationService } from './Conversation.service';
import { MessageWindowService } from './MessageWindow.service';

@Module({
  imports: [DataModule],
  providers: [ConversationService, MessageWindowService],
  exports: [ConversationService, MessageWindowService],
})
export class MessagingModule {}
