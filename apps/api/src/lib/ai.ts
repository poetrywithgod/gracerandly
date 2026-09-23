import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ErrandCategory } from "@gracerandly/shared-types";

const MODEL = "claude-haiku-4-5-20251001"; // fast/cheap — this is a small extraction task, not a reasoning one
const MAX_ITEMS = 30; // backstop against a pathological input producing an absurd item list

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy apps/api/.env.example to apps/api/.env and fill it in " +
        "(get a key from https://console.anthropic.com/settings/keys)."
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

// What we ask the model to hand back — kept intentionally narrow. Pickup,
// drop-off, scheduling, and cost all need either a real address lookup or
// pricing knowledge the model doesn't reliably have, so those stay as
// manual steps in the form; this only pre-fills the part free text is
// actually good for.
const EXTRACT_TOOL_NAME = "extract_errand_details";

const extractTool: Anthropic.Tool = {
  name: EXTRACT_TOOL_NAME,
  description: "Record the structured errand details extracted from the requester's message.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["grocery", "pharmacy", "food", "parcel", "miscellaneous"],
        description: "The single best-fit category for this errand.",
      },
      items: {
        type: "array",
        description: "Each distinct thing to buy or deliver. Omit vague filler, keep real items.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short item name, e.g. 'Bread' or 'Panadol'." },
            quantity: {
              type: "integer",
              minimum: 1,
              description: "How many/much. Default to 1 if the text doesn't say.",
            },
            notes: {
              type: "string",
              description: "Brief clarifying detail for this item only, e.g. 'brown, sliced'. Omit if none.",
            },
          },
          required: ["name", "quantity"],
        },
      },
      instructions: {
        type: "string",
        description:
          "Any handling/delivery instruction that isn't about a specific item — e.g. 'call when you arrive', 'it's urgent'. Omit if there's nothing like this.",
      },
    },
    required: ["category", "items"],
  },
};

const SYSTEM_PROMPT = `You extract structured errand details from a requester's free-form message for Gracerandly, an errand-running app in Nigeria. The message might be informal, be a pasted WhatsApp list, use Nigerian English or Pidgin, or use local abbreviations. Extract every real item; don't invent items that aren't mentioned. Always call ${EXTRACT_TOOL_NAME} exactly once with your best extraction, even if the message is short or informal.`;

const parsedItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().trim().optional(),
});

const parsedResultSchema = z.object({
  category: z.enum(["grocery", "pharmacy", "food", "parcel", "miscellaneous"]),
  items: z.array(parsedItemSchema).min(1),
  instructions: z.string().trim().optional(),
});

export interface ParsedErrandDraft {
  category: ErrandCategory;
  items: { name: string; quantity: number; notes?: string }[];
  instructions?: string;
}

export async function parseErrandFromText(text: string): Promise<ParsedErrandDraft> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [extractTool],
    tool_choice: { type: "tool", name: EXTRACT_TOOL_NAME },
    messages: [{ role: "user", content: text }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Model didn't return a tool_use block for errand extraction");
  }

  // Never trust the model's output as-is, even with a forced tool call —
  // validate and clamp it the same as any other untrusted input.
  const parsed = parsedResultSchema.parse(toolUse.input);
  return {
    category: parsed.category,
    items: parsed.items.slice(0, MAX_ITEMS),
    instructions: parsed.instructions,
  };
}
