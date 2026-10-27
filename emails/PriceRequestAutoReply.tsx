import { Heading, Section, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface PriceRequestAutoReplyProps {
  /** The hotel, villa or address the guest typed. */
  hotel: string
  tripType: 'round_trip' | 'one_way'
  passengers: number
}

export const PRICE_REQUEST_REPLY_SUBJECT = 'Your ride price is on its way, MAPL Tours Jamaica'

/**
 * Sent to a guest who asked for a price from the transfers page because their
 * hotel is not on the rate card. It replaces the general contact auto-reply
 * for this form, which echoed the team's internal note back to the guest and
 * guessed a first name from the email address (the form asks for none).
 * The promise matches the form: a flat price, usually the same day.
 */
export default function PriceRequestAutoReply({ hotel, tripType, passengers }: PriceRequestAutoReplyProps) {
  const trip = tripType === 'one_way' ? 'One way' : 'Round trip'

  return (
    <MaplLayout preheader={`We will email you a flat price for your ride to ${hotel}, usually the same day.`}>
      <Text style={s.kicker}>Price request received</Text>
      <Heading style={s.heading}>We&rsquo;re pricing your ride to {hotel}.</Heading>
      <Text style={s.heroLead}>
        Thanks for asking. One of our team will work out a flat price for your
        private ride and email it to you, usually the same day.
      </Text>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Your request</Text>
        </Section>
        <Section style={s.cardBody}>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Hotel or address</Text>
            <Text style={s.rowValue}>{hotel}</Text>
          </Section>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Trip</Text>
            <Text style={s.rowValue}>{trip}</Text>
          </Section>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Passengers</Text>
            <Text style={s.rowValue}>{passengers}</Text>
          </Section>
        </Section>
      </Section>

      <Text style={{ ...s.body, marginTop: 24 }}>
        The price we send is for your whole group, with nothing added at
        checkout. If you have your flight dates, reply with them and we&rsquo;ll
        check a driver is free.
      </Text>

      <Text style={s.body}>
        Landing in the next day or two? Reply with <strong>URGENT</strong> in
        the subject line and we&rsquo;ll answer you first.
      </Text>

      <Text style={s.note}>
        This is an automated confirmation. Replies go to a real inbox read by
        the MAPL Tours Jamaica team.
      </Text>
    </MaplLayout>
  )
}
