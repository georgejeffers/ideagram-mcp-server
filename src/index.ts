#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { IdeogramClient, IdeogramGenerateParams } from "./ideogram-client.js";

const apiKey = process.env.IDEOGRAM_API_KEY;
if (!apiKey) {
  throw new Error("IDEOGRAM_API_KEY environment variable is required");
}

const ideogramClient = new IdeogramClient(apiKey);

const server = new Server(
  {
    name: "ideagram-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "Generate an image using Ideogram AI",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to use for generating the image"
            },
            aspect_ratio: {
              type: "string",
              description: "The aspect ratio for the generated image",
              enum: ["ASPECT_1_1", "ASPECT_4_3", "ASPECT_3_4", "ASPECT_16_9", "ASPECT_9_16"]
            },
            model: {
              type: "string",
              description: "The model to use for generation",
              enum: ["V_1", "V_1_TURBO", "V_2", "V_2_TURBO"]
            },
            magic_prompt_option: {
              type: "string",
              description: "Whether to use magic prompt",
              enum: ["AUTO", "ON", "OFF"]
            },
            style_type: {
              type: "string",
              description: "The style type for generation"
            },
            negative_prompt: {
              type: "string",
              description: "Description of what to exclude from the image"
            },
            num_images: {
              type: "number",
              description: "Number of images to generate (1-8)",
              minimum: 1,
              maximum: 8
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "generate_image": {
      const args = request.params.arguments;
      if (!args || typeof args.prompt !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Prompt is required and must be a string"
        );
      }

      try {
        const params: IdeogramGenerateParams = {
          prompt: args.prompt,
          aspect_ratio: typeof args.aspect_ratio === "string" ? args.aspect_ratio : undefined,
          model: typeof args.model === "string" && ["V_1", "V_1_TURBO", "V_2", "V_2_TURBO"].includes(args.model) 
            ? args.model as IdeogramGenerateParams["model"]
            : undefined,
          magic_prompt_option: typeof args.magic_prompt_option === "string" && ["AUTO", "ON", "OFF"].includes(args.magic_prompt_option)
            ? args.magic_prompt_option as IdeogramGenerateParams["magic_prompt_option"]
            : undefined,
          style_type: typeof args.style_type === "string" ? args.style_type : undefined,
          negative_prompt: typeof args.negative_prompt === "string" ? args.negative_prompt : undefined,
          num_images: typeof args.num_images === "number" ? args.num_images : undefined,
        };

        const response = await ideogramClient.generateImage(params);

        return {
          content: [
            {
              type: "text",
              text: `Generated ${response.data.length} image(s):\n${response.data
                .map((img) => img.url)
                .join("\n")}`
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, "Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ideogram MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
