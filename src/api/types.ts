// The one place the app touches @anthropic-ai/sdk. The SDK is a devDependency used for its types
// only: every import below is `import type`, which erases at build time, so no SDK code ships to the
// browser. Request bodies are sent with plain fetch (see CLAUDE.md, "Stack").
export type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  StopReason,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
  Usage,
} from "@anthropic-ai/sdk/resources/messages";
export type { ErrorResponse, ErrorType } from "@anthropic-ai/sdk/resources/shared";
