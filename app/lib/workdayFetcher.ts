import { WorkdayCompany } from "./companies";

export interface WorkdayJob {
  id: string;
  title: string;
  company: string;
  location: string;
  postedOn: string;
  url: string;
  jobType: string;
  remote: boolean;
  source: "workday";
  tenant: string;
  isNew?: boolean;
}

// A single, honest, identifying User-Agent.
//
// This client reads publicly accessible Workday career-site JSON — the same
// endpoints a company's own careers page calls from a visitor's browser.
// It identifies itself truthfully and does not attempt to evade rate limiting
// or bot detection. Please keep it that way.
const USER_AGENT =
  "WorkdayRadar/1.0 (+https://github.com/vasanthkumarpulkam/Workdayradar)";

function buildHeaders(cookie?: string): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;
  return headers;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Step 1: GET the public career page to obtain a session cookie.
// Some Workday tenants issue a session on first page load and require it on
// the jobs endpoint. This is the same handshake a browser performs.
async function fetchSessionCookie(
  company: WorkdayCompany
): Promise<string | null> {
  const url = `https://${company.tenant}.wd1.myworkdayjobs.com/en-US/${company.path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;

    // Extract key=value pairs, strip attributes
    const cookies = setCookie
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.includes("="))
      .join("; ");

    return cookies || null;
  } catch {
    return null;
  }
}

// Step 2: POST to the Workday jobs endpoint
async function queryWorkdayJobs(
  company: WorkdayCompany,
  searchTerms: string[],
  cookie: string | null,
  minutesWindow: number
): Promise<WorkdayJob[]> {
  const baseUrl = `https://${company.tenant}.wd1.myworkdayjobs.com/wday/cxs/${company.tenant}/${company.path}/jobs`;
  const cutoff = new Date(Date.now() - minutesWindow * 60 * 1000);
  const jobs: WorkdayJob[] = [];
  const seen = new Set<string>();

  const US_STATE_RE =
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;

  for (const term of searchTerms) {
    try {
      // Be a considerate client: pace requests to a single tenant.
      await delay(400);

      const body = JSON.stringify({
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: term,
      });

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: buildHeaders(cookie || undefined),
        body,
        signal: AbortSignal.timeout(8000),
      });

      // Back off rather than retry when a tenant rate-limits us.
      if (res.status === 429 || res.status === 503) return jobs;
      if (!res.ok) continue;

      const data = await res.json();
      const postings = data?.jobPostings ?? [];

      for (const p of postings) {
        const key = p.bulletFields?.[0] ?? p.title;
        if (seen.has(key)) continue;
        seen.add(key);

        const postedOn = p.postedOn ?? p.startDate ?? "";
        const postedDate = postedOn ? new Date(postedOn) : null;
        if (postedDate && postedDate < cutoff) continue;

        const locationStr: string =
          p.locationsText ?? p.locationText ?? p.locationHierarchyText ?? "";

        const isUS =
          locationStr === "" ||
          /united states|usa|remote|telecommute/i.test(locationStr) ||
          US_STATE_RE.test(locationStr);

        if (!isUS) continue;

        jobs.push({
          id: p.externalPath ?? `${company.tenant}-${p.title}-${postedOn}`,
          title: p.title ?? "Untitled",
          company: company.name,
          location: locationStr || "United States",
          postedOn,
          url: `https://${company.tenant}.wd1.myworkdayjobs.com/en-US/${
            company.path
          }${p.externalPath ?? ""}`,
          jobType: p.jobType ?? "Full time",
          remote: /remote/i.test(locationStr),
          source: "workday",
          tenant: company.tenant,
        });
      }
    } catch {
      // Skip this term for this tenant; never fail the whole run.
    }
  }

  return jobs;
}

// Main exported fetcher — handles both open and session-cookie tenants
export async function fetchWorkdayCompany(
  company: WorkdayCompany,
  searchTerms: string[],
  minutesWindow: number
): Promise<WorkdayJob[]> {
  let cookie: string | null = null;

  if (!company.open) {
    cookie = await fetchSessionCookie(company);
    await delay(400);
  }

  return queryWorkdayJobs(company, searchTerms, cookie, minutesWindow);
}
