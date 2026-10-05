import type { RuntimeTags } from "@/lib/website/analytics"

/** The page asks for consent whenever anything (first-party or provider) may measure. */
export function consentNeeded(tags: Pick<RuntimeTags, "consentRequired" | "firstParty" | "thirdParty">): boolean {
  return tags.consentRequired && (tags.firstParty || tags.thirdParty)
}
