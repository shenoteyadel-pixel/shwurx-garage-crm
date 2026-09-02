"use client"

import { useState } from "react"
import { Combo } from "@/components/ui"
import { SKILL_SUGGESTIONS } from "@/lib/rbac/catalog"
import { X, Plus } from "lucide-react"

/**
 * Chip-style multi-select for technician skills / specializations.
 * Accepts suggestions from the catalog but allows any custom entry.
 * Emits the current list to a hidden input (comma-separated) so it can be
 * read straight out of the surrounding <form> as `skills`.
 */
export function SkillsPicker({
  name = "skills",
  defaultValue = [],
}: {
  name?: string
  defaultValue?: string[]
}) {
  const [skills, setSkills] = useState<string[]>(defaultValue)
  const [draft, setDraft] = useState("")

  function add(raw: string) {
    const value = raw.trim()
    if (!value) return
    if (skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setDraft("")
      return
    }
    setSkills((prev) => [...prev, value])
    setDraft("")
  }

  function remove(value: string) {
    setSkills((prev) => prev.filter((s) => s !== value))
  }

  const remaining = SKILL_SUGGESTIONS.filter(
    (s) => !skills.some((sel) => sel.toLowerCase() === s.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={skills.join(", ")} />

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {s}
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
                className="rounded-full text-primary/70 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Combo
          options={remaining}
          value={draft}
          placeholder="Add a skill and press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              add(draft)
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  )
}
