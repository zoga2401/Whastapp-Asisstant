'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Login() {
  const [error,setError]=useState(''); const router=useRouter();
  async function submit(e:FormEvent<HTMLFormElement>) { e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget)); const r=await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL||'http://localhost:3000'}/api/admin/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)}); if(!r.ok){setError('Login gagal.');return;} router.push('/dashboard'); }
  return <main className="login"><form onSubmit={submit}><h1>Zoga Assistant</h1><input name="username" placeholder="Username" required/><input name="password" type="password" placeholder="Password" required/><button>Login</button>{error&&<p>{error}</p>}</form></main>;
}
