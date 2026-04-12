import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  try {
    const { amount, items, customerEmail } = await request.json()

    // Amount should be in cents
    const amountInCents = Math.round(amount * 100)

    if (amountInCents < 50) {
      return NextResponse.json(
        { error: 'Amount must be at least $0.50' },
        { status: 400 }
      )
    }

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        item_count: String(items.length),
        summary: items.map((item: { title: string; travelers: number; price: number }) =>
          `${item.title.slice(0, 30)}|${item.travelers}x$${item.price}`
        ).join(', ').slice(0, 490),
      },
      ...(customerEmail ? { receipt_email: customerEmail } : {}),
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
