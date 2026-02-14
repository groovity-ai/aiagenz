"use client"

import { useTheme } from "next-themes"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEffect, useState } from "react"

interface MetricPoint {
    cpu: number
    memory: number
    memoryMb: number
    timestamp: string
}

interface MetricsChartProps {
    data: MetricPoint[]
    loading?: boolean
}

export function MetricsChart({ data, loading }: MetricsChartProps) {
    const { theme } = useTheme()
    const isDark = theme === "dark"
    const [activeTab, setActiveTab] = useState("cpu")

    if (loading) {
        return (
            <Card className="h-[350px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </Card>
        )
    }

    if (!data || data.length === 0) {
        return (
            <Card className="h-[350px] flex items-center justify-center text-muted-foreground">
                No metrics data available yet.
            </Card>
        )
    }

    const formatTime = (iso: string) => {
        const date = new Date(iso)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
                    <p className="text-sm font-medium mb-1">{formatTime(label)}</p>
                    <p className="text-sm text-primary">
                        {activeTab === "cpu" ? "CPU Usage" : "Memory Usage"}: <span className="font-bold">{payload[0].value.toFixed(2)}%</span>
                    </p>
                    {activeTab === "memory" && (
                        <p className="text-xs text-muted-foreground mt-1">
                            {payload[0].payload.memoryMb.toFixed(0)} MB
                        </p>
                    )}
                </div>
            )
        }
        return null
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">Resource Usage (Last 1 Hour)</CardTitle>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[200px]">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="cpu">CPU</TabsTrigger>
                        <TabsTrigger value="memory">RAM</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} vertical={false} />
                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={formatTime}
                                stroke={isDark ? "#888" : "#666"}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke={isDark ? "#888" : "#666"}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                unit="%"
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey={activeTab === "cpu" ? "cpu" : "memory"}
                                stroke={activeTab === "cpu" ? "#3b82f6" : "#a855f7"}
                                fillOpacity={1}
                                fill={`url(#color${activeTab === "cpu" ? "Cpu" : "Mem"})`}
                                strokeWidth={2}
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
