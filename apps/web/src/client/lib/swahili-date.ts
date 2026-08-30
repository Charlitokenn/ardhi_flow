const SWAHILI_MONTHS = [
    "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
    "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
]

// The confirmation letter's sample date line ("18 Agosti 2026") is a full
// Swahili date, unlike the statement's English month abbreviations.
export function formatSwahiliDate(date: Date = new Date()): string {
    return `${date.getDate()} ${SWAHILI_MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
