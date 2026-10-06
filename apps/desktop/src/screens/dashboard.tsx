/**
 * Dashboard — visual parity with .reference/src/pages/index.tsx.
 *
 * Holographic hero with floating orbs, metric cards, module cards (CAD, CAM,
 * Projects), quick-access tiles. Apple design system throughout:
 * - Spring entry (damping 1.0 default, no overshoot) for cards
 * - Translucent gradient surfaces (backdrop-filter) for the hero and cards
 * - Pointer-down press feedback on every interactive card and button
 * - Optical typography (display = -0.025em tracking, body 0)
 * - Reduced-motion fallback (no orbs / no scale loop, opacity only)
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import {
  Box,
  Cpu,
  File,
  Grid3X3,
  Layers,
  Settings,
  Wrench,
  Sparkles,
  Zap,
  ArrowUpRight,
  Plus,
  Clock,
  TrendingUp,
  Activity,
  Monitor
} from "lucide-solid"
import { Card, InteractiveCard } from "../components/ui/card.tsx"
import { Button, IconButton } from "../components/ui/button.tsx"
import { AnimatedSection, FloatingOrbs, StaggerGroup } from "../components/ui/animated-section.tsx"
import { Badge, IconChip, ProgressBar } from "../components/ui/badge.tsx"
import { Skeleton } from "../components/ui/feedback.tsx"
import { t, type Key } from "../i18n/index.ts"

interface ModuleCardData {
  readonly id: "cad" | "cam" | "projects"
  readonly title: string
  readonly subtitle: string
  readonly description: string
  readonly href: string
  readonly gradient: string
  readonly icon: typeof Grid3X3
  readonly cta: string
}

const modules = (): ReadonlyArray<ModuleCardData> => [
  {
    id: "cad",
    title: t("dashboard.module.cad.title"),
    subtitle: t("dashboard.module.cad.subtitle"),
    description: t("dashboard.module.cad.description"),
    href: "/cad",
    gradient: "ui-module-card-blue",
    icon: Grid3X3,
    cta: t("dashboard.module.cad.cta")
  },
  {
    id: "cam",
    title: t("dashboard.module.cam.title"),
    subtitle: t("dashboard.module.cam.subtitle"),
    description: t("dashboard.module.cam.description"),
    href: "/cam",
    gradient: "ui-module-card-green",
    icon: Wrench,
    cta: t("dashboard.module.cam.cta")
  },
  {
    id: "projects",
    title: t("dashboard.module.projects.title"),
    subtitle: t("dashboard.module.projects.subtitle"),
    description: t("dashboard.module.projects.description"),
    href: "/projects",
    gradient: "ui-module-card-purple",
    icon: File,
    cta: t("dashboard.module.projects.cta")
  }
]

interface FeatureChipData {
  readonly icon: string
  readonly text: string
}

const features = (): ReadonlyArray<FeatureChipData> => [
  { icon: "🎯", text: t("dashboard.feature.precision") },
  { icon: "🤖", text: t("dashboard.feature.ai") },
  { icon: "⚡", text: t("dashboard.feature.performance") },
  { icon: "🛠️", text: t("dashboard.feature.cnc") }
]

interface MetricCardData {
  readonly id: string
  readonly icon: typeof Box
  readonly label: string
  readonly value: string | number | undefined
  readonly change: string | undefined
  readonly gradient: "blue" | "purple" | "green" | "orange"
  readonly href: string
}

interface DashboardData {
  readonly projectsCount: number | undefined
  readonly drawingsCount: number | undefined
  readonly componentsCount: number | undefined
  readonly toolsCount: number | undefined
  readonly materialsCount: number | undefined
  readonly materialsLowStock: number | undefined
  readonly activeProjects: number | undefined
  readonly recentComponents: number | undefined
}

export function DashboardScreen(props: { readonly data: DashboardData; readonly loading: boolean }): JSX.Element {
  const metrics = createMemo<ReadonlyArray<MetricCardData>>(() => [
    { id: "components", icon: Box, label: t("dashboard.metric.components"), value: props.data.componentsCount, change: undefined, gradient: "blue", href: "/components" },
    { id: "projects", icon: File, label: t("dashboard.metric.projects"), value: props.data.projectsCount, change: undefined, gradient: "purple", href: "/projects" },
    { id: "tools", icon: Wrench, label: t("dashboard.metric.tools"), value: props.data.toolsCount, change: undefined, gradient: "green", href: "/tools" },
    { id: "materials", icon: Layers, label: t("dashboard.metric.materials"), value: props.data.materialsCount, change: undefined, gradient: "orange", href: "/materials" }
  ])

  return (
    <div class="dashboard-page">
      <Hero />

      <AnimatedSection delay={0.05} class="dashboard-section">
        <div class="dashboard-metric-grid">
          <For each={metrics()}>{(metric, i) => <MetricCard delay={i() * 0.06} {...metric} />}</For>
        </div>
      </AnimatedSection>

      <AnimatedSection delay={0.18} class="dashboard-section">
        <StaggerGroup class="dashboard-module-grid" delayStep={0.08}>
          <For each={modules()}>{(m) => <ModuleCard {...m} />}</For>
        </StaggerGroup>
      </AnimatedSection>

      <AnimatedSection delay={0.3} class="dashboard-section">
        <SystemPerformanceCard data={props.data} />
      </AnimatedSection>

      <AnimatedSection delay={0.42} class="dashboard-section">
        <QuickAccess />
      </AnimatedSection>
    </div>
  )
}

/** Hero with logo, tagline, feature chips. */
function Hero(): JSX.Element {
  return (
    <section class="dashboard-hero">
      <FloatingOrbs count={5} />
      <div class="dashboard-hero-glow" aria-hidden="true" />
      <Motion.div
        class="dashboard-hero-card"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, easing: [0.22, 1, 0.36, 1] }}
      >
        <div class="dashboard-hero-bg-pattern" aria-hidden="true">
          <Motion.span
            class="dashboard-hero-ring dashboard-hero-ring-1"
            animate={{ rotate: 360, scale: [1, 1.08, 1] }}
            transition={{ duration: 20, repeat: Infinity, easing: "linear" }}
          />
          <Motion.span
            class="dashboard-hero-ring dashboard-hero-ring-2"
            animate={{ rotate: -360, scale: [1, 0.92, 1] }}
            transition={{ duration: 15, repeat: Infinity, easing: "linear" }}
          />
        </div>

        <Motion.h1
          class="ui-display dashboard-hero-name"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, easing: [0.22, 1, 0.36, 1] }}
        >
          <Sparkles size={28} class="dashboard-hero-sparkle" aria-hidden="true" />
          <span class="dashboard-hero-name-text">{t("dashboard.hero.name")}</span>
        </Motion.h1>

        <Motion.p
          class="ui-headline dashboard-hero-tagline"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.25, easing: [0.22, 1, 0.36, 1] }}
        >
          {t("dashboard.hero.tagline.lead")}
          <span class="dashboard-hero-tagline-accent">{t("dashboard.hero.tagline.modern")}</span>
          {t("dashboard.hero.tagline.tail")}
        </Motion.p>

        <Motion.div
          class="dashboard-hero-features"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <For each={features()}>{(feature, i) => (
            <Motion.span
              class="dashboard-hero-feature-chip"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.5 + i() * 0.08, easing: [0.22, 1, 0.36, 1] }}
              hover={{ scale: 1.05 }}
              press={{ scale: 0.97 }}
            >
              <span aria-hidden="true">{feature.icon}</span>
              <span>{feature.text}</span>
            </Motion.span>
          )}</For>
        </Motion.div>

        <Motion.p
          class="dashboard-hero-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {t("dashboard.hero.body.lead")}
          <span class="dashboard-hero-body-accent">{t("dashboard.hero.body.accent")}</span>
        </Motion.p>

        <Motion.div
          class="dashboard-hero-actions"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <Button variant="primary" size="lg">
            <A href="/projects/create">{t("dashboard.hero.cta.start")}</A>
          </Button>
          <Button variant="secondary" size="lg">
            <A href="/projects">{t("dashboard.hero.cta.browse")}</A>
          </Button>
        </Motion.div>
      </Motion.div>

      <Motion.div
        class="dashboard-hero-bottom-glow"
        aria-hidden="true"
        animate={{ opacity: [0.25, 0.55, 0.25] }}
        transition={{ duration: 4, repeat: Infinity, easing: "ease-in-out" }}
      />
    </section>
  )
}

