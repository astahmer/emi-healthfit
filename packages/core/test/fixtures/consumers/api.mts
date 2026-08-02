// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createCoreApiClient } from "@emi/core/api";

const client = createCoreApiClient({ baseUrl: "/api", fetch });
const conversations = client.conversations.list();

void conversations;
