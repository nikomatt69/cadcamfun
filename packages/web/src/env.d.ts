/// <reference types="astro/client" />

/** Domino ships its types under the pre-fork `domino` module name. */
declare module "@mixmark-io/domino" {
  const domino: {
    createDocument(html?: string, force?: boolean): Document
    createWindow(html?: string, address?: string): Window
  }
  export default domino
}

declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown"
  export const gfm: TurndownService.Plugin
}

/** The slice of a KV namespace the docs assistant uses for its rate limit. */
type DocsKVNamespace = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface CloudflareEnv {
  /**
   * Workers AI, used by the docs assistant (/api/docs-assistant). Typed loosely
   * on purpose: the model id is configurable at runtime.
   */
  AI?: {
    run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
  }
  /** Workers AI model for the docs assistant. Defaults to a free-tier model. */
  DOCS_ASSISTANT_MODEL?: string
  /** Stronger free-tier model used when the question asks for a guide. */
  DOCS_ASSISTANT_ARTIFACT_MODEL?: string
  /** Per-IP hourly question cap for the docs assistant. Defaults to 20. */
  DOCS_ASSISTANT_RATE_LIMIT?: string
  /** Optional KV namespace holding the per-IP rate-limit counters. */
  SESSIONS?: DocsKVNamespace
  /** Optional R2 bucket for guides the assistant publishes (/artifact/:id). */
  ARTIFACTS?: import("./lib/artifact").ArtifactBucket
  /** Canonical origin for guide share links, so preview deployments link home. */
  ARTIFACT_PUBLIC_ORIGIN?: string
  /**
   * Optional nikcli server backing the docs assistant. With both the URL and a
   * token set, questions run as a real nikcli session instead of a one-shot
   * Workers AI call.
   */
  CADCAMFUN_DOCS_SERVER?: string
  CADCAMFUN_DOCS_TOKEN?: string
  CADCAMFUN_DOCS_AGENT?: string
  CADCAMFUN_DOCS_DIRECTORY?: string
  /** Static assets of this deployment; prerendered docs pages are read from here. */
  ASSETS?: {
    fetch(input: Request | string, init?: { headers?: Record<string, string> }): Promise<Response>
  }
}

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv
    }
  }
}
