export type CampusLocationCategory = "Student life" | "Academic" | "Residence" | "Dining" | "Recreation" | "Outdoors";

export type CampusLocation = {
  id: string;
  name: string;
  address: string;
  category: CampusLocationCategory;
  point: { lat: number; lng: number };
  sourceObjectId: number;
};

/**
 * Curated demo destinations from Virginia Tech Facilities' public campus GIS.
 * Points are building reference points, not entrances or verified pickup curbs.
 */
export const CAMPUS_LOCATIONS = [
  { id: "newman-library", name: "Newman Library", address: "560 Drillfield Dr", category: "Student life", point: { lat: 37.2287881, lng: -80.41916034 }, sourceObjectId: 36451 },
  { id: "squires-student-center", name: "Squires Student Center", address: "290 College Ave", category: "Student life", point: { lat: 37.22960669, lng: -80.41793863 }, sourceObjectId: 36457 },
  { id: "graduate-life-center", name: "Graduate Life Center", address: "155 Otey St", category: "Student life", point: { lat: 37.22828939, lng: -80.4175766 }, sourceObjectId: 36445 },
  { id: "burruss-hall", name: "Burruss Hall", address: "800 Drillfield Dr", category: "Academic", point: { lat: 37.22893256, lng: -80.42360038 }, sourceObjectId: 36455 },
  { id: "torgersen-hall", name: "Torgersen Hall", address: "620 Drillfield Dr", category: "Academic", point: { lat: 37.22973815, lng: -80.42006484 }, sourceObjectId: 36459 },
  { id: "goodwin-hall", name: "Goodwin Hall", address: "635 Prices Fork Rd", category: "Academic", point: { lat: 37.23231294, lng: -80.42581866 }, sourceObjectId: 36423 },
  { id: "derring-hall", name: "Derring Hall", address: "926 West Campus Dr", category: "Academic", point: { lat: 37.229089, lng: -80.42559413 }, sourceObjectId: 36633 },
  { id: "pamplin-hall", name: "Pamplin Hall", address: "880 West Campus Dr", category: "Academic", point: { lat: 37.22865901, lng: -80.42466589 }, sourceObjectId: 36450 },
  { id: "davidson-hall", name: "Davidson Hall", address: "1040 Drillfield Dr", category: "Academic", point: { lat: 37.22705711, lng: -80.42519679 }, sourceObjectId: 36438 },
  { id: "whittemore-hall", name: "Whittemore Hall", address: "1185 Perry St", category: "Academic", point: { lat: 37.23102179, lng: -80.42444418 }, sourceObjectId: 36473 },
  { id: "holden-hall", name: "Holden Hall", address: "445 Old Turner St", category: "Academic", point: { lat: 37.23019404, lng: -80.42234731 }, sourceObjectId: 36855 },
  { id: "classroom-building", name: "Classroom Building", address: "1455 Perry St", category: "Academic", point: { lat: 37.22936464, lng: -80.42696174 }, sourceObjectId: 36626 },
  { id: "moss-arts-center", name: "Moss Arts Center", address: "190 Alumni Mall", category: "Academic", point: { lat: 37.23188113, lng: -80.41814971 }, sourceObjectId: 36414 },
  { id: "pritchard-hall", name: "Pritchard Hall", address: "630 Washington St", category: "Residence", point: { lat: 37.22424955, lng: -80.41965644 }, sourceObjectId: 36379 },
  { id: "eggleston-east", name: "Eggleston Hall — East", address: "500 Drillfield Dr", category: "Residence", point: { lat: 37.22765463, lng: -80.41937331 }, sourceObjectId: 36440 },
  { id: "slusher-hall", name: "Slusher Hall", address: "201 Ag Quad Ln", category: "Residence", point: { lat: 37.22532323, lng: -80.42175979 }, sourceObjectId: 36395 },
  { id: "ambler-johnston-east", name: "Ambler Johnston — East", address: "700 Washington St", category: "Residence", point: { lat: 37.22317413, lng: -80.42076781 }, sourceObjectId: 36371 },
  { id: "new-hall-west", name: "New Hall West", address: "190 West Campus Dr", category: "Residence", point: { lat: 37.22223872, lng: -80.42257584 }, sourceObjectId: 36352 },
  { id: "payne-hall", name: "Payne Hall", address: "600 Washington St", category: "Residence", point: { lat: 37.22581416, lng: -80.42000304 }, sourceObjectId: 36400 },
  { id: "oshaughnessy-hall", name: "O'Shaughnessy Hall", address: "530 Washington St", category: "Residence", point: { lat: 37.22538164, lng: -80.41831937 }, sourceObjectId: 36405 },
  { id: "harper-hall", name: "Harper Hall", address: "240 West Campus Dr", category: "Residence", point: { lat: 37.22268992, lng: -80.42307751 }, sourceObjectId: 36357 },
  { id: "hillcrest-hall", name: "Hillcrest Hall", address: "385 West Campus Dr", category: "Residence", point: { lat: 37.22385116, lng: -80.42496115 }, sourceObjectId: 36367 },
  { id: "dietrick-hall", name: "Dietrick Hall", address: "285 Ag Quad Ln", category: "Dining", point: { lat: 37.22453128, lng: -80.42111726 }, sourceObjectId: 36385 },
  { id: "owens-hall", name: "Owens Hall", address: "150 Kent St", category: "Dining", point: { lat: 37.22670768, lng: -80.41889259 }, sourceObjectId: 36434 },
  { id: "mccomas-hall", name: "McComas Hall", address: "895 Washington St", category: "Recreation", point: { lat: 37.22014524, lng: -80.42248502 }, sourceObjectId: 36614 },
  { id: "lane-stadium", name: "Lane Stadium", address: "185 Beamer Way", category: "Recreation", point: { lat: 37.22002562, lng: -80.41724539 }, sourceObjectId: 36700 },
  { id: "cassell-coliseum", name: "Cassell Coliseum", address: "675 Washington St", category: "Recreation", point: { lat: 37.2225473, lng: -80.41897748 }, sourceObjectId: 36358 },
  { id: "war-memorial-gym", name: "War Memorial Gym", address: "370 Drillfield Dr", category: "Recreation", point: { lat: 37.22633619, lng: -80.42065948 }, sourceObjectId: 36431 },
  { id: "hahn-garden", name: "Hahn Horticulture Garden", address: "200 Garden Ln", category: "Outdoors", point: { lat: 37.21918002, lng: -80.42416749 }, sourceObjectId: 36600 },
  { id: "duck-pond", name: "Duck Pond", address: "806 Duck Pond Dr", category: "Outdoors", point: { lat: 37.22502549, lng: -80.42897421 }, sourceObjectId: 36291 },
] as const satisfies readonly CampusLocation[];

export const DEFAULT_FROM_LOCATION_ID = "newman-library";
export const DEFAULT_TO_LOCATION_ID = "pritchard-hall";
export const CAMPUS_LOCATION_SOURCE_URL = "https://arcgis-central-prod.aws.gis.cloud.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0";

const locationsById = new Map<string, CampusLocation>(CAMPUS_LOCATIONS.map(location => [location.id, location]));

export function campusLocation(id: string): CampusLocation {
  return locationsById.get(id) ?? locationsById.get(DEFAULT_FROM_LOCATION_ID)!;
}

export type CampusRouteSelection = { from: CampusLocation; to: CampusLocation };
