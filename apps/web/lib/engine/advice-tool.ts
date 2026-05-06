import { buildTool } from '@t2000/engine';
import { z } from 'zod';

const AdviceItemSchema = z.object({
  adviceType: z.enum([
    'save',
    'repay',
    'borrow',
    'swap',
    'goal',
    'rate',
    'general',
  ]),
  adviceText: z.string().max(500),
  targetAmount: z.number().optional(),
  followUpDays: z.number().int().min(1).max(30).optional(),
});

const InputSchema = z.object({
  advice: z.array(AdviceItemSchema).min(1).max(5),
});

export const recordAdviceTool = buildTool({
  name: 'record_advice',
  description: [
    'Call this tool ONLY when your response contains a financial recommendation',
    'the user could act on — a genuine suggestion to do something with their money.',
    '',
    'DO call: "I\'d suggest saving that $44 idle USDC", "Repay $50 to improve your HF"',
    'DO NOT call: "Your balance is $312", "The APY is 5.0%", "You repaid $50 yesterday"',
    '',
    'Include all distinct pieces of advice from a single turn as separate items.',
  ].join('\n'),
  inputSchema: InputSchema,
  jsonSchema: {
    type: 'object',
    required: ['advice'],
    properties: {
      advice: {
        type: 'array',
        items: {
          type: 'object',
          required: ['adviceType', 'adviceText'],
          properties: {
            adviceType: {
              type: 'string',
              enum: [
                'save',
                'repay',
                'borrow',
                'swap',
                'goal',
                'rate',
                'general',
              ],
            },
            adviceText: { type: 'string', maxLength: 500 },
            targetAmount: { type: 'number' },
            followUpDays: { type: 'integer', minimum: 1, maximum: 30 },
          },
        },
      },
    },
  },
  isReadOnly: true,
  call: async (input) => {
    return {
      data: { recorded: input.advice.length, advice: input.advice },
      displayText: `Recorded ${input.advice.length} advice item(s).`,
    };
  },
});

export const ADVICE_TOOLS = [recordAdviceTool];
