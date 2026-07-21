export interface ConversationMessagePart {
  readonly type: string;
  readonly text?: string;
}

export interface ConversationMessageNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly role: string;
  readonly parts: readonly ConversationMessagePart[];
}

export interface ConversationThreadView {
  readonly anchorMessageId: string;
  readonly messageIds: readonly string[];
}
