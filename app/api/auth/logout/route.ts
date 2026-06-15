import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: 'dam_session',
    value: '',
    path: '/',
    maxAge: 0,
  });
  return response;
}
