/* =========================================================================
   Club name pool for the football pyramid.
   -------------------------------------------------------------------------
   Two divisions of 20 clubs = 40 slots. The user's club takes one of them,
   so 39+ AI names are required. Order is stable: changing it would change
   every existing save's division composition.
========================================================================= */

export const CLUBS: string[] = [
  // Historic tier-1 core (unchanged order — pre-v4 saves depend on it)
  "Dalton Town", "Ashford City", "Millbrook", "Northfield", "Redwood FC",
  "Kingsbridge", "Halewood United", "Stanmoor", "Fairwind", "Portlee",
  "Blackrock Athletic", "Silverdale", "Whitby Rangers", "Broadmarsh",
  "Ravencliff", "Elmshire", "Highgate", "Marston Vale", "Kingsley",
  "Sandborough", "Oakhaven", "Ridgeport",
  // Second-tier expansion
  "Thornbury", "Larkfield United", "Castleford Rovers", "Penhale",
  "Wexbridge", "Ironvale", "Merrow Athletic", "Draymoor",
  "Colverton", "Ashby Rangers", "Sea View United", "Nortonwood",
  "Beckwith", "Hollowfield", "Grangemouth City", "Verity Park",
  "Stonebridge", "Tarnbeck", "Duncastle", "Little Marsh FC",
  "Ferrisdale", "Oldcourt Wanderers",
];
