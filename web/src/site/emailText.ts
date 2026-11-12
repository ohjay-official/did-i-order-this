export function extractFromDomain(emailText: string): string {
  const angled = emailText.match(/From:\s*[^<\n]*<[^>@]+@([^>\s]+)>/i);
  if (angled?.[1]) return angled[1].trim().toLowerCase();
  const bare = emailText.match(/From:\s*([^\s@<>]+@([^\s>]+))/i);
  if (bare?.[2]) return bare[2].trim().toLowerCase();
  const any = emailText.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return any?.[1] ? any[1].trim().toLowerCase() : "";
}
