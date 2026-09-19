/**
 * Who the example groups treat as "you".
 *
 * The made-up groups on the front page each keep one slot for the person
 * looking at them, so their own real calendar can be swapped into it (see
 * src/lib/realCalendar.ts). Without that, an example would be entirely
 * invented and would tell you nothing about your own week.
 *
 * Real groups have no need for this: there you are a real member with a real
 * account id, and the server says which member is you.
 */
export const CURRENT_USER_ID = "you";
