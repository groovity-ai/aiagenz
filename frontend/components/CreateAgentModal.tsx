"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    X, ArrowRight, ArrowLeft, Bot, Package,
    Cpu, MemoryStick, HardDrive, Globe,
    Loader2, CheckCircle2, Terminal, ChevronDown, ChevronUp, Sparkles, Zap
} from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Plan {
    id: string
    name: string
    cpu: number
    memoryMb: number
    storageGb: number
    egressGb: number
    priceUsd: number
    popular: boolean
}

interface CreateAgentModalProps {
    open: boolean
    onClose: () => void
    onCreated: () => void
}

type AgentType = "starter" | "prebuild"
type Step = 0 | 1 | 2 | 3

const STEP_LABELS = ["Identity", "Resources", "Config", "Launch"]

const DEPLOY_STAGES = [
    "Allocating secure sandbox...",
    "Pulling neural engine...",
    "Injecting configuration...",
    "Booting autonomous core...",
    "Establishing uplink...",
]

const PROVIDERS = {
    google: ["google/google/gemini-3-flash-preview", "google/gemini-3-pro-preview"],
    openai: ["openai/gpt-4o", "openai/gpt-3.5-turbo"],
    anthropic: ["anthropic/claude-3-5-sonnet"],
    "google-antigravity": ["google-antigravity/gemini-3-pro-high", "google-antigravity/gemini-3-pro-low"]
}

