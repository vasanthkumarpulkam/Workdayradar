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
  industry: string;
  isNew?: boolean;
}

interface ApiResponse {
  jobs: Job[];
  total: number;
  companies: number;
  openTenants: number;
  sessionTenants: number;
  successfulCompanies: number;
  failedCompanies: number;
  fetchedAt: string;
  windowMinutes: number;
}

const REFRESH_SECS = 300;

const CATEGORIES: Record<string, string[]> = {
  "All Roles": [],
  "Data Analyst": ["data analyst", "analytics analyst", "reporting analyst", "insights analyst"],
  "Business Analyst": ["business analyst", "business systems", "functional analyst", "systems analyst"],
  "BI / Power BI": ["business intelligence", "bi analyst", "bi developer", "power bi", "tableau", "looker", "dashboard"],
  "Data Engineer": ["data engineer", "etl", "data pipeline", "analytics engineer", "sql developer", "data warehouse", "snowflake", "dbt"],
  "Financial": ["financial analyst", "fp&a", "budget analyst", "revenue analyst", "finance analyst"],
  "Operations": ["operations analyst", "business operations", "sales operations", "gtm analyst", "supply chain", "workforce"],
  "Compliance": ["compliance", "regulatory", "data governance", "data quality", "data steward", "risk analyst"],
};

const INDUSTRIES = ["All", "Finance", "Tech", "Consulting", "Healthcare", "Defense", "Energy", "Transport", "Retail", "Consumer", "Auto"];
const LOCATIONS = ["All US", "Remote", "Texas", "New York", "California", "Illinois", "Virginia", "Georgia", "Florida", "Washington"];
const TIME_WINDOWS = [
  { label: "Last 30 min", value: 30 },
  { label: "Last 1 hr", value: 60 },
  { label: "Last 3 hr", value: 180 },
  { label: "Last 6 hr", value: 360 },
  { label: "Last 12 hr", value: 720 },
  { label: "Last 24 hr", value: 1440 },
];

