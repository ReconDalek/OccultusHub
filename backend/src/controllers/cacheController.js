import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

export async function getFactionCache(request, env) {
  try {
    const factions = await env.DB.prepare(
      `SELECT faction_id, data, fetched_at, error FROM faction_cache ORDER BY faction_id`
    ).all();

    if (!factions.results || factions.results.length === 0) {
      return jsonResponse({ data: [], lastUpdated: null });
    }

    const data = factions.results.map((row) => {
      try {
        return JSON.parse(row.data);
      } catch {
        return null;
      }
    }).filter(Boolean);

    const latestFetch = factions.results.reduce((latest, row) => {
      return row.fetched_at && (!latest || row.fetched_at > latest) ? row.fetched_at : latest;
    }, null);

    return jsonResponse({ data, lastUpdated: latestFetch || null });
  } catch (error) {
    console.error('Error fetching faction cache:', error);
    return errorResponse('Failed to fetch faction cache', 500);
  }
}

function normalizeCompany(raw) {
  // v2 API format (new): { profile: {...}, employees: [...] }
  if (raw.profile) return raw;

  // v1 API format (legacy cache): { company: {...}, company_employees: {...} }
  // - director is a plain integer ID, name lives in company.employees[directorId]
  // - company_type is a plain integer (no name available)
  // - income fields are daily_income / weekly_income
  // - employee position is a plain string
  const c = raw.company || {};
  const directorId   = c.director;
  const directorName = directorId && c.employees
    ? (c.employees[String(directorId)]?.name || null)
    : null;

  return {
    profile: {
      id:       c.ID,
      name:     c.name,
      type:     { name: c.company_type_name || null },
      rating:   c.rating,
      director: { id: directorId, name: directorName },
      employees: { hired: c.employees_hired, capacity: c.employees_capacity },
      income:    { daily: c.daily_income, weekly: c.weekly_income },
    },
    employees: Object.entries(raw.company_employees || {}).map(([id, emp]) => ({
      id:          parseInt(id),
      name:        emp.name,
      position:    { name: emp.position },
      last_action: emp.last_action,
    })),
  };
}

export async function getCompanyCache(request, env) {
  try {
    const companies = await env.DB.prepare(
      `SELECT company_id, data, fetched_at, error FROM company_cache ORDER BY company_id`
    ).all();

    if (!companies.results || companies.results.length === 0) {
      return jsonResponse({ companies: [], lastUpdated: null });
    }

    const data = companies.results.map((row) => {
      try {
        return normalizeCompany(JSON.parse(row.data));
      } catch {
        return null;
      }
    }).filter(Boolean);

    const latestFetch = companies.results.reduce((latest, row) => {
      return new Date(row.fetched_at) > new Date(latest) ? row.fetched_at : latest;
    }, companies.results[0]?.fetched_at);

    return jsonResponse({
      companies: data,
      lastUpdated: latestFetch || null
    });
  } catch (error) {
    console.error('Error fetching company cache:', error);
    return errorResponse('Failed to fetch company cache', 500);
  }
}
