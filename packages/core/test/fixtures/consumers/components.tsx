// @ts-ignore R0 target entrypoint is implemented in a later packet.
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
  // @ts-ignore R0 target entrypoint is implemented in a later packet.
} from "@emi/core/components";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
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
