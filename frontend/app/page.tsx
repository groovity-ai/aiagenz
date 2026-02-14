"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Terminal, Cpu, ShieldCheck, ArrowRight, Zap, Globe, MessageSquare, TrendingUp, Calendar, LayoutGrid, Users, Code2, Bot, FileText } from "lucide-react"
import ParticleBackground from "@/components/ParticleBackground"
import PageTransition from "@/components/PageTransition"
import { motion } from "framer-motion"
import { ThemeToggle } from "@/components/ThemeToggle"

export default function LandingPage() {
  return (
    <PageTransition className="flex min-h-screen flex-col overflow-hidden relative">
      <ParticleBackground />

      {/* Decorative Gradients */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      <div className="absolute -top-[20%] left-[20%] w-[600px] h-[600px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">AiAgenz</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link href="/features" className="text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="/marketplace" className="text-muted-foreground hover:text-foreground transition-colors">Marketplace</Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="hidden sm:inline-flex">Log in</Button>
            </Link>
            <Link href="/dashboard">
              <Button className="shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-20 pb-20 md:pt-32 md:pb-32 overflow-hidden">
          <div className="container relative z-10 flex flex-col items-center text-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="outline" className="rounded-full px-4 py-1.5 text-sm mb-6 border-primary/20 bg-primary/5 backdrop-blur-sm">
                <span className="mr-2">✨</span> The Future of Work is Autonomous
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-[900px]"
            >
              Deploy Autonomous <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-500 dark:from-white dark:via-zinc-300 dark:to-zinc-500">
                AI Agents
              </span> in Seconds.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg sm:text-xl text-muted-foreground max-w-[600px] mb-10 leading-relaxed"
            >
              The enterprise-grade platform for your digital workforce.
              Launch intelligent agents that work 24/7—integrating seamlessly with your apps and data.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/dashboard">
                <Button size="lg" className="h-14 px-8 text-base rounded-full shadow-xl shadow-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                  Deploy Your First Agent <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="outline" className="h-14 px-8 text-base rounded-full border-2 hover:bg-muted/50 transition-colors">
                  Read Documentation
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="container px-4 py-20 border-t border-border/40">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Built for the Real World</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From customer support to complex financial analysis, our agents are ready to work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0 }}
            >
              <Card className="h-full bg-card/30 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-green-500/10 text-green-600 flex items-center justify-center mb-6">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Smart CS on WhatsApp</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Deploy agents that handle thousands of customer queries instantly on WhatsApp & Telegram.
                    Resolve tickets, track orders, and escalate only when necessary.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="h-full bg-card/30 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-6">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Trading & Finance Assistant</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Monitor markets 24/7. Execute trades based on technical indicators,
                    analyze news sentiment, and manage your portfolio automatically.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="h-full bg-card/30 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center mb-6">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Executive Personal Assistant</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Manage your calendar, draft emails, research topics, and organize your digital life.
                    Your proactive assistant that never sleeps.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Integrations Marquee */}
        <section className="py-12 bg-muted/30 overflow-hidden border-y border-border/40">
          <div className="container px-4 mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Seamlessly Integrated With</p>
          </div>
          <div className="relative flex overflow-x-hidden">
            <div className="animate-marquee whitespace-nowrap flex items-center gap-16 px-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> WhatsApp</span>
              <span className="text-xl font-bold flex items-center gap-2"><Bot className="h-5 w-5" /> Telegram</span>
              <span className="text-xl font-bold flex items-center gap-2"><LayoutGrid className="h-5 w-5" /> Slack</span>
              <span className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Discord</span>
              <span className="text-xl font-bold flex items-center gap-2"><Code2 className="h-5 w-5" /> GitHub</span>
              <span className="text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5" /> Gmail</span>
              <span className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Notion</span>

              {/* Duplicate for seamless loop */}
              <span className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> WhatsApp</span>
              <span className="text-xl font-bold flex items-center gap-2"><Bot className="h-5 w-5" /> Telegram</span>
              <span className="text-xl font-bold flex items-center gap-2"><LayoutGrid className="h-5 w-5" /> Slack</span>
              <span className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Discord</span>
              <span className="text-xl font-bold flex items-center gap-2"><Code2 className="h-5 w-5" /> GitHub</span>
            </div>
          </div>
        </section>

        {/* Features Grid (Refined) */}
        <section className="container px-4 py-20 sm:py-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Enterprise-Grade Infrastructure</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We handle the complex backend so you can focus on building intelligence.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0 }}
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors duration-300">
                <CardContent className="p-8 flex flex-col items-start h-full">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-6">
                    <Cpu className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Serverless Compute</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Deploy any Docker container from GitHub. We handle the provisioning,
                    scaling, and networking automatically.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors duration-300">
                <CardContent className="p-8 flex flex-col items-start h-full">
                  <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-6">
                    <Terminal className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">AI Agent Integrated</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Launch pre-configured intelligent agents instantly.
                    Full access to logs, sandboxed environment, and API controls.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors duration-300">
                <CardContent className="p-8 flex flex-col items-start h-full">
                  <div className="p-3 rounded-2xl bg-green-500/10 text-green-600 dark:text-green-400 mb-6">
                    <ShieldCheck className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Security & Isolation</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Defense-in-depth isolation. Every agent runs in a secure sandbox,
                    ensuring zero-trust security for your workloads.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Start Building CTA */}
        <section className="py-20 border-t border-border/40">
          <div className="container px-4 text-center">
            <h2 className="text-4xl font-extrabold mb-6">Ready to launch?</h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
              Join thousands of developers building the next generation of autonomous applications.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="h-14 px-10 text-lg rounded-full shadow-2xl shadow-primary/30 hover:scale-105 transition-transform">
                Get Started for Free
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t border-border/40 bg-background">
          <div className="container px-4 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold text-muted-foreground">AiAgenz © 2026</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground items-center">
              <Link href="#" className="hover:text-foreground">Privacy</Link>
              <Link href="#" className="hover:text-foreground">Terms</Link>
              <Link href="#" className="hover:text-foreground">Twitter</Link>
              <Link href="#" className="hover:text-foreground">GitHub</Link>
              <div className="pl-4 border-l ml-2">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </footer>
      </main>
    </PageTransition>
  )
}
