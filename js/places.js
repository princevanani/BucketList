// A built-in list of places so items can be put on the globe without any lookup service.
// Format per line:  Name | latitude | longitude | other names, separated by ;   (all matching is case-insensitive)
const RAW = `
Gujarat|22.6|71.7|
Ahmedabad|23.03|72.58|amdavad;sabarmati riverfront;sabarmati ashram;manek chowk;law garden;kankaria;adalaj
Gandhinagar|23.22|72.64|akshardham gandhinagar;science city
Surat|21.17|72.83|dumas;ubharat
Vadodara|22.31|73.18|baroda;laxmi vilas palace
Rajkot|22.3|70.8|
Bhavnagar|21.76|72.15|
Jamnagar|22.47|70.06|
Junagadh|21.52|70.46|girnar;mount girnar;uparkot
Gir|21.12|70.8|sasan gir;gir national park;gir forest
Somnath|20.89|70.4|somnath temple
Dwarka|22.24|68.97|dwarkadhish;bet dwarka
Porbandar|21.64|69.6|
Bhuj|23.25|69.67|kutch;kachchh;mandvi beach;mandvi
Rann of Kutch|23.85|69.9|white rann;dhordo;rann utsav;great rann
Dholavira|23.89|70.21|
Lothal|22.52|72.25|
Modhera|23.58|72.13|surya kund;sun temple modhera;modhera sun temple
Patan|23.85|72.12|rani ki vav
Palitana|21.52|71.82|shatrunjay;shatrunjaya
Pavagadh|22.46|73.53|champaner;champaner pavagadh
Statue of Unity|21.84|73.72|kevadia;ekta nagar;sardar sarovar
Saputara|20.57|73.75|dang;dangs
Daman|20.4|72.83|
Diu|20.71|70.99|
Dandi|20.89|72.81|dandi beach;dandi march
Velavadar|22.0|72.0|blackbuck national park;velavadar blackbuck
Nal Sarovar|22.8|72.0|
Vadnagar|23.78|72.64|
Ambaji|24.33|72.85|
Little Rann|23.3|71.5|little rann of kutch;wild ass sanctuary;dhrangadhra
Mount Abu|24.59|72.71|
Rajasthan|26.6|73.8|
Jaipur|26.91|75.79|amber fort;hawa mahal;pink city
Udaipur|24.58|73.71|lake pichola;city palace udaipur
Jodhpur|26.24|73.02|mehrangarh;blue city
Jaisalmer|26.92|70.9|sam sand dunes;thar desert;thar
Pushkar|26.49|74.55|pushkar camel fair
Ranthambore|26.02|76.5|
Bikaner|28.02|73.31|
Chittorgarh|24.88|74.63|
Delhi|28.61|77.21|new delhi;old delhi;chandni chowk;red fort;india gate;qutub minar
Agra|27.18|78.02|taj mahal;fatehpur sikri
Mathura|27.49|77.67|vrindavan;govardhan
Varanasi|25.32|82.97|banaras;benares;kashi;ganga aarti;dashashwamedh
Ayodhya|26.8|82.2|
Lucknow|26.85|80.95|
Amritsar|31.63|74.87|golden temple;wagah
Rishikesh|30.09|78.27|laxman jhula
Haridwar|29.95|78.16|
Kedarnath|30.74|79.07|char dham;badrinath;gangotri;yamunotri
Valley of Flowers|30.73|79.6|
Auli|30.53|79.57|
Nainital|29.38|79.46|
Jim Corbett|29.53|78.77|corbett
Uttarakhand|30.07|79.02|
Shimla|31.1|77.17|
Manali|32.24|77.19|rohtang;solang valley;atal tunnel
Spiti|32.25|78.0|spiti valley;kaza;chandratal;key monastery
Dharamshala|32.22|76.32|mcleodganj;triund
Himachal|31.9|77.2|himachal pradesh
Leh|34.16|77.58|ladakh;pangong;nubra;khardung la;magnetic hill
Srinagar|34.08|74.8|kashmir;dal lake;gulmarg;pahalgam
Chandigarh|30.73|76.78|
Punjab|31.1|75.3|
Mumbai|19.08|72.88|bombay;gateway of india;marine drive;juhu;chowpatty;elephanta
Pune|18.52|73.86|
Nashik|19.99|73.79|
Shirdi|19.77|74.48|
Ajanta|20.55|75.7|ellora;ajanta caves;ellora caves;aurangabad
Lonavala|18.75|73.41|
Maharashtra|19.7|75.7|
Goa|15.3|74.0|baga;anjuna;panjim;old goa
Hampi|15.34|76.46|
Bengaluru|12.97|77.59|bangalore
Mysuru|12.3|76.64|mysore;mysore palace
Coorg|12.42|75.74|kodagu
Gokarna|14.55|74.32|
Karnataka|14.5|75.7|
Kochi|9.93|76.27|cochin;fort kochi
Munnar|10.09|77.06|
Alleppey|9.5|76.34|alappuzha;kerala backwaters;backwaters;alleppey houseboat
Kerala|10.5|76.4|wayanad;varkala;thekkady
Chennai|13.08|80.27|madras;marina beach
Pondicherry|11.93|79.83|puducherry;auroville
Madurai|9.92|78.12|meenakshi temple
Rameswaram|9.29|79.31|
Kanyakumari|8.08|77.55|
Ooty|11.41|76.7|
Tamil Nadu|11.1|78.4|
Hyderabad|17.38|78.49|charminar;golconda;ramoji film city
Tirupati|13.63|79.42|tirumala
Visakhapatnam|17.69|83.22|vizag;araku
Kolkata|22.57|88.36|calcutta;howrah;victoria memorial
Darjeeling|27.04|88.26|
Gangtok|27.33|88.61|sikkim;nathula;tsomgo
Shillong|25.57|91.88|meghalaya;cherrapunji;mawlynnong;living root bridge
Kaziranga|26.58|93.17|
Tawang|27.59|91.86|arunachal
Guwahati|26.14|91.74|assam;majuli
Jagannath Puri|19.81|85.83|konark;jagannath;chilika;puri odisha;puri rath yatra;puri beach
Bhubaneswar|20.3|85.82|odisha
Bodh Gaya|24.7|84.99|bihar;nalanda
Khajuraho|24.85|79.93|
Ujjain|23.18|75.78|mahakaleshwar
Bhopal|23.26|77.41|sanchi
Indore|22.72|75.86|
Kanha|22.33|80.61|bandhavgarh;pench;madhya pradesh;satpura
Raipur|21.25|81.63|chhattisgarh
Andaman|11.7|92.7|havelock;port blair;neil island;radhanagar
Lakshadweep|10.57|72.64|
India|22.9|79.0|
Kathmandu|27.72|85.32|nepal;pokhara;everest base camp;annapurna;lumbini
Mount Everest|27.99|86.93|everest
Thimphu|27.47|89.64|bhutan;paro;tiger's nest;tigers nest
Colombo|6.93|79.86|sri lanka;kandy;ella;sigiriya;galle
Maldives|4.18|73.51|
Dhaka|23.81|90.41|bangladesh
Bangkok|13.76|100.5|thailand;chiang mai;krabi;phi phi
Phuket|7.88|98.39|
Hanoi|21.03|105.85|vietnam;ha long bay;halong bay;ho chi minh;saigon;hoi an;da nang
Siem Reap|13.36|103.86|angkor wat;angkor;cambodia
Luang Prabang|19.89|102.13|laos
Singapore|1.35|103.82|
Kuala Lumpur|3.14|101.69|malaysia;petronas;langkawi
Bali|-8.41|115.19|indonesia;ubud;borobudur;jakarta;komodo
Manila|14.6|120.98|philippines;palawan;el nido
Tokyo|35.68|139.69|japan;mount fuji;fuji;shibuya
Kyoto|35.01|135.77|osaka;nara;hiroshima
Seoul|37.57|126.98|south korea;korea;jeju
Beijing|39.9|116.4|china;great wall;forbidden city;shanghai;xi'an;terracotta
Hong Kong|22.32|114.17|macau
Taipei|25.03|121.57|taiwan
Lhasa|29.65|91.12|tibet;kailash;mount kailash;mansarovar
Ulaanbaatar|47.89|106.91|mongolia;gobi
Dubai|25.2|55.27|uae;united arab emirates;burj khalifa;desert safari
Abu Dhabi|24.45|54.38|sheikh zayed
Muscat|23.59|58.41|oman
Doha|25.29|51.53|qatar
Mecca|21.42|39.83|saudi arabia;medina;hajj;umrah
Petra|30.33|35.44|jordan;wadi rum;dead sea
Jerusalem|31.77|35.21|israel;tel aviv
Istanbul|41.01|28.98|turkey;hagia sophia;bosphorus
Cappadocia|38.64|34.83|goreme;hot air balloon cappadocia
Cairo|30.04|31.24|egypt;pyramids;giza;luxor;nile;sphinx
Marrakech|31.63|-8.0|morocco;sahara;fes;chefchaouen
Masai Mara|-1.5|35.14|kenya;nairobi;maasai mara
Serengeti|-2.33|34.83|tanzania;ngorongoro
Kilimanjaro|-3.07|37.35|
Zanzibar|-6.17|39.2|
Cape Town|-33.92|18.42|south africa;table mountain;kruger;johannesburg
Victoria Falls|-17.92|25.86|zimbabwe;zambia
Madagascar|-18.9|47.5|
Mauritius|-20.3|57.58|
Seychelles|-4.68|55.49|
Paris|48.86|2.35|france;eiffel tower;eiffel;louvre;versailles;provence
London|51.51|-0.13|england;big ben;uk;united kingdom;stonehenge
Rome|41.9|12.5|italy;colosseum;vatican;pompeii;amalfi;sicily
Venice|45.44|12.32|gondola
Florence|43.77|11.26|tuscany;pisa
Milan|45.46|9.19|lake como
Zurich|47.38|8.54|switzerland;interlaken;jungfraujoch;lucerne;zermatt;matterhorn;swiss alps;geneva
Vienna|48.21|16.37|austria;salzburg;hallstatt
Berlin|52.52|13.4|germany;munich;black forest;neuschwanstein
Amsterdam|52.37|4.9|netherlands;holland;tulip;keukenhof
Brussels|50.85|4.35|belgium
Barcelona|41.39|2.17|spain;sagrada familia;madrid;seville;granada;ibiza
Lisbon|38.72|-9.14|portugal;porto
Santorini|36.39|25.46|greece;athens;mykonos;acropolis;crete
Prague|50.08|14.44|czech republic;czechia
Budapest|47.5|19.04|hungary
Reykjavik|64.15|-21.94|iceland;blue lagoon
Tromso|69.65|18.96|norway;oslo;lofoten;fjords;fjord
Stockholm|59.33|18.07|sweden
Rovaniemi|66.5|25.73|finland;lapland;helsinki;santa claus village
Copenhagen|55.68|12.57|denmark
Edinburgh|55.95|-3.19|scotland;highlands;loch ness
Dublin|53.35|-6.26|ireland
Moscow|55.76|37.62|russia;st petersburg;saint petersburg;trans-siberian;siberia
Dubrovnik|42.65|18.09|croatia;plitvice
Warsaw|52.23|21.01|poland;krakow
New York|40.71|-74.0|nyc;statue of liberty;times square;central park;new york city
Washington|38.9|-77.04|white house
Boston|42.36|-71.06|
Chicago|41.88|-87.63|
Los Angeles|34.05|-118.24|hollywood;california;disneyland;yosemite;route 66
San Francisco|37.77|-122.42|golden gate;silicon valley
Las Vegas|36.17|-115.14|
Grand Canyon|36.1|-112.11|arizona;antelope canyon;horseshoe bend;monument valley
Yellowstone|44.43|-110.59|
Hawaii|20.8|-156.3|honolulu;maui;kauai
Alaska|64.2|-149.5|denali
Orlando|28.54|-81.38|florida;miami;disney world;everglades
USA|39.8|-98.6|united states;america
Toronto|43.65|-79.38|niagara falls;niagara;canada;vancouver;montreal
Banff|51.18|-115.57|rocky mountains;rockies;lake louise;jasper
Cancun|21.16|-86.85|mexico;chichen itza;tulum
Mexico City|19.43|-99.13|cdmx
Havana|23.11|-82.37|cuba
Costa Rica|9.75|-83.75|
Machu Picchu|-13.16|-72.55|peru;cusco;inca trail;lima;rainbow mountain
Rio de Janeiro|-22.91|-43.17|brazil;amazon;christ the redeemer;iguazu
Buenos Aires|-34.6|-58.38|argentina
Patagonia|-50.5|-72.5|torres del paine;ushuaia;el calafate;perito moreno
Atacama|-23.65|-68.2|chile;santiago
Salar de Uyuni|-20.13|-67.49|uyuni;bolivia
Galapagos|-0.74|-90.31|ecuador
Sydney|-33.87|151.21|australia;opera house;melbourne;great ocean road;blue mountains
Great Barrier Reef|-18.29|147.7|cairns;whitsundays
Uluru|-25.34|131.03|ayers rock;red centre
Queenstown|-45.03|168.66|new zealand;milford sound;auckland;wellington;rotorua;hobbiton
Fiji|-17.7|178.0|
Bora Bora|-16.5|-151.74|tahiti;french polynesia
Antarctica|-77.8|166.7|south pole
North Pole|89.5|0|arctic
`;

