export type KnowledgeStatus = 'ACTIVE' | 'INACTIVE';
export type PriceType = 'FIXED_PRICE' | 'STARTING_PRICE' | 'PRICE_RANGE' | 'CONTACT_ADMIN';
export type KnowledgeSource = 'ADMIN' | 'MANUAL' | 'DATABASE' | 'IMPORTED';
export interface Product { id:string; code:string; name:string; category:string; brand:string|null; description:string|null; specifications:Record<string, unknown>; unit:string; status:KnowledgeStatus; notes:string|null; source:KnowledgeSource; last_verified_at:Date|null; updated_by:string|null; }
export interface ProductVariant { id:string; product_id:string; name:string; specifications:Record<string, unknown>; unit:string; status:KnowledgeStatus; }
export interface Service { id:string; code:string; name:string; category:string; description:string|null; unit:string; status:KnowledgeStatus; notes:string|null; }
export interface Price { id:string; product_id:string|null; product_variant_id:string|null; service_id:string|null; price:string; price_type:PriceType; unit:string; minimum_quantity:number; valid_from:Date; valid_until:Date|null; status:KnowledgeStatus; notes:string|null; source:KnowledgeSource; }
export interface ServiceArea { id:string; name:string; city:string|null; province:string|null; status:KnowledgeStatus; notes:string|null; }
export interface Warranty { id:string; product_id:string|null; service_id:string|null; duration:number; unit:string; description:string|null; conditions:string|null; status:KnowledgeStatus; }
export interface FAQ { id:string; category:string; question:string; answer:string; keywords:string[]; status:KnowledgeStatus; priority:number; }
export interface BusinessRule { id:string; rule_key:string; rule_name:string; rule_value:string; description:string|null; status:KnowledgeStatus; priority:number; }
export interface KnowledgeQuery { normalized:string; intent:'PRICE_INQUIRY'|'AVAILABILITY'|'SERVICE'|'FAQ'|'GENERAL'; category?:string; quantity?:number; }
export interface KnowledgeSearchResult { products:Product[]; variants:ProductVariant[]; services:Service[]; prices:Price[]; areas:ServiceArea[]; warranties:Warranty[]; faqs:FAQ[]; rules:BusinessRule[]; query:KnowledgeQuery; }
