import { NextRequest, NextResponse } from "next/server";
import { WORKDAY_COMPANIES, JOB_KEYWORDS } from "../../lib/companies";
import { fetchWorkdayCompany, WorkdayJob } from "../../lib/workdayFetcher";

export const runtime = "nodejs";
export const maxDuration = 60;

// Batch companies to avoid timeout — run N in parallel at a time
const BATCH_SIZE = 8;

async function runBatched<T>(
  items: T[],
  fn: (item: T) => Promise<WorkdayJob[]>,
  batchSize: number
): Promise<WorkdayJob[]> {
  const results: WorkdayJob[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(...r.value);
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minutesWindow = parseInt(searchParams.get("minutes") ?? "30", 10);
  const onlyOpen = searchParams.get("onlyOpen") === "true";
  const companyFilter = searchParams.get("company") ?? "";

  let companies = WORKDAY_COMPANIES;
  if (onlyOpen) companies = companies.filter((c) => c.open);
  if (companyFilter) {
    companies = companies.filter((c) =>
      c.name.toLowerCase().includes(companyFilter.toLowerCase())
    );
  }

  // Use a focused subset of search terms to stay within timeout
  const SEARCH_TERMS = [
    "data analyst",
    "business analyst",
    "power bi",
    "financial analyst",
    "data engineer",
    "analytics engineer",
    "reporting analyst",
    "business intelligence",
    "operations analyst",
    "compliance analyst",
    "etl developer",
    "sql analyst",
  ];

  const jobs = await runBatched(
    companies,
    (company) => fetchWorkdayCompany(company, SEARCH_TERMS, minutesWindow),
    BATCH_SIZE
  );

  // De-duplicate by job id
  const seen = new Set<string>();
  const unique = jobs.filter((j) => {
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });

  // Filter by keywords
  const filtered = unique.filter((j) => {
    const title = j.title.toLowerCase();
    return JOB_KEYWORDS.some((kw) => title.includes(kw));
  });

  // Sort newest first (best-effort — many Workday endpoints don't return timestamp)
  filtered.sort((a, b) => {
    if (!a.postedOn && !b.postedOn) return 0;
    if (!a.postedOn) return 1;
    if (!b.postedOn) return -1;
    return new Date(b.postedOn).getTime() - new Date(a.postedOn).getTime();
  });

  return NextResponse.json({
    jobs: filtered,
    total: filtered.length,
    companies: companies.length,
    openTenants: companies.filter((c) => c.open).length,
    sessionTenants: companies.filter((c) => !c.open).length,
    fetchedAt: new Date().toISOString(),
    windowMinutes: minutesWindow,
  });
}
