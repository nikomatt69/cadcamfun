// Service to handle streaming responses with thinking support
import { extendedThinkingService } from "./ai-new/extendedThinkingService";
import { ThinkingStep } from "@/src/types/AITypes";

export interface StreamingMessage {
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  isComplete: boolean;
  thinkingSessionId?: string;
  thinkingSteps?: ThinkingStep[];
}

export interface StreamingOptions {
  onText?: (chunk: string) => void;
  onThinking?: (chunk: string) => void;
  onThinkingSummary?: (thinking: string, duration: number) => void;
  onComplete?: (message: StreamingMessage) => void;
  onError?: (error: Error) => void;
  reasoningEnabled?: boolean;
  conversationId?: string;
  context?: string;
}

export class AIStreamingService {
  private controller: AbortController | null = null;
  private activeThinkingSession: string | null = null;

  async streamMessage(
    messages: any[],
    model: string,
    systemPrompt: string,
    options: StreamingOptions = {}
  ): Promise<StreamingMessage> {
    this.controller = new AbortController();

    try {
      // Initialize extended thinking session if enabled
      let thinkingSessionId: string | null = null;
      if (options.reasoningEnabled && options.conversationId && options.context) {
        thinkingSessionId = extendedThinkingService.startThinkingSession(options.conversationId, options.context);
        this.activeThinkingSession = thinkingSessionId;
      }

      const message: StreamingMessage = {
        content: "",
        thinking: "",
        thinkingDuration: 0,
        isComplete: false,
        thinkingSessionId: thinkingSessionId || undefined,
        thinkingSteps: []
      };

      const response = await fetch("/api/ai/anthropic-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          model,
          system: systemPrompt,
          reasoningEnabled: options.reasoningEnabled ?? true,
          max_tokens: 8000,
          temperature: 0.7
        }),
        signal: this.controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let thinkingBuffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("event:")) {
            const eventType = line.substring(6).trim();
            const nextIndex = lines.indexOf(line) + 1;

            if (nextIndex < lines.length && lines[nextIndex].startsWith("data:")) {
              const dataLine = lines[nextIndex];
              const data = dataLine.substring(5).trim();

              try {
                const parsed = JSON.parse(data);

                switch (eventType) {
                  case "thinking":
                    thinkingBuffer += parsed.chunk;

                    // Add thinking step to extended thinking service
                    if (thinkingSessionId && parsed.chunk) {
                      extendedThinkingService.addThinkingStep(
                        thinkingSessionId,
                        "analysis", // Default phase, could be extracted from parsed.phase if available
                        parsed.chunk,
                        parsed.confidence || 0.8,
                        "Real-time thinking from AI stream",
                        ["streaming", "real-time"]
                      );

                      // Get updated steps for message
                      const session = extendedThinkingService.finalizeThinkingSession(thinkingSessionId);
                      if (session) {
                        message.thinkingSteps = session.steps;
                      }
                    }

                    if (options.onThinking) {
                      options.onThinking(parsed.chunk);
                    }
                    break;

                  case "thinking_summary":
                    message.thinking = parsed.thinking;
                    message.thinkingDuration = parsed.duration;

                    // Finalize thinking session
                    if (thinkingSessionId) {
                      const finalSession = extendedThinkingService.finalizeThinkingSession(
                        thinkingSessionId,
                        parsed.thinking
                      );
                      if (finalSession) {
                        message.thinkingSteps = finalSession.steps;
                      }
                    }

                    if (options.onThinkingSummary) {
                      options.onThinkingSummary(parsed.thinking, parsed.duration);
                    }
                    break;

                  case "text":
                    message.content += parsed.chunk;
                    if (options.onText) {
                      options.onText(parsed.chunk);
                    }
                    break;

                  case "done":
                    message.isComplete = true;
                    if (options.onComplete) {
                      options.onComplete(message);
                    }
                    break;

                  case "error":
                    throw new Error(parsed.message || "Stream error");
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      }

      // If we collected thinking but didn't get a summary, use the buffer
      if (thinkingBuffer && !message.thinking) {
        message.thinking = thinkingBuffer;
      }

      message.isComplete = true;
      return message;
    } catch (error) {
      // Cleanup thinking session on error
      if (this.activeThinkingSession) {
        extendedThinkingService.finalizeThinkingSession(this.activeThinkingSession, "Error occurred during streaming");
        this.activeThinkingSession = null;
      }
      throw error;
    } finally {
      this.controller = null;
    }
  }

  abort(): void {
    if (this.controller) {
      this.controller.abort();
    }

    // Cleanup thinking session on abort
    if (this.activeThinkingSession) {
      extendedThinkingService.finalizeThinkingSession(this.activeThinkingSession, "Streaming aborted by user");
      this.activeThinkingSession = null;
    }
  }
}

export const aiStreamingService = new AIStreamingService();
