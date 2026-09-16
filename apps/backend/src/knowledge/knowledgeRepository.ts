import { dbPool } from '../config/database';
import type { Product, ProductVariant, Service, Price, FAQ, ServiceArea, Warranty, BusinessRule } from './types';
const limit = (n=20) => Math.min(Math.max(Number.isFinite(n)?Math.floor(n):20,1),100);
export async function findProducts(query='', max=20):Promise<Product[]> { const q=`%${query.trim().slice(0,100)}%`; const r=await dbPool.query(`SELECT * FROM products WHERE status='ACTIVE' AND (name ILIKE $1 OR code ILIKE $1 OR coalesce(description,'') ILIKE $1 OR category ILIKE $1) ORDER BY name LIMIT $2`,[q,limit(max)]); return r.rows; }
export async function findProductByCode(code:string){ const r=await dbPool.query(`SELECT * FROM products WHERE code=$1 LIMIT 1`,[code.trim()]); return r.rows[0] as Product|undefined; }
export async function findVariants(productId?:string, query=''){ const r=await dbPool.query(`SELECT * FROM product_variants WHERE status='ACTIVE' AND ($1::uuid IS NULL OR product_id=$1) AND ($2='' OR name ILIKE $3) ORDER BY name LIMIT 100`,[productId||null,query.trim(),`%${query.trim()}%`]); return r.rows as ProductVariant[]; }
export async function findServices(query='', max=20){ const q=`%${query.trim().slice(0,100)}%`; const r=await dbPool.query(`SELECT * FROM services WHERE status='ACTIVE' AND (name ILIKE $1 OR code ILIKE $1 OR category ILIKE $1 OR coalesce(description,'') ILIKE $1) ORDER BY name LIMIT $2`,[q,limit(max)]); return r.rows as Service[]; }
export async function findPrices(targetIds:string[]=[]):Promise<Price[]> { const r=await dbPool.query(`SELECT * FROM price_lists WHERE status='ACTIVE' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND ($1::uuid[]='{}' OR product_id=ANY($1) OR product_variant_id=ANY($1) OR service_id=ANY($1)) ORDER BY valid_from DESC LIMIT 100`,[targetIds]); return r.rows; }
export async function findFaq(query='', max=10){ const q=`%${query.trim().slice(0,100)}%`; const r=await dbPool.query(`SELECT * FROM faqs WHERE status='ACTIVE' AND (question ILIKE $1 OR answer ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE k ILIKE $1)) ORDER BY priority DESC LIMIT $2`,[q,limit(max)]); return r.rows as FAQ[]; }
export async function findServiceAreas(query='', max=20){ const q=`%${query.trim().slice(0,100)}%`; const r=await dbPool.query(`SELECT * FROM service_areas WHERE status='ACTIVE' AND (name ILIKE $1 OR city ILIKE $1 OR province ILIKE $1) ORDER BY name LIMIT $2`,[q,limit(max)]); return r.rows as ServiceArea[]; }
export async function findWarranties(ids:string[]=[]){ const r=await dbPool.query(`SELECT * FROM warranties WHERE status='ACTIVE' AND ($1::uuid[]='{}' OR product_id=ANY($1) OR service_id=ANY($1)) LIMIT 100`,[ids]); return r.rows as Warranty[]; }
export async function findBusinessRules(query='', max=50){ const q=`%${query.trim().slice(0,100)}%`; const r=await dbPool.query(`SELECT * FROM business_rules WHERE status='ACTIVE' AND (rule_key ILIKE $1 OR rule_name ILIKE $1 OR rule_value ILIKE $1) ORDER BY priority DESC LIMIT $2`,[q,limit(max)]); return r.rows as BusinessRule[]; }
export const findProduct = async (query:string) => (await findProducts(query, 1))[0];
export const findService = async (query:string) => (await findServices(query, 1))[0];
export const findPrice = async (ids:string[]) => (await findPrices(ids))[0];
export const findFaqs = findFaq;
export const findServiceArea = async (query:string) => (await findServiceAreas(query, 1))[0];
export const getBusinessRule = async (query:string) => (await findBusinessRules(query, 1))[0];
export { findProducts as getProducts, findServices as getServices };
