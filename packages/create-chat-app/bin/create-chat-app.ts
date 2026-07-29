#!/usr/bin/env -S node --experimental-strip-types
import { run } from "../src/cli.ts";

await run(process.argv.slice(2));