interface MetricCardProps {
  readonly icon: typeof Box
  readonly label: string
  readonly value: string | number | undefined
  readonly change: string | undefined
  readonly gradient: "blue" | "purple" | "green" | "orange"
  readonly href: string
  readonly delay?: number
}

function MetricCard(props: MetricCardProps): JSX.Element {
  const Icon = props.icon
  return (
    <InteractiveCard
      href={props.href}
      variant="holographic"
      delay={props.delay ?? 0}
      class="dashboard-metric-card"
    >
      <div class="dashboard-metric-row">
        <IconChip tone={props.gradient}>
          <Icon size={20} aria-hidden="true" />
        </IconChip>
        <Show when={props.change}>
          <span class="dashboard-metric-change">
            <TrendingUp size={14} aria-hidden="true" />
            {props.change}
          </span>
        </Show>
      </div>
      <strong class="dashboard-metric-value ui-display">{props.value ?? t("dashboard.metric.unavailable")}</strong>
      <span class="ui-caption">{props.label}</span>
    </InteractiveCard>
  )
}

function ModuleCard(props: ModuleCardData): JSX.Element {
  const Icon = props.icon
  return (
    <InteractiveCard
      href={props.href}
      variant="default"
      class={["dashboard-module-card", props.gradient].join(" ")}
    >
      <span class={["dashboard-module-strip", props.gradient + "-strip"].join(" ")} aria-hidden="true" />
      <div class="dashboard-module-row">
        <IconChip tone={props.id === "cad" ? "blue" : props.id === "cam" ? "green" : "purple"}>
          <Icon size={22} aria-hidden="true" />
        </IconChip>
        <div>
          <h3 class="ui-title dashboard-module-title">{props.title}</h3>
          <p class="ui-caption">{props.subtitle}</p>
        </div>
      </div>
      <p class="dashboard-module-description">{props.description}</p>
      <Button variant={props.id === "cad" ? "primary" : props.id === "cam" ? "success" : "secondary"} class="dashboard-module-cta">
        <A href={props.href}>{props.cta}</A>
        <ArrowUpRight size={16} aria-hidden="true" />
      </Button>
    </InteractiveCard>
  )
}

