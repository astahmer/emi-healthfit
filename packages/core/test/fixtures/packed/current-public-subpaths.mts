import * as root from "@emi/core";
import * as api from "@emi/core/api";
import * as cloudflare from "@emi/core/adapters/cloudflare";
import * as aiSdk from "@emi/core/adapters/ai-sdk";
import * as advancedXState from "@emi/core/advanced/xstate";
import * as components from "@emi/core/components";
import * as extensions from "@emi/core/extensions";
import * as protocol from "@emi/core/protocol";
import * as react from "@emi/core/react";
import * as runtime from "@emi/core/runtime";
import * as server from "@emi/core/server";
import * as serverDatabase from "@emi/core/server/database";
import * as styled from "@emi/core/components/styled";
import * as serverEffect from "@emi/core/server/effect";
import * as serverFetch from "@emi/core/server/fetch";
import * as testing from "@emi/core/testing";

const currentPublicModules = [
  root,
  api,
  cloudflare,
  aiSdk,
  advancedXState,
  components,
  extensions,
  protocol,
  react,
  runtime,
  server,
  serverDatabase,
  styled,
  serverEffect,
  serverFetch,
  testing,
];

if (currentPublicModules.some((module) => Object.keys(module).length === 0)) {
  throw new Error("A current public @emi/core subpath exported no symbols.");
}