export default function CreateAgentModal({ open, onClose, onCreated }: CreateAgentModalProps) {
    const router = useRouter()
    const [step, setStep] = useState<Step>(0)
    const [plans, setPlans] = useState<Plan[]>([])

    // Form state
    const [agentName, setAgentName] = useState("")
    const [agentType, setAgentType] = useState<AgentType>("starter")
    const [selectedPlan, setSelectedPlan] = useState("starter")
    const [telegramToken, setTelegramToken] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [provider, setProvider] = useState("google")
    const [model, setModel] = useState("google/google/gemini-3-flash-preview")
    const [availableModels, setAvailableModels] = useState<string[]>(PROVIDERS.google)

    // Deploy state
    const [deploying, setDeploying] = useState(false)
    const [deployStage, setDeployStage] = useState(0)
    const [deploySuccess, setDeploySuccess] = useState(false)
    const [deployError, setDeployError] = useState<string | null>(null)
    const [showTerminal, setShowTerminal] = useState(false)
    const [terminalLogs, setTerminalLogs] = useState<string[]>([])
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)

    // Fetch plans on mount
    useEffect(() => {
        if (open) {
            fetch("/api/plans")
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data)) setPlans(data)
                })
                .catch(() => toast.error("Failed to load plans"))
        }
    }, [open])

    // Reset on open
    useEffect(() => {
        if (open) {
            setStep(0)
            setAgentName("")
            setAgentType("starter")
            setSelectedPlan("starter")
            setTelegramToken("")
            setApiKey("")
            setProvider("google")
            setModel("google/gemini-3-flash-preview")
            setDeploying(false)
            setDeployStage(0)
            setDeploySuccess(false)
            setDeployError(null)
            setShowTerminal(false)
            setTerminalLogs([])
            setCreatedProjectId(null)
        }
    }, [open])

    useEffect(() => {
        setAvailableModels(PROVIDERS[provider as keyof typeof PROVIDERS] || [])
        setModel(PROVIDERS[provider as keyof typeof PROVIDERS]?.[0] || "")
    }, [provider])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!open) return
            if (e.key === "Escape" && !deploying) onClose()
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [open, deploying, onClose])

    const canProceed = useCallback(() => {
        switch (step) {
            case 0: return agentName.trim().length > 0
            case 1: return selectedPlan !== ""
            case 2: return true // Config optional now
            default: return false
        }
    }, [step, agentName, selectedPlan])

    const handleDeploy = async () => {
        setDeploying(true)
        setDeployError(null)
        setTerminalLogs([])

        const addLog = (msg: string) => setTerminalLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

        for (let i = 0; i < DEPLOY_STAGES.length; i++) {
            setDeployStage(i)
            addLog(DEPLOY_STAGES[i])
            await new Promise((r) => setTimeout(r, 800))
        }

        try {
            addLog("Sending payload to control plane...")
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: agentName,
                    type: agentType === "starter" ? "starter" : "marketplace",
                    plan: selectedPlan,
                    telegramToken,
                    apiKey,
                    provider,
                    model
                }),
            })
            const data = await res.json()

            if (data.success !== false && (data.id || data.project?.id)) {
                const projectId = data.id || data.project?.id
                setCreatedProjectId(projectId)
                addLog("✅ Agent online and listening.")
                setDeploySuccess(true)
                toast.success("Agent deployed successfully!")
                onCreated()
            } else {
                const errMsg = data.error || "Unknown error"
                addLog(`❌ FAULT: ${errMsg}`)
                setDeployError(errMsg)
                toast.error("Deploy failed: " + errMsg)
            }
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            addLog(`❌ NETWORK FAULT: ${errMsg}`)
            setDeployError(errMsg)
            toast.error("Deployment error: " + errMsg)
        } finally {
            setDeploying(false)
        }
    }

    const nextStep = () => {
        if (step === 2) {
            setStep(3)
            handleDeploy()
        } else if (step < 3) {
            setStep((step + 1) as Step)
        }
    }

    const prevStep = () => {
        if (step > 0 && step < 3) setStep((step - 1) as Step)
    }

    if (!open) return null

    const plan = plans.find((p) => p.id === selectedPlan)

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative z-10 w-full max-w-3xl bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 py-6 border-b border-border/50">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight">Deploy Agent</h2>
                                <p className="text-sm text-muted-foreground">Configure your autonomous instance</p>
                            </div>
                            {!deploying && (
                                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                                    <X className="h-5 w-5" />
                                </Button>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="px-8 pt-6">
                            <div className="flex justify-between mb-2">
                                {STEP_LABELS.map((label, i) => (
                                    <span key={label} className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${i <= step ? "text-primary" : "text-muted-foreground/50"}`}>
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-primary"
                                    initial={{ width: "0%" }}
                                    animate={{ width: `${((step + 1) / 4) * 100}%` }}
                                    transition={{ duration: 0.5, ease: "easeInOut" }}
                                />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-8 py-8 min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {step === 0 && (
                                    <motion.div
                                        key="step0"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-8"
                                    >
                                        <div className="space-y-4">
                                            <Label className="text-lg">What should we call your agent?</Label>
                                            <Input
                                                placeholder="e.g. Jarvis, Friday, Hal..."
                                                value={agentName}
                                                onChange={(e) => setAgentName(e.target.value)}
                                                autoFocus
                                                className="h-14 text-lg px-6"
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <Label className="text-lg">Choose Architecture</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div
                                                    className={`cursor-pointer group relative p-6 rounded-2xl border-2 transition-all duration-200 ${agentType === "starter" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                                                    onClick={() => setAgentType("starter")}
                                                >
                                                    <div className="flex items-center gap-4 mb-3">
                                                        <div className={`p-3 rounded-xl ${agentType === "starter" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                                            <Bot className="h-6 w-6" />
                                                        </div>
                                                        <div className="font-bold text-lg">Blank Slate</div>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">Start with a clean OpenClaw instance. Perfect for custom development.</p>
                                                </div>

                                                <div
                                                    className={`cursor-pointer group relative p-6 rounded-2xl border-2 transition-all duration-200 ${agentType === "prebuild" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                                                    onClick={() => setAgentType("prebuild")}
                                                >
                                                    <div className="flex items-center gap-4 mb-3">
                                                        <div className={`p-3 rounded-xl ${agentType === "prebuild" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                                            <Package className="h-6 w-6" />
                                                        </div>
                                                        <div className="font-bold text-lg">Marketplace Template</div>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">Pre-configured agents for specific tasks. Quick start.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {step === 1 && (
                                    <motion.div
                                        key="step1"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="text-center mb-8">
                                            <h3 className="text-xl font-bold">Select Compute Plan</h3>
                                            <p className="text-muted-foreground">Scale your agent's resources as needed.</p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            {plans.map((p) => (
                                                <div
                                                    key={p.id}
                                                    className={`cursor-pointer relative p-6 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center text-center ${selectedPlan === p.id
                                                        ? "border-primary bg-primary/5 shadow-lg scale-105 z-10"
                                                        : "border-border hover:border-primary/30"}`}
                                                    onClick={() => setSelectedPlan(p.id)}
                                                >
                                                    {p.popular && (
                                                        <div className="absolute -top-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">
                                                            RECOMMENDED
                                                        </div>
                                                    )}
                                                    <h4 className="font-bold text-lg mb-1">{p.name}</h4>
                                                    <div className="text-3xl font-bold mb-4">
                                                        ${(p.priceUsd / 100).toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                                                    </div>

                                                    <div className="space-y-3 w-full text-sm text-muted-foreground">
                                                        <div className="flex items-center justify-between w-full border-b pb-2">
                                                            <span>CPU</span>
                                                            <span className="font-medium text-foreground">{p.cpu} vCore</span>
                                                        </div>
                                                        <div className="flex items-center justify-between w-full border-b pb-2">
                                                            <span>RAM</span>
                                                            <span className="font-medium text-foreground">{p.memoryMb >= 1024 ? `${p.memoryMb / 1024} GB` : `${p.memoryMb} MB`}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between w-full">
                                                            <span>Storage</span>
                                                            <span className="font-medium text-foreground">{p.storageGb} GB</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {step === 2 && (
                                    <motion.div
                                        key="step2"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                                                    <Zap className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-lg">{agentName}</h4>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <span className="capitalize">{agentType}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{plan?.name} Plan</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-2xl font-bold">
                                                ${(plan?.priceUsd || 0) / 100}
                                                <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>AI Provider</Label>
                                                <Select value={provider} onValueChange={setProvider}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Provider" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="google">Google</SelectItem>
                                                        <SelectItem value="openai">OpenAI</SelectItem>
                                                        <SelectItem value="anthropic">Anthropic</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Model</Label>
                                                <Select value={model} onValueChange={setModel}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Model" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableModels.map(m => (
                                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="api-key">API Key <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                            <Input
                                                id="api-key"
                                                type="password"
                                                placeholder={`sk-... (${provider} key)`}
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="tg-token">Telegram Bot Token <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                            <Input
                                                id="tg-token"
                                                type="password"
                                                placeholder="Required for bot operation"
                                                value={telegramToken}
                                                onChange={(e) => setTelegramToken(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                    </motion.div>
                                )}

                                {step === 3 && (
                                    <motion.div
                                        key="step3"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center justify-center h-full space-y-8 py-8"
                                    >
                                        {!deploySuccess && !deployError && (
                                            <>
                                                <div className="relative">
                                                    <div className="h-24 w-24 rounded-full border-4 border-muted" />
                                                    <div className="absolute inset-0 h-24 w-24 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <Bot className="h-10 w-10 text-primary animate-pulse" />
                                                    </div>
                                                </div>
                                                <div className="text-center space-y-2">
                                                    <h3 className="text-xl font-bold animate-pulse">{DEPLOY_STAGES[deployStage] || "Initializing..."}</h3>
                                                    <p className="text-muted-foreground">Please do not close this window.</p>
                                                </div>
                                            </>
                                        )}

                                        {deploySuccess && (
                                            <>
                                                <div className="h-24 w-24 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/50 animate-bounce">
                                                    <CheckCircle2 className="h-12 w-12 text-white" />
                                                </div>
                                                <div className="text-center space-y-2">
                                                    <h3 className="text-2xl font-bold text-green-600 dark:text-green-400">Deployment Complete</h3>
                                                    <p className="text-muted-foreground">Your agent is now active and reachable.</p>
                                                </div>
                                                <div className="flex gap-4">
                                                    <Button variant="outline" size="lg" onClick={() => { onClose(); onCreated() }}>
                                                        Close
                                                    </Button>
                                                    {createdProjectId && (
                                                        <Button size="lg" onClick={() => router.push(`/dashboard/project/${createdProjectId}`)}>
                                                            Go to Agent Dashboard
                                                        </Button>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {deployError && (
                                            <>
                                                <div className="h-24 w-24 bg-destructive rounded-full flex items-center justify-center shadow-lg shadow-destructive/50">
                                                    <X className="h-12 w-12 text-white" />
                                                </div>
                                                <div className="text-center space-y-2">
                                                    <h3 className="text-2xl font-bold text-destructive">Deployment Failed</h3>
                                                    <p className="text-muted-foreground max-w-sm">{deployError}</p>
                                                </div>
                                                <Button variant="outline" onClick={() => { setStep(2); setDeployError(null) }}>
                                                    Retry Configuration
                                                </Button>
                                            </>
                                        )}

                                        {/* Logs */}
                                        <div className="w-full max-w-lg mt-8 border rounded-xl overflow-hidden bg-zinc-950 text-green-400 font-mono text-xs">
                                            <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                                                <span className="flex items-center gap-2"><Terminal className="h-3 w-3" /> System Logs</span>
                                                <div className="flex gap-1.5">
                                                    <div className="h-2 w-2 rounded-full bg-red-500" />
                                                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                                </div>
                                            </div>
                                            <div className="h-32 overflow-y-auto p-4 space-y-1">
                                                {terminalLogs.map((log, i) => (
                                                    <div key={i}>{log}</div>
                                                ))}
                                                <div className="animate-pulse">_</div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer */}
                        {step < 3 && (
                            <div className="px-8 py-6 border-t border-border/50 bg-muted/20 flex justify-between items-center">
                                {step > 0 ? (
                                    <Button variant="ghost" onClick={prevStep} className="gap-2">
                                        <ArrowLeft className="h-4 w-4" /> Back
                                    </Button>
                                ) : <div />}

                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                                    <Button size="lg" onClick={nextStep} disabled={!canProceed()} className="min-w-[140px] shadow-lg shadow-primary/20">
                                        {step === 2 ? "Launch Agent" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
