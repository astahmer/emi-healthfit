import { decodeDynamicComponent, DynamicComponentRenderer, WebMcp } from "@emi/core/web";
import type { ComponentRendererContribution } from "@emi/core/web";

const modelContext = WebMcp.detect(document);
const maybeModelContext = WebMcp.detect({});

void modelContext;
void maybeModelContext;
void decodeDynamicComponent;
void DynamicComponentRenderer;
declare const contribution: ComponentRendererContribution;
void contribution;
