import typography from "@tailwindcss/typography"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        eyebrow: ["var(--type-eyebrow)", { lineHeight: "1", letterSpacing: "0.08em", fontWeight: "700" }],
        "body-sm": ["var(--type-body-sm)", { lineHeight: "1.55" }],
        "card-title": ["var(--type-card-title)", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "page-title": ["var(--type-page-title)", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }],
        "page-subtitle": ["var(--type-page-subtitle)", { lineHeight: "1.55", fontWeight: "400" }],
      },
      colors: {
        terminal: {
          bg: "rgb(var(--terminal-bg) / <alpha-value>)",
          panel: "rgb(var(--terminal-panel) / <alpha-value>)",
          border: "rgb(var(--terminal-border) / <alpha-value>)",
          text: "rgb(var(--terminal-text) / <alpha-value>)",
          muted: "rgb(var(--terminal-muted) / <alpha-value>)",
          accent: "rgb(var(--terminal-accent) / <alpha-value>)",
          success: "rgb(var(--terminal-success) / <alpha-value>)",
          error: "rgb(var(--terminal-error) / <alpha-value>)",
          warning: "rgb(var(--terminal-warning) / <alpha-value>)",
          code: "rgb(var(--terminal-code) / <alpha-value>)",
          "window-bg": "rgb(var(--terminal-window-bg) / <alpha-value>)",
          "window-border": "rgb(var(--terminal-window-border) / <alpha-value>)",
          "window-code": "rgb(var(--terminal-window-code) / <alpha-value>)",
        },
        brand: {
          red: "rgb(var(--brand-red) / <alpha-value>)",
          green: "rgb(var(--brand-green) / <alpha-value>)",
        },
        surface: {
          hover: "var(--surface-hover)",
          active: "var(--surface-active)",
        },
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        strong: "var(--shadow-strong)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-expo": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": theme("colors.terminal.text"),
            "--tw-prose-headings": theme("colors.terminal.text"),
            "--tw-prose-lead": theme("colors.terminal.muted"),
            "--tw-prose-links": theme("colors.terminal.text"),
            "--tw-prose-bold": theme("colors.terminal.text"),
            "--tw-prose-counters": theme("colors.terminal.muted"),
            "--tw-prose-bullets": theme("colors.terminal.muted"),
            "--tw-prose-hr": theme("colors.terminal.border"),
            "--tw-prose-quotes": theme("colors.terminal.muted"),
            "--tw-prose-quote-borders": theme("colors.terminal.border"),
            "--tw-prose-captions": theme("colors.terminal.muted"),
            "--tw-prose-code": theme("colors.terminal.text"),
            "--tw-prose-pre-code": theme("colors.terminal.text"),
            "--tw-prose-pre-bg": theme("colors.terminal.code"),
            "--tw-prose-th-borders": theme("colors.terminal.border"),
            "--tw-prose-td-borders": theme("colors.terminal.border"),
            maxWidth: "none",
            lineHeight: "1.75",
            blockquote: { fontStyle: "normal" },
            em: { fontStyle: "normal", fontWeight: "500" },
            a: {
              fontWeight: "500",
              textDecorationColor: theme("colors.terminal.border"),
              textUnderlineOffset: "3px",
            },
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            code: {
              backgroundColor: theme("colors.terminal.panel"),
              padding: "0.15rem 0.35rem",
              borderRadius: "0.3rem",
              fontWeight: "500",
              fontSize: "0.86em",
              border: `1px solid ${theme("colors.terminal.border")}`,
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
}
