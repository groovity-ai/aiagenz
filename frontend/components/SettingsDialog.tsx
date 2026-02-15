"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings } from "lucide-react"

interface SettingsDialogProps {
  project: any
  onUpdate: () => void
}

const PROVIDERS = {
    google: ["google/gemini-3-flash-preview", "google/gemini-3-pro-preview"],
    openai: ["openai/gpt-4o", "openai/gpt-3.5-turbo"],
    anthropic: ["anthropic/claude-3-5-sonnet"],
    "google-antigravity": ["google-antigravity/gemini-3-pro-high", "google-antigravity/gemini-3-pro-low"]
}

export function SettingsDialog({ project, onUpdate }: SettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: project.name,
    telegramToken: "",
    apiKey: "",
    provider: project.config?.provider || "google",
    model: project.config?.model || "google/gemini-3-flash-preview"
  })

  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    // Update models when provider changes
    setAvailableModels(PROVIDERS[formData.provider as keyof typeof PROVIDERS] || [])
    // Reset model if not in new provider list
    if (!PROVIDERS[formData.provider as keyof typeof PROVIDERS]?.includes(formData.model)) {
        setFormData(prev => ({ ...prev, model: PROVIDERS[prev.provider as keyof typeof PROVIDERS]?.[0] || "" }))
    }
  }, [formData.provider])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
        const res = await fetch(`/api/projects/${project.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        })
        
        if (res.ok) {
            setOpen(false)
            onUpdate()
            alert("Project updated successfully!")
        } else {
            alert("Update failed")
        }
    } catch(e) {
        alert("Error updating project")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update configuration. Changing tokens/model will restart the agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="col-span-3"
                />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="provider" className="text-right">Provider</Label>
                <Select 
                    value={formData.provider} 
                    onValueChange={(val) => setFormData({...formData, provider: val})}
                >
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="model" className="text-right">Model</Label>
                <Select 
                    value={formData.model} 
                    onValueChange={(val) => setFormData({...formData, model: val})}
                >
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableModels.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="token" className="text-right">Telegram</Label>
                <Input
                    id="token"
                    placeholder="Leave empty to keep current"
                    value={formData.telegramToken}
                    onChange={(e) => setFormData({...formData, telegramToken: e.target.value})}
                    className="col-span-3"
                    type="password"
                />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="apikey" className="text-right">API Key</Label>
                <Input
                    id="apikey"
                    placeholder="Leave empty to keep current"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({...formData, apiKey: e.target.value})}
                    className="col-span-3"
                    type="password"
                />
            </div>
            </div>
            <DialogFooter>
            <Button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Save changes"}
            </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