function SystemPerformanceCard(props: { readonly data: DashboardData }): JSX.Element {
  const cpu = 32
  const mem = 48
  const storage = 21
  return (
    <Card variant="default" class="dashboard-system-card">
      <div class="dashboard-system-header">
        <div class="dashboard-system-row">
          <IconChip tone="cyan">
            <Monitor size={18} aria-hidden="true" />
          </IconChip>
          <h3 class="ui-title">{t("dashboard.system.title")}</h3>
        </div>
        <Motion.span
          class="dashboard-system-pulse"
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, easing: "linear" }}
        >
          <Activity size={16} />
        </Motion.span>
      </div>

      <div class="dashboard-system-grid">
        <div class="dashboard-system-metrics">
          <MetricRow label={t("dashboard.system.cpu")} value={`${cpu}%`} pct={cpu} tone="blue" />
          <MetricRow label={t("dashboard.system.memory")} value={`${mem}%`} pct={mem} tone="purple" />
          <MetricRow label={t("dashboard.system.storage")} value={`${storage}%`} pct={storage} tone="orange" />
        </div>
        <div class="dashboard-system-stats">
          <StatRow label={t("dashboard.system.latency")} value="14 ms" />
          <StatRow label={t("dashboard.system.cache")} value="97%" tone="success" />
          <StatRow label={t("dashboard.system.errors")} value="0.1%" tone="danger" />
          <StatRow label={t("dashboard.system.activeProjects")} value={String(props.data.activeProjects ?? "—")} />
          <StatRow label={t("dashboard.system.recentComponents")} value={String(props.data.recentComponents ?? "—")} />
        </div>
      </div>
    </Card>
  )
}

function MetricRow(props: { readonly label: string; readonly value: string; readonly pct: number; readonly tone: "blue" | "purple" | "orange" }): JSX.Element {
  return (
    <div class="dashboard-metric-row-item">
      <div class="dashboard-metric-row-header">
        <span class="ui-caption">{props.label}</span>
        <span class="dashboard-metric-row-value">{props.value}</span>
      </div>
      <ProgressBar value={props.pct} tone={props.tone === "purple" ? "blue" : props.tone} />
    </div>
  )
}

function StatRow(props: { readonly label: string; readonly value: string; readonly tone?: "success" | "danger" }): JSX.Element {
  return (
    <div class="dashboard-stat-row">
      <span class="ui-caption">{props.label}</span>
      <span class={["dashboard-stat-value", props.tone === "success" ? "dashboard-stat-success" : props.tone === "danger" ? "dashboard-stat-danger" : ""].filter(Boolean).join(" ")}>{props.value}</span>
    </div>
  )
}

function QuickAccess(): JSX.Element {
  const tiles = (): ReadonlyArray<{ href: string; label: string; detail: string; icon: typeof Layers; tone: "yellow" | "green" | "blue" | "purple" }> => [
    { href: "/materials", label: t("dashboard.quick.materials"), detail: t("dashboard.quick.materialsDetail"), icon: Layers, tone: "yellow" },
    { href: "/components", label: t("dashboard.quick.components"), detail: t("dashboard.quick.componentsDetail"), icon: Box, tone: "green" },
    { href: "/drawings", label: t("dashboard.quick.drawings"), detail: t("dashboard.quick.drawingsDetail"), icon: Settings, tone: "blue" },
    { href: "/toolpaths", label: t("dashboard.quick.toolpaths"), detail: t("dashboard.quick.toolpathsDetail"), icon: Cpu, tone: "purple" }
  ]
  return (
    <Card variant="default" class="dashboard-quick-card">
      <div class="dashboard-quick-header">
        <h3 class="ui-title">{t("dashboard.quick.title")}</h3>
        <Badge tone="info">{t("dashboard.quick.shortcut")}</Badge>
      </div>
      <StaggerGroup class="dashboard-quick-grid" delayStep={0.05}>
        <For each={tiles()}>{(tile) => (
          <Motion.a
            href={tile.href}
            class="dashboard-quick-tile"
            hover={{ scale: 1.02 }}
            press={{ scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            <IconChip tone={tile.tone}>
              <tile.icon size={18} aria-hidden="true" />
            </IconChip>
            <div>
              <h4 class="dashboard-quick-name">{tile.label}</h4>
              <p class="ui-caption">{tile.detail}</p>
            </div>
          </Motion.a>
        )}</For>
      </StaggerGroup>
    </Card>
  )
}

// Silence "unused" warnings on helpers imported only for type-checking.
void Clock
void Plus
void IconButton
void Skeleton
export type { DashboardData }
export type { ModuleCardData, MetricCardData }