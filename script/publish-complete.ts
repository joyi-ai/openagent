#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import { $ } from "bun"

if (!Script.preview) {
  await $`gh release edit v${Script.version} --draft=false`
}

// Desktop-only release - no CLI archives to download
console.log("Release published successfully")
