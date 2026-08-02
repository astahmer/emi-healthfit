import * as chat from "@emi/core/chat";
import * as cloudflare from "@emi/core/cloudflare";
import * as contract from "@emi/core/contract";
import * as discord from "@emi/core/discord";
import * as server from "@emi/core/server";
import * as styled from "@emi/core/web/styled";
import * as web from "@emi/core/web";

const currentPublicModules = [chat, cloudflare, contract, discord, server, styled, web];

if (currentPublicModules.some((module) => Object.keys(module).length === 0)) {
  throw new Error("A current public @emi/core subpath exported no symbols.");
}
