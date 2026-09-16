import { logger } from '../utils/logger';
import { findProducts, findVariants, findServices, findPrices, findFaq, findServiceAreas, findWarranties, findBusinessRules } from './knowledgeRepository';
import { normalizeKnowledgeQuery } from './knowledgeQueryNormalizer';
import type { KnowledgeSearchResult } from './types';

export async function searchKnowledge(input:string):Promise<KnowledgeSearchResult> {
  const query = normalizeKnowledgeQuery(input);
  const text = query.normalized;
  const productTerm = query.category || (/\b(cctv|kamera|camera)\b/.test(text) ? 'CCTV' : text);
  const serviceTerm = /\b(pasang|pemasangan)\b/.test(text) ? 'INSTALLATION' : /\b(service|servis|perbaikan|maintenance)\b/.test(text) ? 'REPAIR' : text;
  const areaTokens = text.split(' ').filter(token => token.length >= 4).slice(-3);
  const [products, services, faqs, areaResults] = await Promise.all([
    findProducts(productTerm),
    findServices(serviceTerm),
    findFaq(text),
    Promise.all(areaTokens.map(token => findServiceAreas(token, 10))),
  ]);
  const areas = areaResults.flat().filter((area,index,self)=>self.findIndex(item=>item.id===area.id)===index);
  const productIds = products.map(p=>p.id);
  const serviceIds = services.map(s=>s.id);
  const variants = await findVariants(undefined, text.match(/\b\d+\s*mp\b/i)?.[0] || text);
  const ids = [...productIds, ...serviceIds, ...variants.map(v=>v.id)];
  const [prices, warranties, rules] = await Promise.all([findPrices(ids), findWarranties([...productIds,...serviceIds]), findBusinessRules(text)]);
  const result = { products: query.category ? products.filter(p=>p.category===query.category || query.category==='CCTV' && ['CAMERA','DVR','NVR','CCTV'].includes(p.category)) : products, variants, services, prices, areas, warranties, faqs, rules, query };
  logger.info({ query:text, products:result.products.length, services:services.length, prices:prices.length, faqs:faqs.length }, result.products.length || services.length || faqs.length ? 'knowledge_result' : 'knowledge_miss');
  if (query.intent==='PRICE_INQUIRY') logger.info({ query:text, prices:prices.length }, 'price_lookup');
  return result;
}
