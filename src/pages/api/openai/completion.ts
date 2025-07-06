// src/pages/api/openai/completion.ts
import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

// OpenAI API endpoint
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get the API key from environment variable
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OpenAI API key is missing");
    return res.status(500).json({ error: "OpenAI API key is missing" });
  }

  try {
    const {
      model = "gpt-4o-mini",
      messages,
      temperature = 0.7,
      max_tokens = 1000,
      presence_penalty = 0,
      frequency_penalty = 0,
      response_format
    } = req.body;

    // Basic validation
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required and must be an array" });
    }

    // Make the request to OpenAI API
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model,
        messages,
        temperature,
        max_tokens,
        presence_penalty,
        frequency_penalty,
        ...(response_format && { response_format })
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        }
      }
    );

    // Extract the completion text
    const content = response.data.choices[0].message.content;

    // If response_format is json_object, parse the JSON
    if (response_format?.type === "json_object") {
      try {
        const json = JSON.parse(content);
        return res.status(200).json({ content, json });
      } catch (e) {
        console.error("Error parsing JSON response:", e);
        return res.status(200).json({ content, json: null });
      }
    }

    // Check if content is GCode (for generateGCode endpoint)
    if (req.body.isGcode) {
      return res.status(200).json({ gcode: content });
    }

    // Return the completion
    return res.status(200).json({ content });
  } catch (error: any) {
    console.error("Error communicating with OpenAI API:", error);

    // Handle OpenAI API errors
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error?.message || "Error from OpenAI API"
      });
    }

    return res.status(500).json({ error: "Failed to communicate with OpenAI API" });
  }
}
