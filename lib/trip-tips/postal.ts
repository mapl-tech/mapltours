/**
 * The mailing address trip tips print: in every tip's footer (HTML and plain
 * text) and on the unsubscribe page. null prints none.
 *
 * Owner's decision, Sept 27 2026: "Do not put our address". So it is null,
 * and nothing else in lib/trip-tips holds an address: set this one constant
 * (for example to a PO box or a virtual mailbox) and every tip and the page
 * carry it, with no other change.
 *
 * Legal note for that decision (checked Sept 27 2026). US CAN-SPAM
 * (15 U.S.C. 7704(a)(5)) and Canada's CASL (Electronic Commerce Protection
 * Regulations, SOR/2012-36, s. 2(1)(d)) require a commercial email to carry
 * the sender's postal mailing address. The prospect tips (p1 to p4) sell a
 * ride or a tour and carry the JAMAICA5 code, and t1 prices a ride the guest
 * has not booked, so they are commercial messages. Neither law needs a
 * street address: the FTC's CAN-SPAM guide accepts "a post office box
 * you've registered with the U.S. Postal Service, or a private mailbox
 * you've registered with a commercial mail receiving agency", and the
 * CRTC (Bulletin 2012-548) counts a P.O. box as a mailing address, valid
 * for at least 60 days after the message is sent. So a PO box or a virtual
 * mailbox satisfies both. Until one is set, those tips go without it.
 */
export const TRIP_TIPS_POSTAL_ADDRESS: string | null = null
