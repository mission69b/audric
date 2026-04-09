import { describe, it, expect } from 'vitest';
import {
  getGatewayMapping,
  createRawGatewayMapping,
  SERVICE_MAP,
  DELIVER_FIRST_PATHS,
} from './service-gateway';

// ---------------------------------------------------------------------------
// Required fields per service — drives the validation tests automatically.
// When a new service is added to SERVICE_MAP, add its required fields here
// and both the "throws on empty" and "valid body" tests are generated.
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: Record<string, Record<string, string>> = {
  'openai-chat':         { prompt: 'Hello' },
  'elevenlabs-tts':      { text: 'Hello world' },
  'translate':           { text: 'Hello', target: 'es' },
  'fal-flux':            { prompt: 'A cat' },
  'stability-edit':      { image_url: 'https://example.com/img.png', prompt: 'edit' },
  'brave-search':        { q: 'sui blockchain' },
  'serpapi-flights':     { departure: 'SFO', arrival: 'JFK', date: '2026-05-01' },
  'newsapi':             { q: 'crypto' },
  'resend-email':        { to: 'test@test.com', subject: 'Hi', body: 'Hello' },
  'lob-postcard':        { to_name: 'Jane', to_address_line1: '123 Main', to_city: 'London', to_state: 'LDN', to_zip: 'SW1A 1AA', to_country: 'GB', message: 'Happy birthday' },
  'lob-letter':          { to_name: 'Jane', to_address_line1: '123 Main', to_city: 'London', to_state: 'LDN', to_zip: 'SW1A 1AA', to_country: 'GB', body: 'Dear Jane...' },
  'printful-order':      { recipient_name: 'Jane', address1: '123 Main', city: 'SF', state_code: 'CA', country_code: 'US', zip: '94107', items_json: '[{"variant_id":1}]' },
  'printful-browse':     {},
  'printful-estimate':   { recipient_name: 'Jane', address1: '123 Main', city: 'SF', state_code: 'CA', country_code: 'US', zip: '94107', items_json: '[{"variant_id":1}]' },
  'lob-verify':          { primary_line: '185 Berry St' },
  'coingecko-price':     { ids: 'sui' },
  'alphavantage-quote':  { symbol: 'AAPL' },
  'exchangerate-convert': { from: 'USD', to: 'EUR', amount: '100' },
  'screenshot':          { url: 'https://example.com' },
  'shortio':             { originalURL: 'https://example.com/long' },
  'qrcode':              { data: 'https://audric.ai' },
  'e2b-execute':         { code: 'print("hi")' },
  'virustotal':          { url: 'https://example.com' },
};

// ---------------------------------------------------------------------------
// Group A: SERVICE_MAP field validation (data-driven)
// ---------------------------------------------------------------------------

