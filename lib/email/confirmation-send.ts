/**
 * How the paid-booking emails go out (the guest's confirmation and the
 * operator's alert), from the Stripe webhook and from the gift-covered
 * checkout. Bounded: a send that stalls reports a failure, the caller
 * releases its claim, and Stripe's redelivery (or the checkout's own retry)
 * sends it again. The claim is taken BEFORE the send, so a stall that ran
 * into the platform's 10-second kill used to leave the email marked as sent
 * with nothing to retry it. 3.5 s leaves room for both emails and the
 * calendar sync inside that limit. Each send also carries a `dedupe` name,
 * so the retry of one that was only slow is not a second delivery.
 */
export const CONFIRMATION_SEND = { timeoutMs: 3500 } as const
