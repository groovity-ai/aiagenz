"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/ThemeToggle"

const sidebarNav = [
    {
        title: "Getting Started",
        items: [
            { title: "Introduction", href: "/docs" },
            { title: "Installation", href: "/docs/installation" },
            { title: "Quick Start", href: "/docs/quick-start" },
        ]
    },
    {
        title: "Core Concepts",
        items: [
            { title: "Agents", href: "/docs/agents" },
            { title: "Sandboxing", href: "/docs/sandboxing" },
            { title: "Marketplace", href: "/docs/marketplace" },
        ]
    },
    {
        title: "API Reference",
        items: [
            { title: "Authentication", href: "/docs/api/auth" },
            { title: "Projects", href: "/docs/api/projects" },
            { title: "Webhooks", href: "/docs/api/webhooks" },
        ]
    }
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="flex min-h-screen bg-muted/10">
            <aside className="fixed top-14 left-0 z-30 hidden w-64 h-[calc(100vh-3.5rem)] border-r bg-background md:flex md:flex-col">
                <ScrollArea className="flex-1 py-6 pr-6 lg:py-8">
                    {sidebarNav.map((group, i) => (
                        <div key={i} className="pb-4 px-6">
                            <h4 className="mb-1 rounded-md px-2 py-1 text-sm font-semibold">{group.title}</h4>
                            {group.items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "block rounded-md px-2 py-1 text-sm hover:bg-muted hover:text-foreground transition-colors",
                                        pathname === item.href ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    {item.title}
                                </Link>
                            ))}
                        </div>
                    ))}
                </ScrollArea>
                <div className="p-4 border-t bg-background">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-sm font-medium text-muted-foreground">Appearance</span>
                        <ThemeToggle />
                    </div>
                </div>
            </aside>
            <main className="flex-1 md:ml-64 px-4 py-8 md:px-8 lg:px-12 bg-background/50">
                <div className="mx-auto max-w-4xl">
                    {children}
                </div>
            </main>
        </div>
    )
}
