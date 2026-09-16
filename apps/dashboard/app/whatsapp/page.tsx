'use client';
import { useEffect,useState } from 'react';
export default function WhatsApp(){const [connected,setConnected]=useState(false);useEffect(()=>{fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL||'http://localhost:3000'}/health`).then(r=>r.json()).then(x=>setConnected(Boolean(x.whatsapp?.connected)))},[]);return <section className="content"><h1>WhatsApp</h1><p>Connection: <strong>{connected?'CONNECTED':'DISCONNECTED'}</strong></p><p>Session credentials are never displayed.</p></section>}
