// server/fixtures/demoFixtures.js
// Seed data for the one-laptop demo, deliberately kept in one place so it is
// obvious what is fixture and what is real application state.
//
// These values are demo data, not hardcoded UI strings: the responder's
// distance and ETA below are computed from these coordinates, so the numbers
// on screen come from arithmetic on stored fields rather than a literal
// "0.4 miles" baked into a component.

// Used when a victim's browser gives us no coordinates, so the demo still
// shows a plausible distance. Marked with `source` so it is never mistaken
// for a real fix.
const DEMO_LOCATION = {
  latitude: 29.7174,
  longitude: -95.4018,
  address: "Rice University area, Houston, TX",
  source: "demo-fixture",
};

// Roughly 0.4 miles north of DEMO_LOCATION.
const DEMO_RESPONDER = {
  id: "demo_responder_01",
  name: "Jordan",
  verified: true,
  latitude: 29.7232,
  longitude: -95.4018,
};

// Assumed average speed for a responder reaching the scene, in mph. Chosen to
// be pessimistic enough to be believable on foot or through traffic.
const RESPONSE_SPEED_MPH = 6;

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

// Haversine great-circle distance in miles.
function distanceMilesBetween(a, b) {
  const latDiff = toRadians(b.latitude - a.latitude);
  const lngDiff = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(lngDiff / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Builds the responder record attached to an accepted request.
 *
 * Distance and ETA are computed from the request's own coordinates when it
 * has them. A request with no location yields nulls rather than invented
 * numbers: the responder still accepts, the card just omits the distance.
 */
function buildDemoResponder(request) {
  const responder = {
    id: DEMO_RESPONDER.id,
    name: DEMO_RESPONDER.name,
    verified: DEMO_RESPONDER.verified,
    distanceMiles: null,
    etaMinutes: null,
  };

  const hasLocation =
    request &&
    typeof request.latitude === "number" &&
    typeof request.longitude === "number";

  if (hasLocation) {
    const miles = distanceMilesBetween(
      { latitude: request.latitude, longitude: request.longitude },
      DEMO_RESPONDER
    );
    responder.distanceMiles = Math.round(miles * 10) / 10;
    responder.etaMinutes = Math.max(1, Math.round((miles / RESPONSE_SPEED_MPH) * 60));
  }

  return responder;
}

module.exports = {
  DEMO_LOCATION,
  DEMO_RESPONDER,
  RESPONSE_SPEED_MPH,
  distanceMilesBetween,
  buildDemoResponder,
};
