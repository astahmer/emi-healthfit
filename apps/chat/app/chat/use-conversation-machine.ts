import { useActor } from "@xstate/react";
import { useEffect } from "react";
import { conversationMachine, type ConversationMachineInput } from "./conversation-machine";

export const useConversationMachine = (
  conversationId: string | undefined,
  isTemporary = false,
  callbacks: Pick<
    ConversationMachineInput,
    "onBranchCreated" | "onCompactionCompleted" | "onCompactionFailed"
  > = {},
) => {
  const [state, send] = useActor(conversationMachine, {
    input: { conversationId, isTemporary, ...callbacks },
  });

  useEffect(() => {
    send({ type: "conversationId.changed", conversationId });
  }, [conversationId, send]);

  return { state, send };
};
