import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not found in process.env' }, { status: 500 })
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'say hi' }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '?'
    return NextResponse.json({ ok: true, keyLength: apiKey.length, response: text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), keyLength: apiKey.length }, { status: 500 })
  }
}
