export function cleanDialogueText(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      let cleaned = line.trim();
      cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, '');
      cleaned = cleaned.replace(/^[^：:]*[：:]\s*/, '');
      return cleaned.trim();
    })
    .filter(Boolean)
    .join('');
}

export interface DialogueLine {
  character: string;
  text: string;
}

export function parseDialogueLines(dialogue: string): DialogueLine[] {
  if (!dialogue) return [];
  return dialogue
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([^：:]*)[：:]\s*(.*)/);
      if (match) {
        const character = match[1].trim();
        let text = match[2].trim();
        text = text.replace(/[（(][^）)]*[）)]/g, '').trim();
        return { character, text };
      }
      return { character: '', text: line };
    })
    .filter(item => item.text);
}
