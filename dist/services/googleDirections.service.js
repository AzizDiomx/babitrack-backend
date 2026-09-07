"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeGooglePolyline = decodeGooglePolyline;
exports.getRouteRoadGeometry = getRouteRoadGeometry;
/**
 * Decode Google's Encoded Polyline String to [lat, lng] coordinates array
 */
function decodeGooglePolyline(encoded) {
    const points = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;
    while (index < len) {
        let b;
        let shift = 0;
        let result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
        lng += dlng;
        points.push([parseFloat((lat / 1e5).toFixed(6)), parseFloat((lng / 1e5).toFixed(6))]);
    }
    return points;
}
/**
 * Calculates high-precision road geometry using Google Maps Directions API
 * Falls back to high-resolution segment-snapped path if API Key is not set or fails.
 */
async function getRouteRoadGeometry(stops) {
    if (!stops || stops.length < 2)
        return [];
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
        try {
            const origin = `${stops[0].latitude},${stops[0].longitude}`;
            const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
            let waypointsParam = '';
            if (stops.length > 2) {
                const waypoints = stops.slice(1, -1).map((s) => `via:${s.latitude},${s.longitude}`).join('|');
                waypointsParam = `&waypoints=${encodeURIComponent(waypoints)}`;
            }
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&key=${apiKey}&language=fr`;
            const response = await fetch(url);
            const data = (await response.json());
            if (data.status === 'OK' && data.routes && data.routes.length > 0) {
                const encodedPoints = data.routes[0].overview_polyline.points;
                const decoded = decodeGooglePolyline(encodedPoints);
                if (decoded.length > 0)
                    return decoded;
            }
        }
        catch (err) {
            console.error('[Google Directions] Erreur lors de la récupération de la route Google:', err);
        }
    }
    // Fallback: Segment-by-segment OSRM / Linear road coordinates
    const fallbackPath = [];
    for (let i = 0; i < stops.length - 1; i++) {
        const s1 = stops[i];
        const s2 = stops[i + 1];
        try {
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${s1.longitude},${s1.latitude};${s2.longitude},${s2.latitude}?overview=full&geometries=geojson&radiuses=500;500`;
            const res = await fetch(osrmUrl);
            const data = (await res.json());
            if (data?.code === 'Ok' && data?.routes?.[0]?.geometry?.coordinates) {
                const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                fallbackPath.push(...coords);
            }
            else {
                fallbackPath.push([s1.latitude, s1.longitude], [s2.latitude, s2.longitude]);
            }
        }
        catch (err) {
            fallbackPath.push([s1.latitude, s1.longitude], [s2.latitude, s2.longitude]);
        }
    }
    return fallbackPath.length > 0 ? fallbackPath : stops.map((s) => [s.latitude, s.longitude]);
}
