// src/pages/api/ai/code-interpreter/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

interface CodeInterpreterRequest {
  action: "execute" | "create_container" | "list_containers" | "delete_container";
  model?: string;
  containerId?: string;
  instructions?: string;
  code?: string;
  timeout?: number;
  name?: string;
}

// New type for the payload passed to handlers, omitting 'action'
type CodeInterpreterPayload = Omit<CodeInterpreterRequest, "action">;

interface CodeInterpreterResponse {
  success: boolean;
  output?: string;
  error?: string;
  execution_time?: number;
  memory_usage?: number;
  generated_files?: any[];
  visualizations?: any[];
  data_analysis?: any;
  container_id?: string;
  containers?: any[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CodeInterpreterResponse | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  const openai = new OpenAI({ apiKey });
  try {
    const { action, ...payload }: CodeInterpreterRequest = req.body;

    // Validate API key

    switch (action) {
      case "execute":
        return await handleCodeExecution(payload, openai, res);
      case "create_container":
        return await handleContainerCreation(payload, openai, res);
      case "list_containers":
        return await handleListContainers(openai, res);
      case "delete_container":
        return await handleDeleteContainer(payload, openai, res);
      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error) {
    console.error("Code Interpreter API error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

async function handleCodeExecution(
  payload: CodeInterpreterPayload,
  openai: OpenAI,
  res: NextApiResponse<CodeInterpreterResponse | { error: string }>
) {
  const {
    model = "gpt-4.1",
    containerId,
    instructions = "Execute the provided Python code",
    code,
    timeout = 300000 // 5 minutes default
  } = payload;

  if (!code && !instructions.includes("python")) {
    return res.status(400).json({ error: "Code or Python instructions required" });
  }

  try {
    const startTime = Date.now();

    // Determine container strategy
    let containerConfig: any;
    if (containerId) {
      containerConfig = containerId;
    } else {
      containerConfig = { type: "auto" };
    }

    // Create the messages for code execution
    const messages: any[] = [
      {
        role: "user",
        content: code ? `Execute this Python code:\n\n\`\`\`python\n${code}\n\`\`\`` : instructions
      }
    ];

    // Create assistant with code interpreter
    const assistant = await openai.beta.assistants.create({
      model,
      tools: [{ type: "code_interpreter" }],
      instructions: "You are a Python code execution assistant. Execute code and provide clear results."
    });

    // Create thread
    const thread = await openai.beta.threads.create();

    // Add message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: messages[0].content
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });

    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status === "in_progress" || runStatus.status === "queued") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // Get messages
    const messages_response = await openai.beta.threads.messages.list(thread.id);
    const response = messages_response.data[0];

    const executionTime = Date.now() - startTime;

    // Extract output from assistant response
    let output = "";
    let generatedFiles: any[] = [];

    if (response.content && Array.isArray(response.content)) {
      for (const content of response.content) {
        if (content.type === "text") {
          output += content.text.value;
        }
      }
    }

    // Check for file annotations in the response
    if (response.content) {
      for (const content of response.content) {
        if (content.type === "text" && content.text.annotations) {
          for (const annotation of content.text.annotations) {
            if (annotation.type === "file_path" && annotation.file_path) {
              generatedFiles.push({
                id: annotation.file_path.file_id,
                filename: `output_${Date.now()}.png`,
                contentType: "image/png",
                size: 0,
                createdAt: new Date().toISOString(),
                downloadUrl: `/api/ai/code-interpreter/files/${annotation.file_path.file_id}`
              });
            }
          }
        }
      }
    }

    // Clean up
    try {
      await openai.beta.assistants.del(assistant.id);
    } catch (error) {
      console.warn("Failed to cleanup assistant:", error);
    }

    const result: CodeInterpreterResponse = {
      success: true,
      output,
      execution_time: executionTime,
      generated_files: generatedFiles,
      visualizations: generatedFiles.filter(f => f.contentType.startsWith("image/")),
      container_id: thread.id
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("Code execution error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Code execution failed"
    });
  }
}

async function handleContainerCreation(
  payload: CodeInterpreterPayload,
  openai: OpenAI,
  res: NextApiResponse<CodeInterpreterResponse | { error: string }>
) {
  const { name } = payload;

  try {
    // Create thread (equivalent to container in new API)
    const thread = await openai.beta.threads.create({
      metadata: {
        name: name || `container_${Date.now()}`,
        created_at: new Date().toISOString()
      }
    });

    return res.status(200).json({
      success: true,
      container_id: thread.id
    });
  } catch (error) {
    console.error("Container creation error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Container creation failed"
    });
  }
}

async function handleListContainers(openai: OpenAI, res: NextApiResponse<CodeInterpreterResponse | { error: string }>) {
  try {
    // List threads (equivalent to containers)
    // Note: OpenAI doesn't provide a direct way to list all threads
    // This is a limitation of the current API
    return res.status(200).json({
      success: true,
      containers: [] // Empty array as we can't list all threads
    });
  } catch (error) {
    console.error("List containers error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list containers"
    });
  }
}

async function handleDeleteContainer(
  payload: CodeInterpreterPayload,
  openai: OpenAI,
  res: NextApiResponse<CodeInterpreterResponse | { error: string }>
) {
  const { containerId } = payload;

  if (!containerId) {
    return res.status(400).json({ error: "Container ID required" });
  }

  try {
    // Delete thread (equivalent to container)
    await openai.beta.threads.del(containerId);

    return res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error("Container deletion error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Container deletion failed"
    });
  }
}