describe('SERVICE_MAP — required field validation', () => {
  it('REQUIRED_FIELDS covers every SERVICE_MAP entry', () => {
    const mapKeys = Object.keys(SERVICE_MAP).sort();
    const testKeys = Object.keys(REQUIRED_FIELDS).sort();
    expect(testKeys).toEqual(mapKeys);
  });

  for (const [serviceId, validFields] of Object.entries(REQUIRED_FIELDS)) {
    const mapping = getGatewayMapping(serviceId);

    describe(serviceId, () => {
      it('exists in SERVICE_MAP', () => {
        expect(mapping).not.toBeNull();
      });

      const requiredKeys = Object.keys(validFields);
      if (requiredKeys.length > 0) {
        it('throws on empty fields', () => {
          expect(() => mapping!.transformBody({})).toThrow();
        });
      }

      it('returns valid body when all fields provided', () => {
        const result = mapping!.transformBody(validFields);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Group B: Deliver-first invariant — expensive services MUST be protected
// ---------------------------------------------------------------------------

describe('deliver-first enforcement', () => {
  const EXPENSIVE_THRESHOLD = 0.20;

  it('all expensive services (>= $0.20) in SERVICE_MAP have deliverFirst', () => {
    for (const [id, mapping] of Object.entries(SERVICE_MAP)) {
      const price = parseFloat(mapping.price);
      if (isNaN(price)) continue; // 'dynamic' is handled separately
      if (price >= EXPENSIVE_THRESHOLD) {
        expect(
          mapping.deliverFirst,
          `${id} costs $${mapping.price} (>= $${EXPENSIVE_THRESHOLD}) but has no deliverFirst`,
        ).toBeDefined();
      }
    }
  });

  it('dynamic-priced services in SERVICE_MAP have deliverFirst', () => {
    for (const [id, mapping] of Object.entries(SERVICE_MAP)) {
      if (mapping.price === 'dynamic') {
        expect(
          mapping.deliverFirst,
          `${id} has dynamic pricing but no deliverFirst`,
        ).toBeDefined();
      }
    }
  });

  it('cheap services do NOT have deliverFirst (standard MPP is fine)', () => {
    const mapping = getGatewayMapping('brave-search')!;
    expect(mapping.deliverFirst).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group C: DELIVER_FIRST_PATHS registry completeness
// ---------------------------------------------------------------------------

describe('DELIVER_FIRST_PATHS registry', () => {
  it('is not empty', () => {
    expect(DELIVER_FIRST_PATHS.size).toBeGreaterThan(0);
  });

  for (const path of DELIVER_FIRST_PATHS) {
    describe(path, () => {
      it(`raw URL /${path} routes to deliver-first mapping`, () => {
        const mapping = createRawGatewayMapping(`/${path}`, {});
        expect(mapping).not.toBeNull();
        expect(
          mapping!.deliverFirst,
          `/${path} must have deliverFirst`,
        ).toBeDefined();
      });

      it(`full URL https://mpp.t2000.ai/${path} also routes to deliver-first`, () => {
        const mapping = createRawGatewayMapping(`https://mpp.t2000.ai/${path}`, {});
        expect(mapping).not.toBeNull();
        expect(mapping!.deliverFirst).toBeDefined();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Group D: Country normalization + return address injection
// ---------------------------------------------------------------------------

describe('country normalization (wrapLobPayload via createRawGatewayMapping)', () => {
  function lobMapping(to: Record<string, unknown>) {
    return createRawGatewayMapping('/lob/v1/postcards', { to })!;
  }

  const COUNTRY_TESTS: [string, string][] = [
    ['UK', 'GB'],
    ['UNITED KINGDOM', 'GB'],
    ['ENGLAND', 'GB'],
    ['USA', 'US'],
    ['UNITED STATES', 'US'],
    ['AU', 'AU'],
    ['GB', 'GB'],
  ];

  for (const [input, expected] of COUNTRY_TESTS) {
    it(`normalizes "${input}" to "${expected}"`, () => {
      const mapping = lobMapping({ name: 'Test', address_country: input });
      const body = mapping.transformBody({}) as {
        payload: { to: { address_country: string } };
      };
      expect(body.payload.to.address_country).toBe(expected);
    });
  }

  it('injects Audric return address when "from" is absent', () => {
    const mapping = lobMapping({ name: 'Test', address_country: 'GB' });
    const body = mapping.transformBody({}) as {
      payload: { from: { name: string; address_country: string } };
    };
    expect(body.payload.from.name).toBe('Audric');
    expect(body.payload.from.address_country).toBe('US');
  });

  it('preserves user-provided "from" address but normalizes country', () => {
    const m = createRawGatewayMapping('/lob/v1/postcards', {
      to: { name: 'Mum', address_country: 'UK' },
      from: { name: 'Me', address_country: 'USA' },
    })!;
    const body = m.transformBody({}) as {
      payload: { from: { name: string; address_country: string } };
    };
    expect(body.payload.from.name).toBe('Me');
    expect(body.payload.from.address_country).toBe('US');
  });

  it('sets use_type to "operational" by default', () => {
    const mapping = lobMapping({ name: 'Test', address_country: 'GB' });
    const body = mapping.transformBody({}) as { payload: { use_type: string } };
    expect(body.payload.use_type).toBe('operational');
  });
});

// ---------------------------------------------------------------------------
// Group E: Security — path traversal / injection
// ---------------------------------------------------------------------------

describe('createRawGatewayMapping — path safety', () => {
  it('rejects path traversal', () => {
    expect(createRawGatewayMapping('/../../../etc/passwd', {})).toBeNull();
  });

  it('rejects single-segment path', () => {
    expect(createRawGatewayMapping('/openai', {})).toBeNull();
  });

  it('returns generic mapping for unknown cheap service', () => {
    const mapping = createRawGatewayMapping('/openai/v1/chat/completions', {});
    expect(mapping).not.toBeNull();
    expect(mapping!.deliverFirst).toBeUndefined();
    expect(mapping!.price).toBe('0.05');
  });

  it('rejects empty path', () => {
    expect(createRawGatewayMapping('', {})).toBeNull();
  });
});
