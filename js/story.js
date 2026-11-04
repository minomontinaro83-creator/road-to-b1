/* ============================================================
   La storia a stagioni: ogni giorno una scena di vita reale dentro un filo narrativo.
   Qui c'è solo la struttura (stagioni, ambientazioni, archi). I dettagli della trama
   (personaggi, indizi) li inventa l'IA giorno per giorno e li annota nel "diario".
   ============================================================ */
import { shuffle } from './util.js';

export const EPISODES_PER_SEASON = 40;

export const SEASONS = [
  {
    n: 1, it: 'Atterrati', en: 'Landed',
    premise: 'The narrator lands in a big English-speaking city for a trip. At baggage claim he picks up a suitcase identical to his own. At the hotel he discovers it belongs to someone else: inside are an old brass key and a handwritten note with half an address. During this season he gets settled, reports the mix-up, and starts looking for the owner. Near the end of the season he learns the owner\'s name and a first meeting is arranged. Keep the tone light and curious, like a gentle mystery.',
    ordered: true,
    locations: [
      'On the plane, about to land: chatting with the passenger in the next seat and filling in the arrival card',
      'Passport control: the officer asks why you are visiting and how long you will stay',
      'Baggage claim: waiting for the suitcase and picking it up (the mix-up begins)',
      'Customs: "anything to declare?"',
      'Airport information desk: asking how to get to the city centre',
      'Buying a SIM card and changing some money at the airport',
      'Ticket machine and platform at the airport train station',
      'On the train into the city: asking another passenger for help',
      'Taxi ride to the hotel: small talk with the driver',
      'Hotel reception: check-in, breakfast times, wifi password',
      'The hotel room: realising the suitcase is not yours and opening it',
      'Calling the airline about the wrong suitcase',
      'Hotel front desk: towels, laundry and a problem with the heating',
      'First breakfast at the hotel buffet',
      'Going back to the airport lost-and-found office',
      'First walk in the city: asking a stranger for directions to a pharmacy',
      'Buying a travel card at a metro station',
      'A small café: ordering your first coffee and something to eat',
      'Phone shop: the SIM card does not work',
      'Tourist information office: showing the note and asking about the address',
      'Searching the address on the note with a map app and a local helper',
      'The post office: asking about stamps and sending a postcard',
      'A bakery in the morning: buying bread and pastries',
      'Evening at the hotel bar: chatting with the bartender',
      'Lost property office at the central station',
      'A neighbour in the hotel corridor who heard something strange',
      'A mysterious phone call for you at the hotel reception',
      'Taking a bus to the street written on the note',
      'Meeting the owner of a café on that street, who recognises the key',
      'Back at the hotel: the owner of the suitcase calls you'
    ]
  },
  {
    n: 2, it: 'Vita di tutti i giorni', en: 'Settling in',
    premise: 'The narrator meets the owner of the suitcase, who explains that the key belonged to a relative and opens something she has never found. While helping her search, he settles into daily life in the city: food, shops, transport, services, small talk with locals. End the season with a discovery that links the key to a place connected to a local museum.',
    locations: [
      'A restaurant: booking a table and ordering dinner', 'Paying the bill and splitting it with a friend',
      'Supermarket: finding things, asking about prices and bags', 'Pharmacy: asking for something for a cold',
      'Bank or cash machine: a card problem', 'Hairdresser or barber: explaining what you want',
      'Laundromat: how the machines work', 'Bus ride: buying a ticket and asking where to get off',
      'Asking for directions in the street', 'A farmers market: buying fruit and chatting with the seller',
      'A bookshop: asking for recommendations', 'A repair shop: fixing a broken phone screen',
      'A takeaway pizza: ordering by phone', 'An ice-cream shop on a hot afternoon',
      'A tailor: a jacket that does not fit', 'Calling the landlord about a leak',
      'Getting a library card', 'A street food stall at lunchtime', 'Renting a bike',
      'A coffee shop where you work on a laptop', 'A bus stop conversation about the weather',
      'A small family shop where the owner knows the old key', 'Cooking dinner in a shared kitchen'
    ]
  },
  {
    n: 3, it: 'Fuori e in giro', en: 'Out and about',
    premise: 'The search takes the narrator to places of leisure and culture: cinema, museum, gym, parks, concerts, markets. Each outing reveals one small clue about the key. The season ends with a locked door finally opened and a surprising object inside.',
    locations: [
      'Cinema: buying tickets, snacks and choosing seats', 'Museum: audio guide and asking about the exhibition',
      'Gym: signing up and asking about classes', 'Jogging in the park: meeting another runner',
      'Clothes shopping: sizes, fitting room and returns', 'A live music bar',
      'A day at the beach: renting an umbrella and asking about the sea', 'A hiking trail: weather, map and a lost walker',
      'A bike tour of the city', 'A guided city tour: asking the guide questions', 'An art gallery opening',
      'A souvenir shop', 'A sports match: tickets and the stadium', 'A theatre box office',
      'A swimming pool: changing room and rules', 'A boat trip on the river', 'A beginners yoga class',
      'A bowling night with new acquaintances', 'A comedy night: understanding jokes', 'A museum archive: asking to see old records'
    ]
  },
  {
    n: 4, it: 'Nuovi amici', en: 'New friends',
    premise: 'The narrator builds friendships while the investigation continues: language exchange meetups, parties, dinners with local families, flatmates. One of the new friends seems to know more than they say. Friendly, warm, full of small talk and invitations.',
    locations: [
      'A language exchange meetup: introducing yourself', 'A house party: small talk with strangers',
      'Dinner at a host family\'s home', 'A birthday party: gifts and congratulations',
      'A phone call inviting a new friend to lunch', 'Meeting the neighbours in the building',
      'Coffee with a friend of a friend', 'A flat viewing and talking to the flatmates',
      'A gym buddy: planning workouts together', 'Volunteering at a community event',
      'A barbecue in the garden', 'A board-game night with friends', 'A cooking class',
      'A weekend trip with new friends: the car journey', 'A long bus ride: talking about family and hobbies',
      'Giving and receiving compliments', 'A first coffee with a new friend: telling each other about your lives',
      'Helping a friend move house'
    ]
  },
  {
    n: 5, it: 'Quando le cose vanno storte', en: 'When things go wrong',
    premise: 'Things start going wrong: delays, lost belongings, illness, complaints, and someone else who is looking for the same object. The narrator has to solve problems in English under pressure, stay polite, and ask for help. Tension rises but the tone stays friendly.',
    locations: [
      'A missed train and finding another route', 'A flight delay: rebooking at the airline desk',
      'Losing your phone and reporting it', 'Feeling ill: the pharmacy and then the doctor',
      'A wrong order at a restaurant: a polite complaint', 'A hotel is overbooked: solving the problem',
      'A taxi fare misunderstanding', 'A lost wallet: calling the bank to block the cards',
      'A broken suitcase wheel', 'Heavy rain and changing plans', 'Getting lost in an unfamiliar neighbourhood',
      'Returning a faulty product to a shop', 'A car rental problem', 'Noisy neighbours: asking politely',
      'Missing the last bus at night', 'An important phone call with a bad signal',
      'A small accident at the gym', 'A misunderstanding with a friend', 'A power cut in the building'
    ]
  },
  {
    n: 6, it: 'Racconti e opinioni', en: 'Stories and opinions',
    premise: 'The narrator tells stories, gives opinions and makes plans, talking more about the past, feelings and the future. The central mystery of the key is solved in the final episodes. The season ends with a farewell and a surprising invitation.',
    locations: [
      'Telling a friend about your childhood', 'Describing your best holiday', 'Giving opinions about a film after the cinema',
      'Planning next year together', 'Giving advice to a nervous traveller', 'Comparing life in Italy with life here',
      'A friendly debate about food', 'Describing a person you admire', 'Talking about your job and daily routine',
      'A farewell dinner', 'Telling the story of the suitcase to a stranger', 'A radio interview about your trip',
      'Writing and reading a postcard', 'Talking about dreams and wishes', 'Remembering a mistake and what you learned',
      'The final reveal of the mystery', 'Goodbye at the airport'
    ]
  }
];

