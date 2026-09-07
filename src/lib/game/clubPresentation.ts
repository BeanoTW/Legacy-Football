/**
 * Presentation-only aliases for the fictional football world.
 *
 * Persisted club identities and save-sensitive source names must never change.
 * These aliases make the world feel recognisably English without storing or
 * migrating different club keys.
 */
const CLUB_PRESENTATION_ALIASES: Record<string, string> = {
  "Ashford City": "Monchester City",
  "Millbrook": "Monchester United",
  "Northfield": "Liverford",
  "Redwood FC": "Arsenham",
  "Kingsbridge": "Chelsey",
  "Halewood United": "Tottenhall Hotspur",
  "Stanmoor": "Newcastle Town",
  "Fairwind": "Aston Vale",
  "Portlee": "Brighton Albion",
  "Blackrock Athletic": "Westham United",
  "Silverdale": "Crystal Park",
  "Whitby Rangers": "Everton Vale",
  "Broadmarsh": "Fulham Borough",
  "Ravencliff": "Wolverton Wanderers",
  "Elmshire": "Nottingham Wood",
  "Highgate": "Brentford Town",
  "Marston Vale": "Bournemouth Athletic",
  "Kingsley": "Leicester City",
  "Sandborough": "Ipswich Town",
  "Oakhaven": "Southampton Athletic",

  "Thornbury": "Leeds City",
  "Larkfield United": "Sheffield United",
  "Castleford Rovers": "Middlesborough",
  "Penhale": "Sunderland Town",
  "Wexbridge": "Blackburn Rovers",
  "Ironvale": "West Bromwich",
  "Merrow Athletic": "Coventry City",
  "Draymoor": "Norwich City",
  "Colverton": "Watford Town",
  "Ashby Rangers": "Queens Park Rangers",

  "Banbury Cross": "Banbury United",
  "Brackley Borough": "Brackley Town",
  "Kettering Athletic": "Kettering Town",
  "Stourbridge Town": "Stourbridge",
  "Redditch Borough": "Redditch United",
  "Stratford Athletic": "Stratford Town",
  "Halesowen FC": "Halesowen Town",
  "Bedford Borough": "Bedford Town",
  "Stamford Town": "Stamford AFC",
  "Spalding Athletic": "Spalding United",
  "Leamington Vale": "Leamington FC",
  "Nuneaton Borough": "Nuneaton Town",
  "Bromsgrove Athletic": "Bromsgrove Sporting",
  "Coalville Town": "Coalville",
  "Harborough United": "Harborough Town",
};

export function clubPresentationName(sourceName: string): string {
  return CLUB_PRESENTATION_ALIASES[sourceName] ?? sourceName;
}
