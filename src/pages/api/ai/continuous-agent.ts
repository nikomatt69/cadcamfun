import { NextApiRequest, NextApiResponse } from "next";
import { continuousCADAgent } from "@/src/lib/ai/generation/progressiveGeneratorService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case "POST":
        await handlePost(req, res);
        break;
      case "GET":
        await handleGet(req, res);
        break;
      case "DELETE":
        await handleDelete(req, res);
        break;
      default:
        res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Continuous Agent API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.body;

  switch (action) {
    case "start":
      await continuousCADAgent.start();
      return res.json({ success: true, message: "Agent started" });

    case "initialize":
      const { canvasInteraction } = req.body;
      if (canvasInteraction) {
        // Note: In a real implementation, canvas interaction would be handled client-side
        // Here we just acknowledge the initialization
        return res.json({ success: true, message: "Agent initialized" });
      }
      return res.status(400).json({ error: "Canvas interaction methods required" });

    case "addTask":
      const { taskData } = req.body;
      const taskId = continuousCADAgent.addTask(taskData);
      return res.json({ success: true, taskId, message: "Task added to queue" });

    case "generateCAD":
      const { request } = req.body;
      const cadTaskId = await continuousCADAgent.generateProgressively(request);
      return res.json({ success: true, taskId: cadTaskId, message: "CAD generation started" });

    case "executeCADAction":
      const { actionType: cadActionType, payload: cadPayload } = req.body;
      const cadActionTaskId = await continuousCADAgent.executeCADAction(cadActionType, cadPayload);
      return res.json({ success: true, taskId: cadActionTaskId, message: "CAD action queued" });

    case "executeCAMAction":
      const { actionType: camActionType, payload: camPayload } = req.body;
      const camActionTaskId = await continuousCADAgent.executeCAMAction(camActionType, camPayload);
      return res.json({ success: true, taskId: camActionTaskId, message: "CAM action queued" });

    case "generateContextual":
      const { description, existingElements, constraints, options } = req.body;
      const contextualTaskId = await continuousCADAgent.generateContextualComponent(
        description,
        existingElements,
        constraints,
        options
      );
      return res.json({ success: true, taskId: contextualTaskId, message: "Contextual generation started" });

    case "sendMessage":
      const { message, imageDataUrls, activeTool, context } = req.body;
      const messageTaskId = await continuousCADAgent.sendAssistantMessage(message, imageDataUrls, activeTool, context);
      return res.json({ success: true, taskId: messageTaskId, message: "Assistant message queued" });

    case "generateGCode":
      const { description: gcodeDesc, tool, material, machineConfig } = req.body;
      const gcodeTaskId = await continuousCADAgent.generateGCodeFromText(gcodeDesc, tool, material, machineConfig);
      return res.json({ success: true, taskId: gcodeTaskId, message: "G-code generation started" });

    default:
      return res.status(400).json({
        error: "Unknown action",
        availableActions: [
          "start",
          "initialize",
          "addTask",
          "generateCAD",
          "executeCADAction",
          "executeCAMAction",
          "generateContextual",
          "sendMessage",
          "generateGCode"
        ]
      });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { type, taskId } = req.query;

  switch (type) {
    case "state":
      const state = continuousCADAgent.getState();
      return res.json({ success: true, data: state });

    case "task":
      if (!taskId || typeof taskId !== "string") {
        return res.status(400).json({ error: "Task ID required" });
      }
      const task = continuousCADAgent.getTask(taskId);
      return res.json({ success: true, data: task });

    case "stream":
      return handleStreaming(req, res);

    default:
      return res.status(400).json({ error: "Unknown query type", availableTypes: ["state", "task", "stream"] });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.body;

  switch (action) {
    case "stop":
      await continuousCADAgent.stop();
      return res.json({ success: true, message: "Agent stopped" });

    default:
      return res.status(400).json({ error: "Unknown action", availableActions: ["stop"] });
  }
}

async function handleStreaming(req: NextApiRequest, res: NextApiResponse) {
  // Set up Server-Sent Events
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  const closeStream = (reason: string) => {
    console.log(`Closing stream: ${reason}`);
    res.end();
  };

  // Set up heartbeat
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "heartbeat", timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Listen for agent updates
  const unsubscribe = continuousCADAgent.onUpdate(update => {
    try {
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    } catch (error) {
      console.error("Error writing to stream:", error);
      closeStream("Write error");
    }
  });

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    closeStream("Client disconnect");
  });

  req.on("error", error => {
    console.error("Stream request error:", error);
    clearInterval(heartbeat);
    unsubscribe();
    closeStream("Request error");
  });

  // Send initial connection confirmation
  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      message: "Stream connected successfully",
      timestamp: Date.now()
    })}\n\n`
  );
}