function timeAgo(dateStr: string): string {
  if (!dateStr) return "Recently";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently";
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

function matchesLocation(job: Job, loc: string): boolean {
  if (loc === "All US") return true;
  if (loc === "Remote") return job.remote;
  const l = job.location.toLowerCase();
  const map: Record<string, RegExp> = {
    "Texas": /texas|dallas|houston|austin|san antonio|fort worth|plano|irving|frisco|allen|\btx\b/i,
    "New York": /new york|\bny\b|nyc/i,
    "California": /california|los angeles|san francisco|san jose|san diego|\bca\b/i,
    "Illinois": /illinois|chicago|\bil\b/i,
    "Virginia": /virginia|mclean|arlington|reston|\bva\b/i,
    "Georgia": /georgia|atlanta|\bga\b/i,
    "Florida": /florida|miami|orlando|tampa|\bfl\b/i,
    "Washington": /washington|seattle|\bwa\b/i,
  };
  return map[loc]?.test(l) ?? true;
}

const INDUSTRY_COLORS: Record<string, { bg: string; color: string }> = {
  Finance:    { bg: "#e8f4fd", color: "#1565c0" },
  Tech:       { bg: "#e8f5e9", color: "#2e7d32" },
  Consulting: { bg: "#ede7f6", color: "#4527a0" },
  Healthcare: { bg: "#fce4ec", color: "#880e4f" },
  Defense:    { bg: "#fff3e0", color: "#e65100" },
  Energy:     { bg: "#f3e5f5", color: "#6a1b9a" },
  Transport:  { bg: "#e0f2f1", color: "#00695c" },
  Retail:     { bg: "#fff8e1", color: "#f57f17" },
  Consumer:   { bg: "#fbe9e7", color: "#bf360c" },
  Auto:       { bg: "#e8eaf6", color: "#283593" },
};

export default function WorkdayRadar() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meta, setMeta] = useState<Omit<ApiResponse, "jobs">>({
    total: 0, companies: 100, openTenants: 58, sessionTenants: 42,
    successfulCompanies: 0, failedCompanies: 0, fetchedAt: "", windowMinutes: 1440,
  });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const [lastFetch, setLastFetch] = useState("");
  const [newCount, setNewCount] = useState(0);

  const [category, setCategory] = useState("All Roles");
  const [location, setLocation] = useState("All US");
  const [industry, setIndustry] = useState("All");
  const [window30, setWindow30] = useState(1440);
  const [onlyRemote, setOnlyRemote] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [search, setSearch] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setScanning(true);
    setError("");
    try {
      const params = new URLSearchParams({
        minutes: String(window30),
        onlyOpen: String(onlyOpen),
        ...(industry !== "All" ? { industry } : {}),
      });
      const res = await fetch(`/api/workday?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: ApiResponse = await res.json();

      const prevIds = prevIdsRef.current;
      const marked = data.jobs.map((j) => ({
        ...j,
        isNew: prevIds.size > 0 && !prevIds.has(j.id),
      }));
      prevIdsRef.current = new Set(data.jobs.map((j) => j.id));

      setNewCount(marked.filter((j) => j.isNew).length);
      setJobs(marked);
      setMeta({
        total: data.total,
        companies: data.companies,
        openTenants: data.openTenants,
        sessionTenants: data.sessionTenants,
        successfulCompanies: data.successfulCompanies,
        failedCompanies: data.failedCompanies,
        fetchedAt: data.fetchedAt,
        windowMinutes: data.windowMinutes,
      });
      setLastFetch(new Date().toLocaleTimeString());
      setCountdown(REFRESH_SECS);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, [window30, onlyOpen, industry]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { fetchJobs(); return REFRESH_SECS; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchJobs]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filtered = jobs.filter((j) => {
    if (!matchesCategory(j.title, category)) return false;
    if (!matchesLocation(j, location)) return false;
    if (onlyRemote && !j.remote) return false;
    if (search) {
      const q = search.toLowerCase();
      return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
    }
    return true;
  });

  const pct = ((REFRESH_SECS - countdown) / REFRESH_SECS) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--sans)" }}>

      {/* ── HEADER ── */}
      <header style={{
        background: "var(--white)",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, gap: 16, flexWrap: "wrap" }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: "linear-gradient(135deg, #0052cc, #4285f4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: 15,
                boxShadow: "0 2px 8px rgba(0,82,204,0.3)",
              }}>W</div>
              <div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, color: "var(--text)", letterSpacing: "-0.01em" }}>
                  Workday Radar
                </div>
                <div style={{ fontSize: 10, color: "var(--text4)", letterSpacing: "0.04em", fontWeight: 500 }}>
                  LIVE JOB INTELLIGENCE
                </div>
              </div>
            </div>

            {/* Stats pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatPill label="Companies" value={meta.companies} color="#0052cc" bg="#e8f0fe" />
              <StatPill label="Open API" value={meta.openTenants} color="#00875a" bg="#e3fcef" />
              <StatPill label="Session Auth" value={meta.sessionTenants} color="#ff8b00" bg="#fff8e6" />
              <StatPill label="Jobs Found" value={filtered.length} color="#5243aa" bg="#eae6ff" bold />
              {newCount > 0 && (
                <div style={{
                  background: "#e3fcef", border: "1.5px solid #57d9a3",
                  color: "#00875a", borderRadius: 20, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
                  animation: "blink 1.5s infinite",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00875a", display: "inline-block" }} />
                  {newCount} NEW
                </div>
              )}
            </div>

            {/* Refresh controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Countdown */}
              <div style={{ position: "relative", width: 38, height: 38 }}>
                <svg width="38" height="38" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="19" cy="19" r="15" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                  <circle cx="19" cy="19" r="15" fill="none"
                    stroke={scanning ? "#ff8b00" : "#0052cc"} strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 15}`}
                    strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.8s linear" }}
                  />
                </svg>
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 600,
                  color: scanning ? "#ff8b00" : "var(--text3)",
                  fontFamily: "var(--mono)",
                }}>
                  {scanning ? "…" : countdown}
                </div>
              </div>

              <button onClick={fetchJobs} disabled={loading} style={{
                background: loading ? "var(--bg2)" : "var(--wd-blue)",
                color: loading ? "var(--text3)" : "#fff",
                border: "none", borderRadius: 8, padding: "8px 16px",
                fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 2px 8px rgba(0,82,204,0.25)",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {loading
                  ? <>⏳ Scanning…</>
                  : <>↻ Scan Now</>}
              </button>

              {lastFetch && (
                <span style={{ fontSize: 10, color: "var(--text4)" }}>
                  Last: {lastFetch}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        background: "var(--white)", borderBottom: "1px solid var(--border)",
        position: "sticky", top: 60, zIndex: 90,
        boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "10px 24px" }}>

          {/* Row 1 — Search + Time + Toggles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <div style={{ position: "relative", flex: "0 0 auto" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text4)", fontSize: 14 }}>🔍</span>
              <input
                type="text" placeholder="Search title, company, location…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: "var(--bg)", border: "1px solid var(--border2)",
                  borderRadius: 7, padding: "7px 12px 7px 30px",
                  fontSize: 12, color: "var(--text)", outline: "none",
                  width: 240, fontFamily: "var(--sans)",
                  transition: "border-color 0.15s",
                }}
              />
            </div>

            <select value={window30} onChange={(e) => setWindow30(Number(e.target.value))}
              style={selectStyle}>
              {TIME_WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>

            <select value={location} onChange={(e) => setLocation(e.target.value)}
              style={selectStyle}>
              {LOCATIONS.map((l) => <option key={l} value={l}>📍 {l}</option>)}
            </select>

            <select value={industry} onChange={(e) => setIndustry(e.target.value)}
              style={selectStyle}>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i === "All" ? "🏢 All Industries" : i}</option>)}
            </select>

            <ToggleBtn label="Remote Only" value={onlyRemote} onChange={setOnlyRemote} />
            <ToggleBtn label="Open API Only" value={onlyOpen} onChange={setOnlyOpen} />
          </div>

          {/* Row 2 — Category pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(CATEGORIES).map((cat) => {
              const active = category === cat;
              return (
                <button key={cat} onClick={() => setCategory(cat)} style={{
                  background: active ? "#0052cc" : "var(--bg)",
                  color: active ? "#fff" : "var(--text2)",
                  border: `1px solid ${active ? "#0052cc" : "var(--border)"}`,
                  borderRadius: 6, padding: "4px 11px",
                  fontSize: 11, fontWeight: active ? 600 : 400,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 60px" }}>

        {/* Error */}
        {error && (
          <div style={{
            background: "#ffebe6", border: "1px solid #ff5630",
            color: "#de350b", borderRadius: 8, padding: "10px 16px",
            fontSize: 12, marginBottom: 16, display: "flex", gap: 8, alignItems: "center",
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Scanning indicator */}
        {loading && jobs.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...Array(5)].map((_, i) => (
              <SkeletonCard key={i} opacity={1 - i * 0.15} />
            ))}
            <div style={{
              textAlign: "center", padding: "16px",
              fontSize: 12, color: "var(--text3)",
            }}>
              Scanning {meta.companies} Workday companies — fetching session cookies &amp; rotating IPs…
            </div>
          </div>
        )}

        {/* Results header */}
        {!loading && jobs.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 12, flexWrap: "wrap", gap: 8,
          }}>
            <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>
              Showing <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> Workday jobs
              {filtered.length !== jobs.length && <> · <span style={{ color: "var(--text4)" }}>{jobs.length} total before filters</span></>}
              {" · "}<span>Scanned {meta.companies} companies</span>
              {meta.successfulCompanies > 0 && <> · <span style={{ color: "var(--green)" }}>{meta.successfulCompanies} returned jobs</span></>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text4)" }}>
              Auto-refreshes every 5 min
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && jobs.length === 0 && !error && (
          <div style={{
            background: "var(--white)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "48px 24px", textAlign: "center",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              No Workday jobs in the last {TIME_WINDOWS.find(w => w.value === window30)?.label.replace("Last ", "")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", maxWidth: 360, margin: "0 auto" }}>
              Workday posts are batched, not continuous. Try <strong>Last 24 hr</strong> for the best results, or click Scan Now to refresh.
            </div>
          </div>
        )}

        {!loading && jobs.length > 0 && filtered.length === 0 && (
          <div style={{
            background: "var(--white)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "40px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>No matches for current filters</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Try clearing some filters or switching category.</div>
          </div>
        )}

        {/* Job list */}
        {filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} />
            ))}
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--white)", padding: "14px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text4)" }}>
            Workday Radar · Direct ATS Intelligence · Session Cookies + IP Rotation · {new Date().getFullYear()}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { dot: "#00875a", label: "Open API" },
              { dot: "#ff8b00", label: "Session Auth" },
              { dot: "#0052cc", label: "IP Rotated" },
            ].map(({ dot, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text4)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── SUB-COMPONENTS ─────────────────────────────────────────────────────── */

const selectStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 7, padding: "7px 10px",
  fontSize: 12, color: "var(--text)",
  cursor: "pointer", outline: "none",
  fontFamily: "var(--sans)",
};

function StatPill({ label, value, color, bg, bold }: {
  label: string; value: string | number; color: string; bg: string; bold?: boolean;
}) {
  return (
    <div style={{
      background: bg, borderRadius: 20, padding: "4px 10px",
      display: "flex", alignItems: "center", gap: 6,
      animation: "count 0.4s ease",
    }}>
      <span style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 800 : 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color, opacity: 0.75, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function ToggleBtn({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      background: value ? "#e8f0fe" : "var(--bg)",
      border: `1px solid ${value ? "#4285f4" : "var(--border)"}`,
      color: value ? "#0052cc" : "var(--text3)",
      borderRadius: 7, padding: "6px 12px",
      fontSize: 11, fontWeight: value ? 600 : 400,
      cursor: "pointer", transition: "all 0.15s",
    }}>
      {value ? "✓ " : ""}{label}
    </button>
  );
}

function JobCard({ job, index }: { job: Job; index: number }) {
  const [hovered, setHovered] = useState(false);
  const indColor = INDUSTRY_COLORS[job.industry] ?? { bg: "#f0f0f0", color: "#555" };
  const isNew = job.isNew;

  return (
    <a
      href={job.url} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: "none" }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: isNew ? "#f6fffb" : hovered ? "#fafbff" : "var(--white)",
          border: `1px solid ${isNew ? "#57d9a3" : hovered ? "#4285f4" : "var(--border)"}`,
          borderRadius: 10, padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          cursor: "pointer",
          boxShadow: hovered ? "var(--shadow)" : isNew ? "0 0 0 1px #57d9a3, 0 2px 8px rgba(87,217,163,0.15)" : "var(--shadow-sm)",
          transform: hovered ? "translateY(-1px)" : "translateY(0)",
          transition: "all 0.18s ease",
          animation: `fadeUp 0.3s ease ${Math.min(index * 0.03, 0.3)}s both`,
        } as React.CSSProperties}
      >
        {/* Workday badge */}
        <div style={{
          background: "linear-gradient(135deg, #0052cc, #4285f4)",
          color: "#fff", borderRadius: 6, padding: "4px 8px",
          fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
          flexShrink: 0, boxShadow: "0 2px 6px rgba(0,82,204,0.2)",
        }}>WD</div>

        {/* NEW badge */}
        {isNew && (
          <div style={{
            background: "#e3fcef", border: "1.5px solid #57d9a3",
            color: "#00875a", borderRadius: 5, padding: "2px 7px",
            fontSize: 9, fontWeight: 800, flexShrink: 0,
            animation: "blink 2s infinite",
          }}>NEW</div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: hovered ? "#0052cc" : "var(--text)",
            marginBottom: 4, transition: "color 0.15s",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{job.title}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0052cc" }}>{job.company}</span>
            <span style={{ color: "var(--border2)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>📍 {job.location}</span>
            {job.remote && (
              <span style={{
                background: "#e8f0fe", color: "#0052cc",
                borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600,
              }}>Remote</span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          {/* Industry tag */}
          <div style={{
            background: indColor.bg, color: indColor.color,
            borderRadius: 5, padding: "2px 8px",
            fontSize: 10, fontWeight: 600,
          }}>{job.industry}</div>

          <div style={{ fontSize: 10, color: "var(--text4)" }}>
            {timeAgo(job.postedOn)}
          </div>

          <div style={{
            background: hovered ? "#0052cc" : "var(--bg2)",
            color: hovered ? "#fff" : "var(--text3)",
            border: `1px solid ${hovered ? "#0052cc" : "var(--border)"}`,
            borderRadius: 6, padding: "4px 10px",
            fontSize: 10, fontWeight: 600, transition: "all 0.15s",
          }}>Apply →</div>
        </div>
      </div>
    </a>
  );
}

function SkeletonCard({ opacity }: { opacity: number }) {
  return (
    <div style={{
      background: "var(--white)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 18px", opacity,
      display: "flex", gap: 14, alignItems: "center",
    }}>
      <div style={{ width: 32, height: 28, borderRadius: 6, background: "var(--bg2)", flexShrink: 0,
        backgroundImage: "linear-gradient(90deg, var(--bg2) 25%, var(--border) 50%, var(--bg2) 75%)",
        backgroundSize: "400px 100%", animation: "shimmer 1.2s infinite",
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, width: "55%", borderRadius: 4, background: "var(--bg2)", marginBottom: 8,
          backgroundImage: "linear-gradient(90deg, var(--bg2) 25%, var(--border) 50%, var(--bg2) 75%)",
          backgroundSize: "400px 100%", animation: "shimmer 1.2s infinite",
        }} />
        <div style={{ height: 11, width: "35%", borderRadius: 4, background: "var(--bg2)",
          backgroundImage: "linear-gradient(90deg, var(--bg2) 25%, var(--border) 50%, var(--bg2) 75%)",
          backgroundSize: "400px 100%", animation: "shimmer 1.2s infinite",
        }} />
      </div>
      <div style={{ width: 60, height: 28, borderRadius: 6, background: "var(--bg2)",
        backgroundImage: "linear-gradient(90deg, var(--bg2) 25%, var(--border) 50%, var(--bg2) 75%)",
        backgroundSize: "400px 100%", animation: "shimmer 1.2s infinite",
      }} />
    </div>
  );
}
