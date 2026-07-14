import { useActor } from "@xstate/react";
import { useEffect } from "react";
import { conversationMachine } from "./conversation-machine";

export const useConversationMachine = (conversationId: string | undefined, isTemporary = false) => {
  const [state, send] = useActor(conversationMachine, {
    input: { isTemporary },
  });

  useEffect(() => {
    send({ type: "conversationId.changed", conversationId });
  }, [conversationId, send]);

  return { state, send };
};
