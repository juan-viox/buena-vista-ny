// ============================================================
// Reviews & reputation fixtures — 28 reviews across Google,
// Yelp, OpenTable and TripAdvisor, mirroring Buena Vista's real
// public reputation: Google 4.7 (1,481), OpenTable 4.5 (527),
// TripAdvisor 4.4 (91). Praise clusters on paella / ceviche /
// sangría / service; 4 critical reviews call out wait times and
// noise with specifics. Dish mentions use real menu names.
// ============================================================

import type { ID, Review, ReviewPlatform, ReviewPlatformStat } from '../types';
import { TENANT_ID } from './tenancy';
import { isoDaysAgo } from './seed';

/** Lifetime platform reputation — powers the summary cards. */
export const REVIEW_PLATFORM_STATS: ReviewPlatformStat[] = [
  { platform: 'google', rating: 4.7, reviewCount: 1481, trend: 0.1 },
  { platform: 'opentable', rating: 4.5, reviewCount: 527, trend: 0 },
  { platform: 'tripadvisor', rating: 4.4, reviewCount: 91, trend: 0.1 },
  { platform: 'yelp', rating: 4.0, reviewCount: 312, trend: -0.1 },
];

function rv(
  id: ID, platform: ReviewPlatform, author: string, rating: Review['rating'],
  daysAgo: number, text: string, dishMentions: string[], replyText?: string,
): Review {
  return {
    id,
    tenantId: TENANT_ID,
    platform,
    author,
    rating,
    text,
    date: isoDaysAgo(daysAgo),
    replied: Boolean(replyText),
    replyText,
    dishMentions,
  };
}

