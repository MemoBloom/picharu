import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import * as contracts from '../packages/contracts/src/index';
import { getTool, tools, validateToolParameters } from '../packages/tool-config/src/index';
import { createOpenApiDocument } from '../scripts/export-openapi';

const primaryId = 'f28bc034-ea0b-4f98-bfda-cb0d835e68b1';
const referenceId = 'bd0758a1-a29e-4cf7-a006-5f28dd95b9fe';
const edit = {
  tool_id: 'multi_photo_composite',
  inputs: [{ image_id: primaryId, role: 'primary' }, { image_id: referenceId, role: 'subject_reference' }],
  idempotency_key: 'edit-contract-example-001',
};
const candidate = {
  prompt_id: 'pet_watercolor', prompt_version: 1, tool_id: 'pet_illustration', name_ja: 'ペット水彩',
  intent: 'pet watercolor', category: 'pet', suitable_subjects: ['dog', 'cat'],
  visual_requirements: ['visible pet'], negative_conditions: ['heavy occlusion'],
  expected_result: 'watercolor illustration', minimum_input_count: 1, required_input_roles: ['primary'],
};
const jev = {
  contract_version: '1.0.0', request_id: primaryId, catalog_revision: 'catalog-test-1',
  image: { encoding: 'base64', media_type: 'image/jpeg', data: '/9j/2Q==', width: 768, height: 512 },
  candidates: [candidate], top_k: 3,
};
const jevResponse = {
  contract_version: '1.0.0', request_id: primaryId, catalog_revision: 'catalog-test-1',
  model_version: 'test-bundle-1', inference_ms: 125,
  recommendations: [{ prompt_id: candidate.prompt_id, prompt_version: 1, score: -2.75, reason_code: 'SUBJECT_MATCH' }],
};

describe('20 tool contracts', () => {
  it('covers the full agreed catalog with stable, unique IDs', () => {
    const expected = [
      'remove_person', 'remove_object', 'change_background', 'photo_color_grade', 'weather_season',
      'light_time', 'ai_avatar', 'natural_beauty', 'hair_color', 'hairstyle', 'professional_headshot',
      'anime_photo', 'illustration_photo', 'chibi_person', 'pet_illustration', 'pet_humanization',
      'multi_photo_composite', 'product_background', 'room_redesign', 'clothing_recolor',
    ];
    expect(contracts.ToolId.options).toEqual(expected);
    expect(new Set(tools.map(t => t.tool_id)).size).toBe(20);
    expect(tools.map(t => t.tool_id).sort()).toEqual([...expected].sort());
    expect(contracts.ToolId.safeParse('made_up_effect').success).toBe(false);
    expect(getTool('multi_photo_composite').minimum_input_count).toBe(2);
  });

  it('preserves role order and provides normalized defaults', () => {
    const parsed = contracts.EditRequest.parse(edit);
    expect(parsed.inputs).toEqual(edit.inputs);
    expect(parsed.parameters).toEqual({});
    expect(parsed.user_instruction).toBe('');
    expect(parsed.output).toEqual({ quality: 'standard', aspect_ratio: 'preserve' });
  });

  it.each([
    { inputs: [...edit.inputs].reverse() },
    { inputs: [{ image_id: primaryId, role: 'subject_reference' }] },
    { inputs: [{ image_id: primaryId, role: 'primary' }, { image_id: referenceId, role: 'primary' }] },
    { inputs: [{ image_id: primaryId, role: 'primary' }, { image_id: primaryId, role: 'style_reference' }] },
    { inputs: [] },
    { inputs: Array.from({ length: 5 }, () => edit.inputs[0]) },
    { inputs: [{ image_id: primaryId, role: 'arbitrary_provider_role' }] },
  ])('rejects invalid input sets: %j', bad => {
    expect(contracts.EditRequest.safeParse({ ...edit, ...bad }).success).toBe(false);
  });

  it.each([
    { user_id: primaryId }, { provider_model_id: 'user-controlled-model' },
    { parameters: { strength: 1.01 } }, { parameters: { strength: -0.1 } },
    { parameters: { arbitrary_nested: { raw_provider_parameter: true } } },
    { output: { quality: 'ultra', aspect_ratio: 'preserve' } },
    { idempotency_key: 'short' }, { prompt_id: '../../private-prompt' },
  ])('rejects malformed or privileged edit input: %j', bad => {
    expect(contracts.EditRequest.safeParse({ ...edit, ...bad }).success).toBe(false);
  });

  it('validates semantic tool parameter allowlists separately from the shared envelope', () => {
    expect(validateToolParameters('weather_season', { weather: 'snow', season: 'winter' })).toEqual({ weather: 'snow', season: 'winter' });
    expect(() => validateToolParameters('weather_season', { weather: 'typhoon' })).toThrow();
    expect(() => validateToolParameters('hair_color', { arbitrary_provider_parameter: 'anything' })).toThrow();
    expect(() => validateToolParameters('natural_beauty', { strength: 0.75 })).toThrow();
    expect(validateToolParameters('natural_beauty', { strength: 'subtle' })).toEqual({ strength: 'subtle' });
  });
});

