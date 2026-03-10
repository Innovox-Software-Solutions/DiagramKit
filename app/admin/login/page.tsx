"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("info@innovox.in");
  const [password, setPassword] = useState("innovox@2709");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Check if already authenticated
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem("admin_auth") === "true") {
        router.replace("/admin/dashboard");
        return;
      }
    }
    // Use a microtask to avoid synchronous setState inside effect
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShake(false);

    if (
      email.trim() === "info@innovox.in" &&
      password === "innovox@2709"
    ) {
      sessionStorage.setItem("admin_auth", "true");
      router.push("/admin/dashboard");
    } else {
      setError("Invalid credentials");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  };

  if (!mounted) return null;

  return (
    <div className={styles.wrapper}>
      {/* Background grid */}
      <div className={styles.gridBg} />

      {/* Glowing orbs */}
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />

      <form
        onSubmit={handleLogin}
        className={`${styles.card} ${shake ? styles.shake : ""}`}
      >
        {/* Logo */}
        <div className={styles.logoRow}>
          <span className={styles.logoText}>Innovox</span>
          <span className={styles.adminBadge}>Admin</span>
        </div>

        {/* Heading */}
        <h1 className={styles.heading}>Welcome Back</h1>
        <p className={styles.subtext}>Sign in to your admin panel</p>

        {/* Email */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="admin-email">
            Email
          </label>
          <div className={styles.inputWrap}>
            <svg
              className={styles.inputIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <input
              id="admin-email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        {/* Password */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="admin-password">
            Password
          </label>
          <div className={styles.inputWrap}>
            <svg
              className={styles.inputIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" x2="23" y1="1" y2="23" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Submit */}
        <button type="submit" className={styles.loginBtn}>
          Sign In
        </button>
      </form>
    </div>
  );
}
