import {
  Composer,
  ConnectedComposer,
  ConnectedSidebar,
  ConnectedThread,
  ConversationList,
  Dialog,
  Message,
  MessagePart,
  Sidebar,
  ThreadViewport,
} from "@emi/core/components";
import type { ChatMessage } from "@emi/core/protocol";

declare const message: ChatMessage;
const primitives = (
  <Sidebar>
    <Dialog open={true} onOpenChange={() => {}}>
      <ConversationList conversations={[]} onSelect={() => {}} />
      <ThreadViewport messages={[message]}>
        <Message message={message} />
        <MessagePart part={message.parts[0]!} />
        <Composer value="" onChange={() => {}} onSubmit={() => {}} />
      </ThreadViewport>
    </Dialog>
    <ConnectedSidebar />
    <ConnectedThread />
    <ConnectedComposer />
  </Sidebar>
);

void primitives;
