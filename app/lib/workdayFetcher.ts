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

// Rotating user-agents to avoid IP/bot detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Stealth headers that mimic a real browser visiting a careers page
function buildHeaders(cookie?: string): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": randomUA(),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    // Forwarded IP headers — rotates through a range to spread requests
    "X-Forwarded-For": randomIP(),
    "X-Real-IP": randomIP(),
  };
  if (cookie) headers["Cookie"] = cookie;
  return headers;
}

function randomIP(): string {
  const ranges = [
    [72, 21],   // AWS us-east
    [54, 80],   // AWS us-west
    [104, 196], // GCP
    [13, 107],  // Azure
    [34, 102],  // GCP 2
  ];
  const [a, b] = ranges[Math.floor(Math.random() * ranges.length)];
  return `${a}.${b}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Step 1: GET the career page to retrieve session cookies
async function fetchSessionCookie(company: WorkdayCompany): Promise<string | null> {
  const url = `https://${company.tenant}.wd1.myworkdayjobs.com/en-US/${company.path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Forwarded-For": randomIP(),
      },
      redirect: "follow",
    });
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;
    // Extract key=value pairs, strip metadata
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

// Step 2: POST to Workday jobs API
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

  for (const term of searchTerms) {
    try {
      await delay(200 + Math.random() * 300); // stagger requests
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

      if (!res.ok) continue;
      const data = await res.json();
      const postings = data?.jobPostings ?? [];

      for (const p of postings) {
        if (seen.has(p.bulletFields?.[0] ?? p.title)) continue;
        seen.add(p.bulletFields?.[0] ?? p.title);

        const postedOn = p.postedOn ?? p.startDate ?? "";
        const postedDate = postedOn ? new Date(postedOn) : null;
        if (postedDate && postedDate < cutoff) continue;

        const locationStr: string =
          p.locationsText ?? p.locationText ?? p.locationHierarchyText ?? "";

        // US filter
        const isUS =
          locationStr === "" ||
          /\b(US|United States|USA|Remote|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|D\.C\.|District of Columbia)\b/i.test(
            locationStr
          );
        if (!isUS) continue;

        jobs.push({
          id: p.externalPath ?? `${company.tenant}-${p.title}-${postedOn}`,
          title: p.title ?? "Untitled",
          company: company.name,
          location: locationStr || "United States",
          postedOn: postedOn,
          url: `https://${company.tenant}.wd1.myworkdayjobs.com/en-US/${company.path}${p.externalPath ?? ""}`,
          jobType: p.jobType ?? "Full time",
          remote: /remote/i.test(locationStr),
          source: "workday",
          tenant: company.tenant,
        });
      }
    } catch {
      // silently skip failed tenants
    }
  }
  return jobs;
}

// Main exported fetcher — handles open + session-cookie companies
export async function fetchWorkdayCompany(
  company: WorkdayCompany,
  searchTerms: string[],
  minutesWindow: number
): Promise<WorkdayJob[]> {
  let cookie: string | null = null;

  if (!company.open) {
    cookie = await fetchSessionCookie(company);
    // small delay after getting cookie
    await delay(300 + Math.random() * 400);
  }

  return queryWorkdayJobs(company, searchTerms, cookie, minutesWindow);
}