describe('recommendation service contract', () => {
  it('pins internal versions, supported JPEG dimensions, and role metadata', () => {
    const parsed = contracts.JevRequest.parse(jev);
    expect(parsed.candidates[0].required_input_roles).toEqual(['primary']);
    expect(contracts.JevRequest.safeParse({ ...jev, contract_version: '2.0.0' }).success).toBe(false);
    expect(contracts.JevRequest.safeParse({ ...jev, image: { ...jev.image, media_type: 'image/png' } }).success).toBe(false);
    expect(contracts.JevRequest.safeParse({ ...jev, image: { ...jev.image, width: 769 } }).success).toBe(false);
    expect(contracts.JevRequest.safeParse({ ...jev, image: { ...jev.image, url: 'http://169.254.169.254/' } }).success).toBe(false);
    expect(contracts.JevRequest.safeParse({ ...jev, candidates: [] }).success).toBe(false);
    expect(contracts.JevRequest.safeParse({ ...jev, top_k: 6 }).success).toBe(false);
  });

  it('permits ranking scores below zero and above one, while rejecting nonfinite values', () => {
    for (const score of [-2.75, 0, 9.25]) {
      expect(contracts.JevResponse.parse({ ...jevResponse, recommendations: [{ ...jevResponse.recommendations[0], score }] }).recommendations[0].score).toBe(score);
    }
    for (const score of [NaN, Infinity, -Infinity]) {
      expect(contracts.JevResponse.safeParse({ ...jevResponse, recommendations: [{ ...jevResponse.recommendations[0], score }] }).success).toBe(false);
    }
    expect(contracts.JevResponse.safeParse({ ...jevResponse, contract_version: '0.9.0' }).success).toBe(false);
    expect(contracts.JevResponse.safeParse({ ...jevResponse, recommendations: [{ ...jevResponse.recommendations[0], reason_code: 'FREE_FORM_GUESSED_REASON' }] }).success).toBe(false);
  });

  it('represents honest fallback with a null score and supports no eligible candidates', () => {
    const fallback = {
      source: 'fallback', recommendations: [{
        prompt_id: candidate.prompt_id, prompt_version: 1, tool_id: candidate.tool_id,
        name_ja: candidate.name_ja, score: null, reason_code: 'POPULAR_FALLBACK',
      }],
    };
    expect(contracts.PublicRecommendation.parse(fallback).recommendations[0].score).toBeNull();
    expect(contracts.PublicRecommendation.parse({ source: 'fallback', recommendations: [] }).recommendations).toEqual([]);
  });
});

