"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  postedOn: string;
  url: string;
  jobType: string;
  remote: boolean;
  source: string;
  tenant: string;
  isNew?: boolean;
}

interface ApiResponse {
  jobs: Job[];
  total: number;
  companies: number;
  openTenants: number;
  sessionTenants: number;
  fetchedAt: string;
  windowMinutes: number;
}

const REFRESH_SECS = 300; // 5 min

const CATEGORIES: Record<string, string[]> = {
  "All Roles": [],
  "Data Analyst": ["data analyst", "analytics analyst", "reporting analyst", "insights analyst"],
  "Business Analyst": ["business analyst", "business systems analyst", "functional analyst", "systems analyst"],
  "BI / Power BI": ["business intelligence", "bi analyst", "bi developer", "power bi", "tableau", "looker"],
  "Data Engineer": ["data engineer", "etl", "data pipeline", "analytics engineer", "sql developer", "data warehouse", "snowflake", "dbt"],
  "Financial": ["financial analyst", "fp&a", "budget analyst", "revenue analyst", "pricing analyst", "finance analyst"],
  "Operations": ["operations analyst", "sales ops", "gtm analyst", "supply chain", "workforce analyst", "strategy analyst"],
  "Compliance": ["compliance", "regulatory", "data governance", "data quality", "data steward", "risk analyst", "audit analyst"],
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "Recently posted";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently posted";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function matchesCategory(title: string, cat: string): boolean {
  if (cat === "All Roles") return true;
  const lower = title.toLowerCase();
  return CATEGORIES[cat].some((kw) => lower.includes(kw));
}

