"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Search, Star, TrendingUp, MessageSquare, PenTool, ShieldCheck, ShoppingBag, Loader2, Bot, Zap } from "lucide-react"
import PageTransition from "@/components/PageTransition"
import { motion } from "framer-motion"
import { useState } from "react"

const categories = ["All", "Trading", "Customer Service", "Content", "Productivity"]

const agents = [
  {
    id: "sahabatcuan",
    name: "SahabatCuan",
    description: "AI Trading Assistant specializing in Indonesian stocks (IHSG) and Crypto. Automated signals & technical analysis.",
    price: "Rp 150.000",
    rating: 4.8,
    reviews: 128,
    category: "Trading",
    icon: TrendingUp,
    color: "text-green-500 bg-green-500/10"
  },
  {
    id: "cs-toko",
    name: "CS Toko Online",
    description: "24/7 Customer Service agent for WhatsApp & Telegram. Handles FAQs, order tracking, and complaints automatically.",
    price: "Rp 99.000",
    rating: 4.9,
    reviews: 856,
    category: "Customer Service",
    icon: MessageSquare,
    color: "text-blue-500 bg-blue-500/10"
  },
  {
    id: "seo-writer",
    name: "SEO Content Pro",
    description: "Generates SEO-optimized articles, blog posts, and social media captions. Integration with WordPress & Ghost.",
    price: "Rp 120.000",
    rating: 4.7,
    reviews: 342,
    category: "Content",
    icon: PenTool,
    color: "text-purple-500 bg-purple-500/10"
  },
  {
    id: "hr-admin",
    name: "HR Admin Helper",
    description: "Automate employee onboarding, leave requests, and policy Q&A. Connects with HRIS systems.",
    price: "Rp 200.000",
    rating: 4.5,
    reviews: 56,
    category: "Productivity",
    icon: ShieldCheck,
    color: "text-orange-500 bg-orange-500/10"
  },
  {
    id: "sales-bot",
    name: "Sales Closer",
    description: "Qualifies leads and books meetings. Trained on top sales methodologies.",
    price: "Rp 250.000",
    rating: 4.6,
    reviews: 112,
    category: "Productivity",
    icon: Zap,
    color: "text-yellow-500 bg-yellow-500/10"
  },
  {
    id: "shop-assistant",
    name: "Shop Assistant",
    description: "Personal shopper for e-commerce. Recommends products based on user preferences.",
    price: "Rp 100.000",
    rating: 4.7,
    reviews: 203,
    category: "Customer Service",
    icon: ShoppingBag,
    color: "text-pink-500 bg-pink-500/10"
  }
]

export default function Marketplace() {
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredAgents = agents.filter(agent => {
    const matchesCategory = selectedCategory === "All" || agent.category === selectedCategory
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <PageTransition className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" /> Marketplace
            </h1>
          </div>

          <div className="hidden md:flex relative max-w-md w-full mx-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search for agents..."
              className="pl-10 h-10 rounded-full bg-muted/50 focus:bg-background transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Link href="/dashboard">
            <Button variant="outline" className="rounded-full">Go to Dashboard</Button>
          </Link>
        </div>
      </header>

      {/* Mobile Search */}
      <div className="md:hidden px-4 py-3 border-b bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search agents..."
            className="pl-10 h-10 w-full rounded-full bg-muted/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <main className="container px-4 py-8">

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-6 scrollbar-hide">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              onClick={() => setSelectedCategory(cat)}
              className="rounded-full whitespace-nowrap"
              size="sm"
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAgents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full flex flex-col hover:border-primary/50 transition-colors duration-300 group">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl ${agent.color}`}>
                      <agent.icon className="h-6 w-6" />
                    </div>
                    <Badge variant="secondary" className="rounded-full font-normal">
                      {agent.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{agent.name}</CardTitle>
                  <div className="flex items-center gap-1 text-sm text-yellow-500 mt-1">
                    <Star className="h-3 w-3 fill-current" />
                    <span className="font-semibold text-foreground">{agent.rating}</span>
                    <span className="text-muted-foreground">({agent.reviews})</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-muted-foreground text-sm leading-relaxed">{agent.description}</p>
                </CardContent>
                <CardFooter className="pt-4 border-t flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Starting from</span>
                    <span className="font-bold text-lg">{agent.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                  </div>
                  <Link href={`/dashboard?install=${agent.id}`}>
                    <Button size="sm" className="rounded-full px-6 shadow-lg shadow-primary/20">Rent</Button>
                  </Link>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>

        {filteredAgents.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-muted/30 p-4 rounded-full inline-flex mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No agents found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters.</p>
            <Button variant="link" onClick={() => { setSearchQuery(""); setSelectedCategory("All") }}>Clear all filters</Button>
          </div>
        )}

      </main>
    </PageTransition>
  )
}
