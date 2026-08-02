import { Chat } from "@emi/core/chat";

const budget = Chat.operations.createChatOperationBudget();

void Chat.schemas.chatStreamRequest;
void Chat.settings.defaultGenericChatSettings;
void Chat.prompts.defaultConversationTitlePrompt;
void Chat.stream.createChatStream;
void Chat.tools.createToolCircuitBreaker;
void Chat.memory.generateMemorySummary;
void Chat.generation.generateSuggestions;
void Chat.messages.buildAssistantParts;
void Chat.orphans.getOrphanUserMessageId;
void Chat.attachments.validateChatAttachments;
void budget;
