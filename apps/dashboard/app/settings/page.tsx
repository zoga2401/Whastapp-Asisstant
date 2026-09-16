'use client';
import { useState } from 'react';
const api=process.env.NEXT_PUBLIC_BACKEND_URL||'http://localhost:3000';
export default function Settings(){const [stopped,setStopped]=useState(false);return <section className="content"><h1>Settings</h1><p>Operational settings are managed through protected backend APIs.</p><button className="danger" onClick={async()=>{if(!confirm('Stop all AI replies?'))return;await fetch(`${api}/api/admin/auto-reply/control`,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({emergencyShutdown:true})});setStopped(true)}}>{stopped?'AI STOPPED':'STOP ALL AI REPLIES'}</button></section>}
