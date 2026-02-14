"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import PageTransition from "@/components/PageTransition"
import { motion } from "framer-motion"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const plans = [
    {
        name: "Starter",
        price: 5,
        description: "Perfect for hobbyists and improved side projects.",
        features: [
            "2 vCPU / 4GB RAM",
            "20GB NVMe Storage",
            "Community Support",
            "Standard Network",
            "1 Agent Limit"
        ],
        missing: ["Priority Support", "Custom Domain", "SLA Guarantee"]
    },
    {
        name: "Pro",
        price: 15,
        popular: true,
        description: "For professional developers building production agents.",
        features: [
            "4 vCPU / 8GB RAM",
            "40GB NVMe Storage",
            "Priority Email Support",
            "Fast Network",
            "5 Agent Limit",
            "Custom Domain"
        ],
        missing: ["SLA Guarantee"]
    },
    {
        name: "Business",
        price: 40,
        description: "For teams and businesses scaling their AI workforce.",
        features: [
            "8 vCPU / 16GB RAM",
            "100GB NVMe Storage",
            "24/7 Priority Support",
            "Ultra-Fast Network",
            "Unlimited Agents",
            "Custom Domain",
            "99.9% SLA Guarantee"
        ],
        missing: []
    }
]

export default function PricingPage() {
    const [isYearly, setIsYearly] = useState(false)

    return (
        <PageTransition className="min-h-screen py-20 px-4 flex flex-col items-center justify-center">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
                    Simple, Transparent Pricing.
                </h1>
                <p className="text-xl text-muted-foreground">
                    Start small and scale your autonomous workforce as you grow.
                </p>

                <div className="flex items-center justify-center gap-4 pt-4">
                    <Label htmlFor="billing-toggle" className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>Monthly</Label>
                    <Switch id="billing-toggle" checked={isYearly} onCheckedChange={setIsYearly} />
                    <Label htmlFor="billing-toggle" className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                        Yearly <span className="text-xs text-green-500 font-bold ml-1">SAVE 20%</span>
                    </Label>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl w-full">
                {plans.map((plan, i) => (
                    <motion.div
                        key={plan.name}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        whileHover={{ y: -10 }}
                        className={`relative rounded-3xl p-8 flex flex-col gap-6 transition-all duration-300 ${plan.popular
                            ? "bg-primary/5 border-2 border-primary shadow-2xl shadow-primary/10 scale-105 z-10"
                            : "bg-card border border-border/50 hover:border-primary/30"}`}
                    >
                        {plan.popular && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                                MOST POPULAR
                            </div>
                        )}

                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold">{plan.name}</h3>
                            <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>

                        <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-extrabold tracking-tight">
                                ${isYearly ? (plan.price * 0.8).toFixed(0) : plan.price}
                            </span>
                            <span className="text-muted-foreground font-medium">/mo</span>
                        </div>

                        <div className="flex-1 space-y-4">
                            {plan.features.map(feat => (
                                <div key={feat} className="flex items-start gap-3 text-sm">
                                    <div className={`mt-0.5 rounded-full p-0.5 ${plan.popular ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                        <Check className="h-3 w-3" />
                                    </div>
                                    <span>{feat}</span>
                                </div>
                            ))}
                            {plan.missing.map(feat => (
                                <div key={feat} className="flex items-start gap-3 text-sm text-muted-foreground/50 line-through decoration-muted-foreground/30">
                                    <div className="mt-0.5 rounded-full p-0.5 bg-muted/50">
                                        <X className="h-3 w-3" />
                                    </div>
                                    <span>{feat}</span>
                                </div>
                            ))}
                        </div>

                        <Link href="/dashboard" className="w-full">
                            <Button
                                size="lg"
                                className={`w-full rounded-full h-12 text-base shadow-lg ${plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/25" : "bg-muted/50 text-foreground hover:bg-muted"}`}
                            >
                                Get {plan.name}
                            </Button>
                        </Link>
                    </motion.div>
                ))}
            </div>

            <p className="mt-16 text-center text-muted-foreground text-sm max-w-lg">
                Prices are in USD. Standard data transfer rates apply.
                Need a custom enterprise solution? <Link href="#" className="underline hover:text-foreground">Contact Sales</Link>.
            </p>
        </PageTransition>
    )
}