describe('typed public outputs and private boundaries', () => {
  it('rejects private prompt/model fields in job views and negative balances', () => {
    const job = {
      job_id: primaryId, tool_id: 'hair_color', status: 'queued', stage: 'queued', inputs: edit.inputs,
      parent_job_id: null, result_image_id: null, credits_reserved: 10, error_code: null,
      created_at: '2026-10-19T00:00:00.000Z', completed_at: null,
    };
    expect(contracts.JobView.parse(job).result_image_id).toBeNull();
    expect(contracts.JobView.safeParse({ ...job, final_prompt: 'private server instruction' }).success).toBe(false);
    expect(contracts.CreditView.safeParse({ available: -1, reserved: 0, status: 'active' }).success).toBe(false);
    expect(contracts.EditAccepted.parse({ job_id: primaryId, status: 'queued', credits_reserved: 10, replayed: true }).replayed).toBe(true);
  });

  it('locks worker execution snapshots to contract and execution versions', () => {
    const snapshot = {
      contract_version: '1.0.0', tool_id: 'hair_color', tool_version: 1,
      prompt_id: 'hair_color_default', prompt_version: 1, final_prompt: 'Fixed server prompt',
      parameters: { color: 'brown' }, output: {}, execution_type: 'commercial_edit', execution_version: 1,
      pricing_version: 'pricing-test', inputs: [edit.inputs[0]],
      model_profile: {
        profile_id: 'test', provider: 'test-provider', model_id: 'exact-model', adapter_version: '1',
        verified_tool_ids: ['hair_color'], max_images: 1, roles: ['primary'], qualities: ['standard'],
        aspect_ratios: ['preserve'], credits_standard: 10, credits_high: 20, pricing_version: 'pricing-test',
      },
    };
    expect(contracts.WorkerSnapshot.parse(snapshot).execution_version).toBe(1);
    expect(contracts.WorkerSnapshot.safeParse({ ...snapshot, contract_version: '2.0.0' }).success).toBe(false);
    expect(contracts.WorkerSnapshot.safeParse({ ...snapshot, execution_version: 2 }).success).toBe(false);
    expect(contracts.WorkerTrigger.safeParse({ contract_version: '1.0.0', job_id: primaryId, final_prompt: 'override' }).success).toBe(false);
  });

  it('keeps download, order and payment outputs typed without secret identifiers', () => {
    const download = { download_url: 'https://assets.example.invalid/signed-download', expires_at: '2026-10-19T01:00:00.000Z' };
    expect(contracts.DownloadResponse.parse(download)).toEqual(download);
    expect(contracts.DownloadResponse.safeParse({ ...download, storage_key: 'private/raw/key' }).success).toBe(false);
    const order = { order_id: primaryId, package_id: referenceId, credits: 100, amount_minor: 1000, currency: 'JPY', status: 'pending', refunded_minor: 0, created_at: '2026-10-19T00:00:00.000Z' };
    expect(contracts.OrderView.parse(order).currency).toBe('JPY');
    expect(contracts.OrderView.safeParse({ ...order, payment_intent_id: 'pi_private' }).success).toBe(false);
    expect(contracts.CreditPackage.safeParse({ package_id: primaryId, credits: 100, amount_minor: 1000, currency: 'USD' }).success).toBe(false);
    expect(contracts.CheckoutResponse.safeParse({ order_id: primaryId, checkout_url: 'not a URL' }).success).toBe(false);
    expect(contracts.DeleteImageResponse.parse({ image_id: primaryId, status: 'deleted', cleanup_pending: true }).cleanup_pending).toBe(true);
  });

  it('makes Worker batch defaults and durable-stage acknowledgements explicit', () => {
    expect(contracts.WorkerDrainRequest.parse({ contract_version: '1.0.0' }).limit).toBe(5);
    expect(contracts.WorkerDrainRequest.safeParse({ contract_version: '1.0.0', limit: 21 }).success).toBe(false);
    const ack = { contract_version: '1.0.0', request_id: primaryId, processed: 0, remaining: true };
    expect(contracts.WorkerAck.parse(ack)).toEqual(ack);
    expect(contracts.WorkerAck.safeParse({ ...ack, processed: 0.5 }).success).toBe(false);
    expect(contracts.WorkerAck.safeParse({ ...ack, processed: 21 }).success).toBe(false);
    expect(contracts.WorkerAck.safeParse({ ...ack, contract_version: '2.0.0' }).success).toBe(false);
  });
});

