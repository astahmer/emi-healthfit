import { WebMcp } from "@emi/core/web";

const modelContext = WebMcp.detect(document);
const maybeModelContext = WebMcp.detect({});

void modelContext;
void maybeModelContext;