export default function WorkdayRadar() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meta, setMeta] = useState<Omit<ApiResponse, "jobs"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const [lastFetch, setLastFetch] = useState("");
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [newCount, setNewCount] = useState(0);

  // Filters
  const [category, setCategory] = useState("All Roles");
  const [window30, setWindow30] = useState(30);
  const [onlyRemote, setOnlyRemote] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        minutes: String(window30),
        onlyOpen: String(onlyOpen),
      });
      const res = await fetch(`/api/workday?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: ApiResponse = await res.json();

      // Mark new
      const prevIds = prevIdsRef.current;
      const marked = data.jobs.map((j) => ({
        ...j,
        isNew: prevIds.size > 0 && !prevIds.has(j.id),
      }));
      const newIds = new Set(data.jobs.map((j) => j.id));
      prevIdsRef.current = newIds;
      setSeenIds(newIds);

      const nc = marked.filter((j) => j.isNew).length;
      setNewCount(nc);
      setJobs(marked);
      setMeta({
        total: data.total,
        companies: data.companies,
        openTenants: data.openTenants,
        sessionTenants: data.sessionTenants,
        fetchedAt: data.fetchedAt,
        windowMinutes: data.windowMinutes,
      });
      setLastFetch(new Date().toLocaleTimeString());
      setCountdown(REFRESH_SECS);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [window30, onlyOpen]);

  // Auto-refresh countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchJobs();
          return REFRESH_SECS;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchJobs]);

  // Initial fetch
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Filter jobs
  const filtered = jobs.filter((j) => {
    if (!matchesCategory(j.title, category)) return false;
    if (onlyRemote && !j.remote) return false;
    if (locationFilter !== "All") {
      const loc = j.location.toLowerCase();
      if (locationFilter === "Remote" && !j.remote) return false;
      if (locationFilter === "Texas" && !/texas|dallas|houston|austin|san antonio|fort worth|plano|irving|frisco|allen|denton|tx\b/i.test(loc)) return false;
      if (locationFilter === "New York" && !/new york|ny\b|nyc/i.test(loc)) return false;
      if (locationFilter === "California" && !/california|ca\b|los angeles|san francisco|san jose|san diego/i.test(loc)) return false;
      if (locationFilter === "Illinois" && !/illinois|chicago|il\b/i.test(loc)) return false;
      if (locationFilter === "Georgia" && !/georgia|atlanta|ga\b/i.test(loc)) return false;
      if (locationFilter === "Virginia" && !/virginia|va\b|mclean|arlington|reston/i.test(loc)) return false;
      if (locationFilter === "Florida" && !/florida|fl\b|miami|orlando|tampa/i.test(loc)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
    }
    return true;
  });

  const pct = ((REFRESH_SECS - countdown) / REFRESH_SECS) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── HEADER ── */}
      <header style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, gap: 16, flexWrap: "wrap" }}>
          
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "linear-gradient(135deg, var(--wd-blue) 0%, var(--accent) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#fff",
              boxShadow: "0 0 20px var(--wd-blue-glow)",
              animation: "pulse-ring 2.5s infinite",
            }}>W</div>
            <div>
              <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: "-0.02em" }}>
                WORKDAY RADAR
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", letterSpacing: "0.1em" }}>
                LIVE JOB INTELLIGENCE
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Stat label="COMPANIES" value={meta?.companies ?? "—"} color="var(--wd-blue-bright)" />
            <Stat label="OPEN API" value={meta?.openTenants ?? "—"} color="var(--green)" />
            <Stat label="SESSION AUTH" value={meta?.sessionTenants ?? "—"} color="var(--yellow)" />
            <Stat label="JOBS FOUND" value={filtered.length} color="var(--accent)" />
            {newCount > 0 && <Stat label="NEW" value={newCount} color="var(--green)" blink />}
          </div>

          {/* Refresh controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Countdown ring */}
            <div style={{ position: "relative", width: 40, height: 40 }}>
              <svg width="40" height="40" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="20" cy="20" r="16" fill="none"
                  stroke={loading ? "var(--yellow)" : "var(--wd-blue-bright)"}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - pct / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.5s linear" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--mono)", fontSize: 9, color: loading ? "var(--yellow)" : "var(--text2)",
              }}>
                {loading ? "…" : countdown}
              </div>
            </div>

            <button onClick={fetchJobs} disabled={loading} style={{
              background: loading ? "var(--surface2)" : "var(--wd-blue)",
              border: "none", color: "#fff", padding: "8px 16px", borderRadius: 6,
              fontFamily: "var(--mono)", fontSize: 11, cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700, letterSpacing: "0.05em",
              transition: "all 0.2s",
              boxShadow: loading ? "none" : "0 0 12px var(--wd-blue-glow)",
            }}>
              {loading ? "SCANNING…" : "⟳ SCAN NOW"}
            </button>

            {lastFetch && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>
                LAST: {lastFetch}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        background: "var(--surface2)", borderBottom: "1px solid var(--border)",
        padding: "12px 24px",
        position: "sticky", top: 64, zIndex: 90,
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          
          {/* Search */}
          <input
            type="text" placeholder="Search title, company, location…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "var(--surface3)", border: "1px solid var(--border2)",
              color: "var(--text)", padding: "7px 12px", borderRadius: 6,
              fontFamily: "var(--mono)", fontSize: 11, width: 220, outline: "none",
            }}
          />

          {/* Category */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.keys(CATEGORIES).map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                background: category === cat ? "var(--wd-blue)" : "var(--surface3)",
                border: `1px solid ${category === cat ? "var(--wd-blue-bright)" : "var(--border)"}`,
                color: category === cat ? "#fff" : "var(--text2)",
                padding: "5px 10px", borderRadius: 5,
                fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer",
                fontWeight: category === cat ? 700 : 400,
                transition: "all 0.15s",
              }}>{cat}</button>
            ))}
          </div>

          {/* Location */}
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{
            background: "var(--surface3)", border: "1px solid var(--border2)",
            color: "var(--text)", padding: "7px 10px", borderRadius: 6,
            fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", outline: "none",
          }}>
            {["All","Remote","Texas","New York","California","Illinois","Georgia","Virginia","Florida"].map((l) => (
              <option key={l} value={l}>{l === "All" ? "🌎 All Locations" : l}</option>
            ))}
          </select>

          {/* Window */}
          <select value={window30} onChange={(e) => setWindow30(Number(e.target.value))} style={{
            background: "var(--surface3)", border: "1px solid var(--border2)",
            color: "var(--text)", padding: "7px 10px", borderRadius: 6,
            fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", outline: "none",
          }}>
            <option value={30}>⏱ Last 30 min</option>
            <option value={60}>⏱ Last 1 hr</option>
            <option value={180}>⏱ Last 3 hr</option>
            <option value={360}>⏱ Last 6 hr</option>
            <option value={720}>⏱ Last 12 hr</option>
            <option value={1440}>⏱ Last 24 hr</option>
          </select>

          {/* Toggles */}
          <Toggle label="Remote Only" value={onlyRemote} onChange={setOnlyRemote} />
          <Toggle label="Open API Only" value={onlyOpen} onChange={setOnlyOpen} />
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 60px" }}>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(255,68,68,0.1)", border: "1px solid var(--red)",
            color: "var(--red)", padding: "12px 16px", borderRadius: 8,
            fontFamily: "var(--mono)", fontSize: 12, marginBottom: 20,
          }}>⚠ {error}</div>
        )}

        {/* Loading skeleton */}
        {loading && jobs.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "20px 24px", height: 90,
                animation: "pulse-ring 1.5s infinite",
                opacity: 1 - i * 0.12,
              }} />
            ))}
            <div style={{ textAlign: "center", padding: 24, fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
              Scanning {meta?.companies ?? "150+"} Workday companies — handling session cookies &amp; IP rotation…
            </div>
          </div>
        )}

        {/* No results */}
        {!loading && jobs.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 18, color: "var(--text2)", marginBottom: 8 }}>
              No matches in current filters
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
              Try widening the time window or changing category
            </div>
          </div>
        )}

        {/* Empty fresh */}
        {!loading && jobs.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 18, color: "var(--text2)", marginBottom: 8 }}>
              No Workday jobs found in last {window30} min
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
              Try extending the time window — Workday posts are often batched hourly.
            </div>
          </div>
        )}

        {/* Job grid */}
        {filtered.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                {filtered.length} WORKDAY JOB{filtered.length !== 1 ? "S" : ""} · SCANNED {meta?.companies ?? "—"} COMPANIES
              </div>
              {newCount > 0 && (
                <div style={{
                  background: "var(--green-dim)", border: "1px solid var(--green)",
                  color: "var(--green)", padding: "2px 8px", borderRadius: 4,
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  animation: "blink 1.5s infinite",
                }}>
                  ↑ {newCount} NEW SINCE LAST SCAN
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid var(--border)", padding: "16px 24px",
        background: "var(--surface)",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>
            WORKDAY RADAR · DIRECT ATS INTELLIGENCE · SESSION COOKIE + IP ROTATION · {new Date().getFullYear()}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <Badge color="var(--green)" label="OPEN API" />
            <Badge color="var(--yellow)" label="SESSION AUTH" />
            <Badge color="var(--accent)" label="IP ROTATED" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── SUB-COMPONENTS ── */

function JobCard({ job }: { job: Job }) {
  const isNew = job.isNew;
  return (
    <a href={job.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
      <div style={{
        background: isNew ? "rgba(0,230,118,0.04)" : "var(--surface)",
        border: `1px solid ${isNew ? "var(--green)" : "var(--border)"}`,
        borderRadius: 10, padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        cursor: "pointer", transition: "all 0.2s",
        animation: isNew ? "slide-in 0.4s ease, glow-new 2s ease 3" : "slide-in 0.3s ease",
        boxShadow: isNew ? "0 0 20px rgba(0,230,118,0.08)" : "none",
      }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = "var(--wd-blue-bright)";
          el.style.background = "var(--surface2)";
          el.style.transform = "translateX(4px)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = isNew ? "var(--green)" : "var(--border)";
          el.style.background = isNew ? "rgba(0,230,118,0.04)" : "var(--surface)";
          el.style.transform = "translateX(0)";
        }}
      >
        {/* Source badge */}
        <div style={{
          background: "var(--wd-blue)", color: "#fff",
          padding: "4px 8px", borderRadius: 5,
          fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0,
        }}>WD</div>

        {/* New badge */}
        {isNew && (
          <div style={{
            background: "var(--green-dim)", border: "1px solid var(--green)",
            color: "var(--green)", padding: "3px 7px", borderRadius: 4,
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
            flexShrink: 0,
          }}>NEW</div>
        )}

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--sans)", fontWeight: 700, fontSize: 15,
            color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", marginBottom: 4,
          }}>{job.title}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--wd-blue-bright)" }}>
              {job.company}
            </span>
            <span style={{ color: "var(--text3)", fontSize: 11 }}>·</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)" }}>
              📍 {job.location}
            </span>
            {job.remote && (
              <span style={{
                background: "var(--accent-dim)", color: "var(--accent)",
                padding: "1px 6px", borderRadius: 3,
                fontFamily: "var(--mono)", fontSize: 9,
              }}>REMOTE</span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>
            {timeAgo(job.postedOn)}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>
            {job.tenant}.wd1
          </div>
          <div style={{
            background: "var(--wd-blue)", color: "#fff",
            padding: "4px 10px", borderRadius: 5,
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
          }}>APPLY →</div>
        </div>
      </div>
    </a>
  );
}

function Stat({ label, value, color, blink }: { label: string; value: string | number; color: string; blink?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: "var(--mono)", fontWeight: 700, fontSize: 18, color,
        animation: blink ? "blink 1s infinite" : "count-up 0.4s ease",
      }}>{value}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text3)", letterSpacing: "0.1em" }}>{label}</div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      background: value ? "var(--wd-blue-glow)" : "var(--surface3)",
      border: `1px solid ${value ? "var(--wd-blue-bright)" : "var(--border)"}`,
      color: value ? "var(--wd-blue-bright)" : "var(--text3)",
      padding: "6px 12px", borderRadius: 6,
      fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer",
      fontWeight: value ? 700 : 400, transition: "all 0.15s",
    }}>
      {value ? "✓ " : ""}{label}
    </button>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>{label}</span>
    </div>
  );
}
