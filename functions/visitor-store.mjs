const DAY = 86_400_000;
const HEX = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function validPoint(point) {
  if (!point || !/^[A-Z]{2}:\d{1,2}:\d{1,2}$/.test(point.id)) return false;
  const [countryCode, lat, lon] = point.id.split(':');
  const country = countryNames.of(countryCode);
  return country && country !== countryCode && countryCode === point.countryCode
    && Number(lat) <= 35 && Number(lon) <= 71
    && point.lat === Number(lat) * 5 - 87.5 && point.lon === Number(lon) * 5 - 177.5;
}

// Admin SDK only: browser clients must have no direct collection access.
// Enable Firestore TTL on expiresAt for visitor_days and visitor_seen. Queries
// enforce the public retention window even while asynchronous TTL is pending.
export function createVisitorStore({ db, retentionDays = 7, maxDailyVisits = 2500, maxRegionsPerDay = 200 } = {}) {
  if (!db || typeof db.runTransaction !== 'function') throw new Error('Visitor database is not configured.');
  const days = db.collection('visitor_days');
  const seen = db.collection('visitor_seen');
  return {
    async recordVisit({ visitorId, day, point, now }) {
      if (!HEX.test(visitorId) || !DATE.test(day) || day !== new Date(now).toISOString().slice(0, 10) || !validPoint(point)) throw new Error('Invalid visitor record.');
      const dayStart = Date.parse(day);
      const seenRef = seen.doc(`${day}_${visitorId}`);
      const dayRef = days.doc(day);
      return db.runTransaction(async transaction => {
        // All reads precede writes, including on transaction retries.
        const [seenDocument, dayDocument] = await Promise.all([transaction.get(seenRef), transaction.get(dayRef)]);
        if (seenDocument.exists) return { recorded: false };
        const value = dayDocument.exists ? dayDocument.data() : {};
        const count = Number.isSafeInteger(value.total) ? value.total : 0;
        const regions = value.regions && typeof value.regions === 'object' ? { ...value.regions } : {};
        if (count >= maxDailyVisits || !Object.hasOwn(regions, point.id) && Object.keys(regions).length >= maxRegionsPerDay) return { recorded: false, limited: true };
        const previous = regions[point.id];
        regions[point.id] = {
          id: point.id, country: countryNames.of(point.countryCode), countryCode: point.countryCode,
          lat: point.lat, lon: point.lon,
          visits: (Number.isSafeInteger(previous?.visits) ? previous.visits : 0) + 1,
        };
        transaction.set(seenRef, { expiresAt: new Date(dayStart + 2 * DAY) });
        transaction.set(dayRef, {
          day, total: count + 1, regions,
          expiresAt: new Date(dayStart + retentionDays * DAY),
        });
        return { recorded: true };
      }, { maxAttempts: 3 });
    },
    async listPoints({ since, limit = 100, now }) {
      if (!DATE.test(since) || !Number.isFinite(now)) throw new Error('Invalid visitor query.');
      const today = new Date(now).toISOString().slice(0, 10);
      const earliest = new Date(Date.parse(today) - (retentionDays - 1) * DAY).toISOString().slice(0, 10);
      const cutoff = since < earliest ? earliest : since;
      const snapshot = await days.where('day', '>=', cutoff).where('day', '<=', today).orderBy('day', 'desc').limit(retentionDays).get();
      const points = new Map();
      let totalVisits = 0;
      for (const document of snapshot.docs) {
        const value = document.data();
        // Revalidate retention even if a mocked/misconfigured query returns an
        // old document. Do not return TTL-pending expired data.
        const expiresAt = typeof value.expiresAt?.toMillis === 'function' ? value.expiresAt.toMillis() : value.expiresAt instanceof Date ? value.expiresAt.getTime() : 0;
        if (!DATE.test(value.day) || value.day < cutoff || value.day > today || expiresAt <= now) continue;
        if (Number.isSafeInteger(value.total) && value.total > 0) totalVisits += Math.min(maxDailyVisits, value.total);
        const regions = value.regions && typeof value.regions === 'object' ? Object.values(value.regions).slice(0, maxRegionsPerDay) : [];
        for (const point of regions) {
          if (!validPoint(point) || !Number.isSafeInteger(point.visits) || point.visits <= 0) continue;
          const previous = points.get(point.id);
          points.set(point.id, { id: point.id, country: countryNames.of(point.countryCode), countryCode: point.countryCode,
            lat: point.lat, lon: point.lon, label: countryNames.of(point.countryCode),
            visits: (previous?.visits || 0) + Math.min(maxDailyVisits, point.visits) });
        }
      }
      return { totalVisits, points: [...points.values()].sort((a, b) => b.visits - a.visits || a.id.localeCompare(b.id)).slice(0, Math.min(100, Math.max(1, limit))) };
    },
  };
}