const EXTRA = {
  it: 'Nuove avventure', en: 'New journeys',
  premise: 'A new journey: the narrator travels to a different English-speaking country and meets new people. Mix every kind of travel situation (transport, hotels, restaurants, leisure, problems, friendships, opinions) with a light new mystery. Language is at B1 level moving gently towards B2.',
  locations: SEASONS.flatMap((s) => s.locations)
};

/** in quale stagione siamo, dopo `done` episodi completati */
export function seasonInfo(done) {
  const season = Math.floor(done / EPISODES_PER_SEASON) + 1;
  const index = done % EPISODES_PER_SEASON;
  const base = SEASONS[season - 1] || Object.assign({ n: season }, EXTRA);
  const r = index / (EPISODES_PER_SEASON - 1);
  const stage = r < 0.2 ? 'setup' : r < 0.6 ? 'development' : r < 0.85 ? 'rising tension' : 'resolution';
  return {
    season, index, total: EPISODES_PER_SEASON, stage,
    title_it: base.it, title_en: base.en, premise: base.premise,
    ordered: !!base.ordered, locations: base.locations, extra: !SEASONS[season - 1],
    opening: season === 1 && index === 0,
    finale: index === EPISODES_PER_SEASON - 1,
    number: done + 1
  };
}

/** sceglie l'ambientazione di oggi, evitando quelle viste da poco */
export function pickSetting(info, recent = [], rnd = Math.random) {
  if (info.ordered && info.index < info.locations.length) return info.locations[info.index];
  const fresh = info.locations.filter((l) => !recent.includes(l));
  const pool = fresh.length ? fresh : info.locations;
  return shuffle(pool, rnd)[0];
}

export const STAGE_GUIDE = {
  setup: 'Set up the situation and characters; plant a small hook or question.',
  development: 'Develop the plot with a small complication or a new clue; keep the pace friendly.',
  'rising tension': 'Raise the tension a little: a problem, a decision or a surprise; still light in tone.',
  resolution: 'Move towards resolving this season\'s thread; tie up loose ends but leave one open hook.'
};
