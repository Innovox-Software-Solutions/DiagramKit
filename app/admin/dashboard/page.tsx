"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./dashboard.module.css";

/* ---------- types ---------- */
interface DailyPoint {
  date: string;
  count: number;
}
interface RecentUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}
interface RecentBoard {
  id: string;
  name: string;
  updatedAt: string;
  user: { name: string | null; email: string | null };
}
interface Stats {
  totalUsers: number;
  totalBoards: number;
  totalSessions: number;
  usersToday: number;
  usersThisWeek: number;
  usersThisMonth: number;
  boardsToday: number;
  boardsThisWeek: number;
  avgBoardsPerUser: number;
  dailySignups: DailyPoint[];
  dailyBoards: DailyPoint[];
  recentUsers: RecentUser[];
  recentBoards: RecentBoard[];
}

/* ---------- small chart helper (pure CSS bar chart) ---------- */
function MiniBarChart({
  data,
  color,
  label,
}: {
  data: DailyPoint[];
  color: string;
  label: string;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>{label}</h3>
      <div className={styles.bars}>
        {data.map((d) => (
          <div key={d.date} className={styles.barCol}>
            <div
              className={styles.bar}
              style={{
                height: `${(d.count / max) * 100}%`,
                background: color,
              }}
            />
            <span className={styles.barLabel}>
              {new Date(d.date + "T00:00:00").toLocaleDateString("en", {
                weekday: "short",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auth guard
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem("admin_auth") !== "true") {
        router.replace("/admin/login");
      }
    }
  }, [router]);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Fetch failed");
      const json: Stats = await res.json();
      setStats(json);
      setError("");
    } catch {
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleLogout = () => {
    sessionStorage.removeItem("admin_auth");
    router.replace("/admin/login");
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      {/* Background */}
      <div className={styles.gridBg} />
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logoText}>Innovox</span>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.refreshBtn} onClick={fetchStats} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" /><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" /></svg>
          </button>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Dashboard Analytics</h1>

        {loading && !stats && (
          <div className={styles.loaderWrap}>
            <div className={styles.spinner} />
            <p className={styles.loaderText}>Loading analytics…</p>
          </div>
        )}

        {error && <p className={styles.errorText}>{error}</p>}

        {stats && (
          <>
            {/* Stat cards */}
            <section className={styles.statGrid}>
              <StatCard
                icon={<UsersIcon />}
                label="Total Users"
                value={stats.totalUsers}
                sub={`+${stats.usersThisWeek} this week`}
                color="#6366f1"
              />
              <StatCard
                icon={<BoardIcon />}
                label="Total Boards"
                value={stats.totalBoards}
                sub={`+${stats.boardsThisWeek} this week`}
                color="#8b5cf6"
              />
              <StatCard
                icon={<SessionIcon />}
                label="Active Sessions"
                value={stats.totalSessions}
                sub="current sessions"
                color="#a78bfa"
              />
              <StatCard
                icon={<AvgIcon />}
                label="Boards / User"
                value={stats.avgBoardsPerUser}
                sub="average"
                color="#c084fc"
              />
            </section>

            {/* Highlight row */}
            <section className={styles.highlightRow}>
              <div className={styles.highlightCard}>
                <span className={styles.highlightNum}>{stats.usersToday}</span>
                <span className={styles.highlightLabel}>Users today</span>
              </div>
              <div className={styles.highlightCard}>
                <span className={styles.highlightNum}>{stats.boardsToday}</span>
                <span className={styles.highlightLabel}>Boards today</span>
              </div>
              <div className={styles.highlightCard}>
                <span className={styles.highlightNum}>{stats.usersThisMonth}</span>
                <span className={styles.highlightLabel}>Users this month</span>
              </div>
            </section>

            {/* Charts */}
            <section className={styles.chartRow}>
              <MiniBarChart
                data={stats.dailySignups}
                color="linear-gradient(180deg, #818cf8 0%, #6366f1 100%)"
                label="User Sign-ups (7 days)"
              />
              <MiniBarChart
                data={stats.dailyBoards}
                color="linear-gradient(180deg, #a78bfa 0%, #8b5cf6 100%)"
                label="Boards Created (7 days)"
              />
            </section>

            {/* Tables */}
            <section className={styles.tableRow}>
              {/* Recent users */}
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Recent Users</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className={styles.userCell}>
                              {u.image ? (
                                <Image
                                  src={u.image}
                                  alt=""
                                  width={28}
                                  height={28}
                                  className={styles.avatar}
                                />
                              ) : (
                                <div className={styles.avatarFallback}>
                                  {(u.name || u.email || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <span>{u.name || "—"}</span>
                            </div>
                          </td>
                          <td className={styles.mutedCell}>
                            {u.email || "—"}
                          </td>
                        </tr>
                      ))}
                      {stats.recentUsers.length === 0 && (
                        <tr>
                          <td colSpan={2} className={styles.emptyCell}>
                            No users yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent boards */}
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Recent Boards</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Board</th>
                        <th>Owner</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentBoards.map((b) => (
                        <tr key={b.id}>
                          <td>{b.name || "Untitled"}</td>
                          <td className={styles.mutedCell}>
                            {b.user.name || b.user.email || "—"}
                          </td>
                          <td className={styles.mutedCell}>
                            {timeAgo(b.updatedAt)}
                          </td>
                        </tr>
                      ))}
                      {stats.recentBoards.length === 0 && (
                        <tr>
                          <td colSpan={3} className={styles.emptyCell}>
                            No boards yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/* ---- stat card ---- */
function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <p className={styles.statValue}>{value.toLocaleString()}</p>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statSub}>{sub}</p>
      </div>
    </div>
  );
}

/* ---- icons ---- */
function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  );
}
function BoardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
  );
}
function SessionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
  );
}
function AvgIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  );
}
