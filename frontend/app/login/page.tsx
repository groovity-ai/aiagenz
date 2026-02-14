"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Terminal, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import ParticleBackground from "@/components/ParticleBackground"
import PageTransition from "@/components/PageTransition"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()

      if (res.ok) {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.token })
        })
        toast.success("Welcome back!")
        router.push('/dashboard')
        router.refresh()
      } else {
        toast.error(data.error || "Login failed")
      }
    } catch (e) {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageTransition className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <ParticleBackground />

      {/* Decorative Gradient Blob */}
      <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[100px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[100px]" />

      <div className="z-10 w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xl mb-4">
            <Terminal className="h-6 w-6" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">AiAgenz</h1>
          <p className="mt-2 text-muted-foreground text-lg">Deploy autonomous agents in seconds.</p>
        </div>

        <Card className="bg-card/60 backdrop-blur-xl border-white/20 shadow-2xl">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Access your agent control plane
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>
              <Button className="w-full text-base py-6" disabled={loading} size="lg">
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account? <span className="text-primary font-medium cursor-pointer hover:underline">Contact Sales</span>
        </p>
      </div>
    </PageTransition>
  )
}
