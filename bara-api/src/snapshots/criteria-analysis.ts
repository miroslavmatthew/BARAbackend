import { z } from 'zod';
import { EVIDENCE_POLICY } from './evidence-policy.js';

export interface Criterion {
  key: string; name: string; version: number; prompt: string;
  expectedResult: { jsonSchema: JsonSchema; consistencyRules?: { when: Record<string, unknown>; require: Record<string, unknown> }[] };
}
type JsonSchema = { type: string; enum?: string[]; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean; items?: JsonSchema };

function validator(schema: JsonSchema): z.ZodType {
  if (schema.type === 'string') return schema.enum?.length ? z.enum(schema.enum as [string, ...string[]]) : z.string().min(1);
  if (schema.type === 'array' && schema.items) return z.array(validator(schema.items));
  if (schema.type === 'object' && schema.properties && schema.additionalProperties === false) {
    const fields = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, schema.required?.includes(key) ? validator(value) : validator(value).optional()]));
    return z.strictObject(fields);
  }
  throw new Error('Unsupported criterion schema');
}

const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function render(value: unknown, indent = ''): string {
  if (Array.isArray(value)) return value.length ? value.map((item, i) => `${indent}${i + 1}. ${typeof item === 'object' ? '\n' + render(item, indent + '  ') : String(item)}`).join('\n') : 'none identifiable';
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${indent}${label(key)}: ${typeof item === 'object' ? '\n' + render(item, indent + '  ') : String(item)}`).join('\n');
  return String(value);
}

export async function analyzeCriteria(criteria: Criterion[], image: Buffer, contentType: string) {
  const imageUrl = `data:${contentType};base64,${image.toString('base64')}`;
  return Promise.all(criteria.map(async criterion => {
    const base = { criterionKey: criterion.key, criterionName: criterion.name, criterionVersion: criterion.version };
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('Missing key');
      const validate = validator(criterion.expectedResult.jsonSchema);
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', store: false, max_output_tokens: 1600,
          instructions: criterion.prompt.includes(EVIDENCE_POLICY) ? criterion.prompt : `${criterion.prompt}\n\n${EVIDENCE_POLICY}`,
          input: [{ role: 'user', content: [{ type: 'input_image', image_url: imageUrl, detail: 'high' }] }],
          text: { format: { type: 'json_schema', name: criterion.key, strict: true, schema: criterion.expectedResult.jsonSchema } },
        }),
      });
      if (!response.ok) throw new Error('Request failed');
      const body = await response.json();
      if (body.status !== 'completed') throw new Error('Incomplete response');
      const text = (body.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((part: { type: string }) => part.type === 'output_text').map((part: { text: string }) => part.text).join('');
      const result = validate.parse(JSON.parse(text)) as Record<string, unknown>;
      for (const rule of criterion.expectedResult.consistencyRules ?? []) {
        if (Object.entries(rule.when).every(([key, value]) => result[key] === value) && !Object.entries(rule.require).every(([key, value]) => result[key] === value)) throw new Error('Inconsistent result');
      }
      if (criterion.key === 'fire_suppression') {
        const actors = result.actors as { role: string }[];
        if ((!actors.length && result.classification !== 'UNCERTAIN') || (result.classification === 'NOT_VISIBLE' ? actors.some(a => a.role !== 'NOT_APPLICABLE') : actors.some(a => a.role === 'NOT_APPLICABLE'))) throw new Error('Inconsistent actors');
      }
      if (criterion.key === 'visibly_burning_material') {
        const materials = result.burningMaterials as { category: string }[];
        if (result.classification === 'NO_VISIBLE_BURNING' && materials.length || result.classification === 'IDENTIFIABLE' && !materials.some(m => m.category !== 'UNKNOWN')) throw new Error('Inconsistent materials');
      }
      return { ...base, status: 'completed', result, model: body.model, responseId: body.id, message: `${criterion.name}\n${render(result)}` };
    } catch {
      return { ...base, status: 'unavailable', message: `${criterion.name}\nAnalysis unavailable, invalid, or timed out. No classification was made.` };
    }
  }));
}
