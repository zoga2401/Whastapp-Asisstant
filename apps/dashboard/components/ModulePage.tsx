'use client';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const resources: Record<string, string> = {
  products: 'products', services: 'services', prices: 'prices', faq: 'faqs',
  knowledge: 'products', memories: 'contacts', contacts: 'contacts',
  conversations: 'admin/dashboard/conversations', logs: 'admin/dashboard/audit',
};

export default function ModulePage({ name }: { name: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const resource = resources[name] || name;
  const endpoint = name === 'contacts' ? 'contacts' : resource.includes('/') ? resource : `knowledge/${resource}`;
  async function load() {
    const query = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (search) query.set('search', search);
    const response = await fetch(`${api}/api/${endpoint}?${query}`, { credentials: 'include' });
    if (response.ok) { const body = await response.json(); setRows(Array.isArray(body.data) ? body.data : []); }
  }
  useEffect(() => { load(); }, [offset]);
  async function create() {
    if (name === 'contacts' || name === 'logs' || name === 'conversations') return;
    const raw = prompt('JSON record to create');
    if (!raw) return;
    try { const response = await fetch(`${api}/api/${endpoint}`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:raw }); if (!response.ok) alert('Create failed'); else load(); } catch { alert('Gagal menyimpan data.'); }
  }
  async function edit(row: any) {
    const raw = prompt('JSON fields to update', JSON.stringify(row));
    if (!raw || !row.id) return;
    const response = await fetch(`${api}/api/${endpoint}/${row.id}`, { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:raw });
    if (!response.ok) alert('Update failed'); else load();
  }
  async function remove(row: any) {
    if (!row.id || !confirm('Deactivate/delete this record?')) return;
    const response = await fetch(`${api}/api/${endpoint}/${row.id}`, { method:'DELETE', credentials:'include' });
    if (!response.ok) alert('Delete failed'); else load();
  }
  return <section className="module"><div className="moduleHead"><h1>{name[0].toUpperCase()+name.slice(1)}</h1><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." onKeyDown={e=>e.key==='Enter'&&load()}/><button onClick={load}>Search</button>{!['contacts','logs','conversations'].includes(name)&&<button onClick={create}>Create</button>}</div><div className="tableWrap"><table><thead><tr><th>Name/ID</th><th>Status</th><th>Updated</th><th>Details</th><th>Actions</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.id||i}><td>{row.name||row.question||row.phone||row.event_type||row.id}</td><td>{row.status||row.action||row.ai_mode||'—'}</td><td>{row.updated_at||row.created_at||'—'}</td><td><pre>{JSON.stringify(row).slice(0,180)}</pre></td><td>{row.id&&!['logs','conversations'].includes(name)&&<><button onClick={()=>edit(row)}>Edit</button> <button onClick={()=>remove(row)}>Delete</button></>}</td></tr>)}</tbody></table></div><div className="pager"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous</button><span>Page {offset/20+1}</span><button disabled={rows.length<20} onClick={()=>setOffset(offset+20)}>Next</button></div></section>;
}
