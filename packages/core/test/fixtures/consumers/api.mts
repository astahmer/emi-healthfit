import { CoreApiClient } from "@emi/core/api";

const client = CoreApiClient.create({ baseUrl: "/api", fetch });
const conversations = client.conversations.list();
const promise = CoreApiClient.runPromise(conversations);

void conversations;
void promise;