const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9À-ɏ]+/g, ' ').trim() + ' ';

export const PLACES = [];
const aliasIndex = []; // [paddedAlias, place]
for (const line of RAW.trim().split('\n')) {
  const [name, lat, lng, alt = ''] = line.split('|');
  const p = { name: name.trim(), lat: +lat, lng: +lng };
  PLACES.push(p);
  for (const a of [name, ...alt.split(';')]) {
    const n = norm(a);
    if (n.trim().length >= 3) aliasIndex.push([n, p]);
  }
}
aliasIndex.sort((a, b) => b[0].length - a[0].length); // longest (most specific) first

// Find the most specific known place mentioned in some text, or null.
export function locate(text) {
  if (!text) return null;
  const t = norm(text);
  for (const [alias, place] of aliasIndex) if (t.includes(alias)) return place;
  return null;
}

// Search used by the place picker.
export function searchPlaces(q, limit = 8) {
  const t = norm(q).trim();
  if (t.length < 2) return [];
  const out = [];
  for (const p of PLACES) if (norm(p.name).includes(t)) out.push(p);
  return out.slice(0, limit);
}

// Online lookup for places that are not in the list (OpenStreetMap Nominatim). Fails quietly.
export async function geocodeOnline(q) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j[0]) return null;
    return { name: (j[0].display_name || q).split(',')[0], lat: +j[0].lat, lng: +j[0].lon };
  } catch {
    return null;
  }
}