export const REVIEWS: Review[] = [
  // ---------- Google (12) ----------
  rv('rev_g01', 'google', 'Melissa Grant', 5, 1,
    'Came in before a show at the Shubert and the timing was flawless — told our server we had a 7pm curtain and every course landed on cue. The Paella Buenavista is the real deal, socarrat and all. Sangría pitcher for the table, obviously.',
    ['Paella Buenavista', 'Sangría Roja'],
    'Melissa, this made our night! Pre-theater is our favorite dance — thrilled the timing and the paella both hit their marks. See you before your next show. — Christian & the Buena Vista team'),
  rv('rev_g02', 'google', 'Jordan Ellis', 5, 3,
    'Ceviche Limeño might be the best in Manhattan right now. Leche de tigre had real bite, plantain chips stayed crisp to the last scoop. Our server Marisol remembered us from last month, which honestly sealed it.',
    ['Ceviche Limeño'],
    'Jordan — Marisol lit up reading this. The ceviche team says the leche de tigre secret stays in the family, but you\'re welcome to keep testing it. Hasta pronto! — the Buena Vista team'),
  rv('rev_g03', 'google', 'Priya Shah', 5, 6,
    'Anniversary dinner in the East Village room. They wrote "Feliz Aniversario" in chocolate on the flan plate without us even asking — someone caught the note on our reservation. Pulpo a la Parrilla was char-kissed perfection.',
    ['Pulpo a la Parrilla', 'Flan de Caramelo'],
    'Priya, happy anniversary from all of us! The kitchen fights over who gets to pipe the chocolate messages. Come make it a tradition. — Christian & the Buena Vista team'),
  rv('rev_g04', 'google', 'Dave Okafor', 4, 9,
    'Solid Spanish-Caribbean spot. Croquetas and the guacamole to start, Paella Negra for two — squid ink rice was rich without being heavy. Only nitpick: the Rioja I wanted was out. Great energy on a Tuesday.',
    ['Croquetas', 'Buenavista Guacamole', 'Paella Negra', 'Rioja Reserva']),
  rv('rev_g05', 'google', 'Carolina Núñez', 5, 12,
    'Vinimos en familia un domingo y nos trataron como en casa. La paella para compartir, los tostones, y el mejor sangría roja que he probado en Nueva York. El equipo habla español y eso se agradece muchísimo.',
    ['Paella Buenavista', 'Sangría Roja'],
    '¡Carolina, mil gracias! Los domingos en familia son exactamente lo que soñamos para este lugar. Los esperamos pronto — la casa invita los churros. — Christian y el equipo de Buena Vista'),
  rv('rev_g06', 'google', 'Tom Reiner', 5, 16,
    'Business dinner for six in the private corner at Hell\'s Kitchen. The BV Smoked Old Fashioned arrives under a glass dome of smoke — my clients are still talking about it. Ossobuco fell off the bone. Flawless service pacing.',
    ['BV Smoked Old Fashioned', 'Ossobuco de Cerdo Ibérico'],
    'Tom, thank you — the smoke show never gets old for us either. Glad the room worked for your group; we\'ll hold that corner for the next one. — the Buena Vista team'),
  rv('rev_g07', 'google', 'Aisha Bello', 5, 19,
    'Brunch at the East Village location is criminally underrated. Tropical French Toast, a round of Churros con Chocolate, and the cava flowed. Our server checked the kitchen for nut allergies without making it a whole thing.',
    ['Tropical French Toast', 'Churros con Chocolate', 'Cava Brut'],
    'Aisha — brunch crew salutes you! And thank you for flagging the allergy note; that\'s exactly how we want it handled. Sundays won\'t be the same without you. — the Buena Vista team'),
  rv('rev_g08', 'google', 'Greg Halloran', 3, 8,
    'Food was genuinely great — the sea bass was cooked perfectly — but we waited 45 minutes past our 7:30 reservation on a Friday at Hell\'s Kitchen. The bar was so packed there was nowhere to stand. Somebody should have managed expectations at the door.',
    ['Chilean Sea Bass Mediterráneo'],
    'Greg, you\'re right and I\'m sorry — Friday pre-theater got away from us that night and 45 minutes is not acceptable. We\'ve added a host at the door on Fridays and we\'d love a chance to do it properly: dinner\'s first round is on me. — Christian, owner'),
  rv('rev_g09', 'google', 'Lauren Kim', 5, 23,
    'Date night win. Sat at the bar, split the Ceviche Limeño and the Pulpo, finished with churros. Bartender walked us through the mezcal list like a sommelier. That gold-lit dining room is gorgeous.',
    ['Ceviche Limeño', 'Pulpo a la Parrilla', 'Churros con Chocolate', 'Mezcal Espadín'],
    'Lauren — bar seats are the best seats in the house, don\'t tell anyone. The mezcal tour is always on offer. Gracias! — the Buena Vista team'),
  rv('rev_g10', 'google', 'Marcus Deveaux', 5, 27,
    'Took my mom for her 70th. They brought the flan out with a candle and the whole staff sang in Spanish. Paella Buenavista fed three of us easily. This place has soul — you can\'t fake that.',
    ['Paella Buenavista', 'Flan de Caramelo'],
    'Marcus, happy 70th to your mom from the whole crew! Singing is mandatory here — kitchen included, for better or worse. Un abrazo. — Christian & the Buena Vista team'),
  rv('rev_g11', 'google', 'Steph Winters', 4, 38,
    'Really good tapas run — Manchego y Serrano, Empanadillas, the black hummus. Sangría was a touch sweet for me but my table disagreed loudly. Would return for the paella I saw sailing past us all night.',
    ['Manchego y Serrano', 'Empanadillas', 'Hummus Negro', 'Sangría Roja']),
  rv('rev_g12', 'google', 'Rafael Ortiz', 5, 44,
    'As a Spaniard I\'m picky about paella and this one earns it — proper bomba rice, saffron you can actually taste, socarrat on the bottom. The Albariño list is short but chosen with care. Bravo.',
    ['Paella Buenavista', 'Albariño'],
    'Rafael — from a Spaniard, this is the review we frame. The bomba and saffron are non-negotiable for us. ¡Gracias, hermano! — Chef Rafael & the Buena Vista team'),

  // ---------- OpenTable (7) ----------
  rv('rev_ot1', 'opentable', 'Diane F.', 5, 2,
    'Booked for restaurant week and it over-delivered. Three courses, zero rush, and the server steered us to the Salmon Barceloneta which was the best dish at the table. Will book again at full price happily.',
    ['Salmon Barceloneta'],
    'Diane, that\'s the dream review — restaurant week is our audition and we\'re glad we passed. The salmon has a fan club now. See you soon! — the Buena Vista team'),
  rv('rev_ot2', 'opentable', 'Kenneth W.', 5, 7,
    'Our go-to before Broadway. Kitchen knows what a 7pm curtain means. Ceviche, croquetas, paella for two, out the door in 80 minutes without ever feeling rushed. That\'s craft.',
    ['Ceviche Limeño', 'Croquetas', 'Paella Buenavista'],
    'Kenneth — 80 minutes, three acts, no intermission. Pre-theater is a show of its own and we love performing it for you. Break a leg out there! — the Buena Vista team'),
  rv('rev_ot3', 'opentable', 'Sandra M.', 4, 14,
    'Lovely evening in the East Village. The Pulpo a la Parrilla was standout, sangría pitcher generous. Half star off because our table by the door caught a draft all night.',
    ['Pulpo a la Parrilla', 'Sangría Roja'],
    'Sandra, thank you — and noted on the draft; we\'ve added a curtain by that doorway. Next visit, tell the host "Sandra\'s table" and we\'ll seat you deep in the warm corner. — the Buena Vista team'),
  rv('rev_ot4', 'opentable', 'Luis R.', 5, 21,
    'Quinceañera dinner for 14 and they nailed it — separate checks handled without drama, a dedicated server, and the birthday girl got her flan with sparklers. La comida espectacular, el servicio mejor.',
    ['Flan de Caramelo', 'Paella Buenavista'],
    'Luis — ¡felicidades a la quinceañera! Big tables are where this restaurant feels most like itself. Gracias for trusting us with the night. — Christian & the Buena Vista team'),
  rv('rev_ot5', 'opentable', 'Rebecca T.', 3, 11,
    'Mixed feelings. The food deserves five stars — that smoked old fashioned is theater — but we sat 25 minutes past our reservation and then waited another 30 for starters. Kitchen was clearly slammed on a Saturday. Fix the pacing and this is a five.',
    ['BV Smoked Old Fashioned']),
  rv('rev_ot6', 'opentable', 'Alan P.', 4, 31,
    'Very good tapas and an honest wine list. Empanadillas and the beet-quinoa salad were highlights. Room gets lively by 8 — go early if you want conversation.',
    ['Empanadillas', 'Remolacha y Quinoa']),
  rv('rev_ot7', 'opentable', 'Grace L.', 5, 41,
    'Celebrated our engagement here and the team made it unforgettable — cava on the house, a rose on the table, and the Paella Negra was dramatic and delicious. Thank you for making it special.',
    ['Paella Negra', 'Cava Brut'],
    'Grace — congratulations from the entire familia! The cava was the least we could do. Come back for the anniversary; the rose will be waiting. — Christian & the Buena Vista team'),

  // ---------- TripAdvisor (5) ----------
  rv('rev_ta1', 'tripadvisor', 'WanderNYC_Kate', 5, 4,
    'Visiting from London and this was our best meal in New York. Authentic Spanish-Caribbean cooking, warm staff who treated tourists like regulars, and a paella worth the flight. Book the Hell\'s Kitchen location before a show.',
    ['Paella Buenavista'],
    'Kate, London to our little corner of 9th Ave — we\'re honored. "Worth the flight" is going on the kitchen wall. Safe travels and hurry back! — the Buena Vista team'),
  rv('rev_ta2', 'tripadvisor', 'FoodieCouple_TX', 5, 18,
    'Second visit in two trips to NYC. Ceviche Limeño and Sangría Roja on the patio — perfect summer afternoon. Service was unhurried in the best way.',
    ['Ceviche Limeño', 'Sangría Roja'],
    'Y\'all are officially regulars now — two trips, two visits earns it. The patio will keep a table warm for trip three. — the Buena Vista team'),
  rv('rev_ta3', 'tripadvisor', 'MarcoV_Roma', 4, 26,
    'Very good! The Ossobuco de Cerdo Ibérico was excellent and the atmosphere lively. Portions generous. Only the espresso after dinner was weak — an Italian notices these things.',
    ['Ossobuco de Cerdo Ibérico']),
  rv('rev_ta4', 'tripadvisor', 'JennyB_Boston', 3, 13,
    'Food was tasty but the East Village room on a Saturday is LOUD — we were practically shouting across a two-top, and the tables are packed so close I heard my neighbor\'s entire dating history. Sangría and churros were great. Go on a weeknight.',
    ['Sangría Roja', 'Churros con Chocolate'],
    'Jenny, fair hit — Saturday downtown turns into a fiesta and two-tops pay the price. We\'ve spaced the row by the banquette and added soft panels overhead. Weeknights are indeed the mellow move, and your next churros are on us. — Christian, owner'),
  rv('rev_ta5', 'tripadvisor', 'RetiredAndHungry', 5, 52,
    'An unexpected gem. My wife and I stumbled in for lunch and stayed three hours. Croquetas, guacamole, a paella for one each, and the kindest server who kept the stories coming. New York still surprises.',
    ['Croquetas', 'Buenavista Guacamole', 'Paella for 1'],
    'Three-hour lunches are what those chairs were built for. Thank you both — come get surprised again soon. — the Buena Vista team'),

  // ---------- Yelp (4) ----------
  rv('rev_y01', 'yelp', 'Vanessa L.', 5, 5,
    'Don\'t sleep on this place. Pulpo a la Parrilla had proper char, the Papa Azul is the best potato dish in the neighborhood, and the sangría is dangerously drinkable. Service was warm even at Friday peak.',
    ['Pulpo a la Parrilla', 'Papa azul', 'Sangría Roja'],
    'Vanessa — "dangerously drinkable" is exactly the brief we gave the bar. Gracias for the love; Friday peak crew takes a bow. — the Buena Vista team'),
  rv('rev_y02', 'yelp', 'Derek C.', 4, 15,
    'Good spot for groups. We did the tapas crawl — croquetas, empanadillas, montaditos — and everything landed. Docking a star because the kitchen ran out of churros by 10pm, which should be illegal.',
    ['Croquetas', 'Empanadillas', 'Montadito de Pernil', 'Churros con Chocolate'],
    'Derek, running out of churros IS illegal in this house and the batch count has been raised accordingly. Come back and audit us. — the Buena Vista team'),
  rv('rev_y03', 'yelp', 'Samantha R.', 2, 10,
    'The food deserves better logistics. Saturday night in the East Village: 35 minutes past our reservation, the bar crowd pressed up against our table, and the music was so loud our server had to crouch and repeat the specials three times. The ceviche was genuinely excellent, which makes the chaos more frustrating.',
    ['Ceviche Limeño']),
  rv('rev_y04', 'yelp', 'Hiro T.', 5, 34,
    'Late-night find. Kitchen serves until 2am on Fridays downtown and the Paella Negra at midnight with a mezcal was a top-five NYC food moment for me this year. Staff still had energy at 1am. Respect.',
    ['Paella Negra', 'Mezcal Espadín'],
    'Hiro — the midnight paella club is real and you\'re in it. 2am Fridays are our love letter to the neighborhood. See you after hours. — the Buena Vista team'),
];
