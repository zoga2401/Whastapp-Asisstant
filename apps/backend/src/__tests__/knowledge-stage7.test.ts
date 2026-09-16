import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeKnowledgeQuery } from '../knowledge/knowledgeQueryNormalizer';
import { buildKnowledgeContext } from '../knowledge/knowledgeContextBuilder';

describe('Knowledge Base Stage 7', () => {
  it('normalizes informal Indonesian/Javanese CCTV price queries', () => {
    const q = normalizeKnowledgeQuery('Mas iki nek pasang cctv nang toko piro');
    assert.equal(q.category, 'CCTV');
    assert.equal(q.intent, 'PRICE_INQUIRY');
  });
  it('does not turn absent knowledge into a business fact', () => {
    const context = buildKnowledgeContext({
      products: [], variants: [], services: [], prices: [], areas: [], warranties: [], faqs: [], rules: [],
      query: normalizeKnowledgeQuery('harga cctv'),
    });
    assert.match(context, /No matching business fact/);
    assert.match(context, /do not guess/i);
  });
  it('preserves starting-price semantics', () => {
    const context = buildKnowledgeContext({
      products: [], variants: [], services: [], areas: [], warranties: [], faqs: [], rules: [],
      prices: [{ id:'p', product_id:null, product_variant_id:null, service_id:'s', price:'150000', price_type:'STARTING_PRICE', unit:'kamera', minimum_quantity:1, valid_from:new Date(), valid_until:null, status:'ACTIVE', notes:null, source:'ADMIN' }],
      query: normalizeKnowledgeQuery('biaya pasang'),
    });
    assert.match(context, /STARTING_PRICE/);
  });
});
