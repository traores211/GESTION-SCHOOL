import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssistantChatDto {
  @IsIn(['chatbot', 'agent'])
  mode!: 'chatbot' | 'agent';

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conversationId?: string;
}
