"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Terminal, LayoutDashboard, ShoppingBag, Settings, FileText, LogOut } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"

const sidebarItems = [
    { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { title: "Marketplace", href: "/marketplace", icon: ShoppingBag },
    { title: "Documentation", href: "/docs", icon: FileText },
    { title: "Settings", href: "/dashboard/settings", icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            toast.success("Logged out successfully")
            router.push('/login')
            router.refresh()
        } catch {
            toast.error("Logout failed")
        }
    }

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <aside className="fixed top-0 left-0 z-30 hidden w-64 h-screen border-r border-border/50 bg-sidebar md:flex md:flex-col transition-all duration-300">
                <div className="flex h-16 items-center px-6">
                    <Link href="/" className="flex items-center gap-3 font-bold text-lg tracking-tight">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <Terminal className="h-4 w-4" />
                        </div>
                        <span>AiAgenz</span>
                    </Link>
                </div>

                <ScrollArea className="flex-1 py-6 px-4">
                    <nav className="flex flex-col gap-2">
                        {sidebarItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                    pathname === item.href
                                        ? "bg-primary/5 text-primary shadow-sm ring-1 ring-primary/10"
                                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                )}
                            >
                                <item.icon className={cn("h-4 w-4", pathname === item.href ? "text-primary" : "text-muted-foreground")} />
                                {item.title}
                            </Link>
                        ))}
                    </nav>
                </ScrollArea>

                <div className="p-4 border-t bg-background space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-sm font-medium text-muted-foreground">Theme</span>
                        <ThemeToggle />
                    </div>
                    <Button
                        variant="outline"
                        className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Log out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 bg-muted/10">
                {/* Mobile Header (Visible only on small screens) */}
                <header className="md:hidden sticky top-0 z-30 flex h-16 items-center border-b bg-background/80 px-4 backdrop-blur-md">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="mr-2 -ml-2">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle mobile menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 flex flex-col w-[280px]">
                            <div className="flex h-16 items-center px-6 border-b">
                                <Link href="/" className="flex items-center gap-3 font-bold text-lg tracking-tight">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                        <Terminal className="h-4 w-4" />
                                    </div>
                                    <span>AiAgenz</span>
                                </Link>
                            </div>

                            <ScrollArea className="flex-1 py-6 px-4">
                                <nav className="flex flex-col gap-2">
                                    {sidebarItems.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                                pathname === item.href
                                                    ? "bg-primary/5 text-primary shadow-sm ring-1 ring-primary/10"
                                                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                            )}
                                        >
                                            <item.icon className={cn("h-4 w-4", pathname === item.href ? "text-primary" : "text-muted-foreground")} />
                                            {item.title}
                                        </Link>
                                    ))}
                                </nav>
                            </ScrollArea>

                            <div className="p-4 border-t bg-background space-y-4">
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Link href="/" className="flex items-center gap-2 font-bold ml-2">
                        <Terminal className="h-5 w-5" />
                        <span>AiAgenz</span>
                    </Link>
                    <div className="ml-auto">
                        <ThemeToggle />
                    </div>
                </header>

                <div className="p-4 sm:px-8 sm:py-8 min-h-[calc(100vh-4rem)] md:min-h-screen">
                    {children}
                </div>
            </main>
        </div>
    )
}
