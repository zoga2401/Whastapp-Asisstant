import type { KnowledgeSearchResult } from './types';
export function buildKnowledgeContext(result:KnowledgeSearchResult):string {
  const lines=['BUSINESS KNOWLEDGE (database facts only)','If a fact is absent, do not guess; ask admin or clarify.'];
  if(result.products.length) lines.push('Products:\n'+result.products.slice(0,10).map(p=>`- ${p.name} [${p.code}] category=${p.category}; status=${p.status}; unit=${p.unit}; source=${p.source}`).join('\n'));
  if(result.variants.length) lines.push('Variants:\n'+result.variants.slice(0,10).map(v=>`- ${v.name}; unit=${v.unit}; status=${v.status}`).join('\n'));
  if(result.services.length) lines.push('Services:\n'+result.services.slice(0,10).map(s=>`- ${s.name} [${s.code}] category=${s.category}; unit=${s.unit}; status=${s.status}`).join('\n'));
  if(result.prices.length) lines.push('Prices:\n'+result.prices.slice(0,20).map(p=>`- ${p.price_type}: ${p.price} / ${p.unit}; minimum=${p.minimum_quantity}; valid ${p.valid_from.toISOString()} - ${p.valid_until?.toISOString()||'open'}; source=${p.source}`).join('\n'));
  if(result.areas.length) lines.push('Service areas:\n'+result.areas.map(a=>`- ${a.name}${a.city?`, ${a.city}`:''}${a.province?`, ${a.province}`:''}`).join('\n'));
  if(result.warranties.length) lines.push('Warranties:\n'+result.warranties.map(w=>`- ${w.duration} ${w.unit}: ${w.description||''}; conditions=${w.conditions||'not specified'}`).join('\n'));
  if(result.faqs.length) lines.push('FAQs:\n'+result.faqs.map(f=>`- Q: ${f.question}\n  A: ${f.answer}`).join('\n'));
  if(result.rules.length) lines.push('Business rules:\n'+result.rules.map(r=>`- ${r.rule_name}: ${r.rule_value}`).join('\n'));
  if(lines.length===2) lines.push('No matching business fact was found.');
  return lines.join('\n\n').slice(0,12000);
}