describe('generated OpenAPI document', () => {
  it('is reproducible and covers every implemented public route', () => {
    const generated = createOpenApiDocument();
    const saved = JSON.parse(readFileSync('docs/interfaces/openapi.json', 'utf8'));
    expect(saved).toEqual(generated);
    expect(generated.openapi).toBe('3.0.3');
    const expected: Record<string, string[]> = {
      '/api/health': ['get'], '/api/tools': ['get'], '/api/me': ['get'],
      '/api/images/upload-url': ['post'], '/api/images/complete': ['post'],
      '/api/images/{id}': ['get', 'delete'], '/api/images/{id}/download': ['get', 'post'],
      '/api/edit': ['post'], '/api/jobs': ['get'], '/api/jobs/{id}': ['get'],
      '/api/jobs/{id}/cancel': ['post'], '/api/recommend': ['post'], '/api/credits': ['get'],
      '/api/credit-packages': ['get'], '/api/checkout': ['post'], '/api/orders': ['get'],
      '/api/stripe/webhook': ['post'],
      '/api/admin/session': ['get'], '/api/analytics/events': ['post'],
    };
    for (const [path, methods] of Object.entries(expected)) {
      for (const method of methods) expect(generated.paths?.[path]).toHaveProperty(method);
    }
  });

  it('registers every executable contract and separates internal design services', () => {
    const generated = createOpenApiDocument();
    for (const [name, schema] of Object.entries(contracts)) {
      if (schema instanceof z.ZodType) expect(generated.components?.schemas).toHaveProperty(name);
    }
    expect(generated.paths?.['/api/edit']?.post?.security).toEqual([{ SupabaseBearer: [] }]);
    expect(generated.paths?.['/api/health']?.get?.security).toEqual([]);
    const internal = generated.paths?.['/v1/recommend']?.post;
    expect(internal?.servers?.[0].url).toContain('.invalid');
    expect(internal).toHaveProperty('x-implementation-status', 'design-only');
    expect(generated.components?.schemas?.EditRequest).toHaveProperty('description');
  });

  it('resolves every local schema reference and has unique operation IDs', () => {
    const generated = createOpenApiDocument();
    const operationIds: string[] = [];
    function visit(value: unknown) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const object = value as Record<string, unknown>;
      if (typeof object.$ref === 'string' && object.$ref.startsWith('#/')) {
        const target = object.$ref.slice(2).split('/').reduce<unknown>((part, key) => (part as Record<string, unknown> | undefined)?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], generated);
        expect(target, object.$ref).toBeDefined();
      }
      if (typeof object.operationId === 'string') operationIds.push(object.operationId);
      Object.values(object).forEach(visit);
    }
    visit(generated);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operationIds).toHaveLength(26);
  });

  it('documents real body-limit, media-type and unavailable responses plus versioned health', () => {
    const generated = createOpenApiDocument();
    for (const path of ['/api/edit', '/api/recommend', '/api/images/upload-url', '/api/images/complete', '/api/checkout']) {
      const responses = generated.paths?.[path]?.post?.responses;
      expect(responses, path).toHaveProperty('413');
      expect(responses, path).toHaveProperty('415');
      expect(responses, path).toHaveProperty('503');
    }
    expect(generated.paths?.['/api/jobs']?.get?.responses).toHaveProperty('503');
    expect(generated.paths?.['/api/stripe/webhook']?.post?.responses).toHaveProperty('413');
    expect(generated.components?.schemas?.InternalHealthResponse).toMatchObject({
      required: ['status', 'contract_version'],
      properties: { status: { enum: ['ok'] }, contract_version: { enum: ['1.0.0'] } },
    });
    for (const path of ['/health', '/ready']) {
      expect(generated.paths?.[path]?.get?.responses?.['200']).toMatchObject({
        content: { 'application/json': { schema: { $ref: '#/components/schemas/InternalHealthResponse' } } },
      });
    }
  });
});