// Type-ahead search over the whole world: OpenStreetMap Nominatim and Photon together (Photon is better at half-typed
// names). Returns up to `limit` {name, label, lat, lng}, duplicates removed. Either service may fail quietly.
async function nominatim(q, limit) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&accept-language=en&limit=' + limit + '&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  return (await r.json()).map((x) => {
    const parts = (x.display_name || '').split(',').map((t) => t.trim());
    return { name: parts[0] || q, label: parts.length > 3 ? [parts[0], parts[1], parts[parts.length - 1]].join(', ') : parts.join(', '), lat: +x.lat, lng: +x.lon };
  });
}
async function photon(q, limit) {
  const r = await fetch('https://photon.komoot.io/api/?lang=en&limit=' + limit + '&q=' + encodeURIComponent(q));
  if (!r.ok) return [];
  return (await r.json()).features.map((f) => {
    const p = f.properties || {};
    const name = p.name || p.street || q;
    const label = [name, p.district || p.city || p.county, p.state, p.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
    return { name, label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  });
}
export async function searchOnline(q, limit = 10) {
  const [a, b] = await Promise.all([nominatim(q, limit).catch(() => []), photon(q, limit).catch(() => [])]);
  const out = [];
  const seen = [];
  for (const r of [...b, ...a]) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    if (seen.some((s) => s.label === r.label.toLowerCase() || (Math.abs(s.lat - r.lat) < 0.0005 && Math.abs(s.lng - r.lng) < 0.0005))) continue;
    seen.push({ label: r.label.toLowerCase(), lat: r.lat, lng: r.lng });
    out.push(r);
  }
  return out.slice(0, limit);
}
